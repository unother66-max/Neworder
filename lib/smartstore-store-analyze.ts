import { extractNaverSmartstoreProductId } from "@/lib/smartstore-url";

/**
 * /smartstore/store-analyze 전용 안정화 로직.
 * - 네이버 스마트스토어/브랜드스토어의 i/v2, n/v2 직접 API와 HTML scraping은 사용하지 않습니다.
 *   (반복적인 429/AbortError 로 인해 서비스 전체가 멈추는 문제 회피)
 * - 입력 URL 에서 storeName, productId, normalizedStoreUrl 만 추출합니다.
 * - 결과 매칭은 네이버 쇼핑 OpenAPI 한 곳만 사용합니다.
 * - OpenAPI 가 429 거나 매칭이 비어도 throw 하지 않고 items: [] + warning 으로 200 응답합니다.
 */

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 40;
const OPENAPI_FETCH_TIMEOUT_MS = 8_000;
const SHOP_API = "https://openapi.naver.com/v1/search/shop.json";

const EMPTY_RESULT_WARNING =
  "네이버 OpenAPI 에서 해당 스토어의 상품을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.";
const OPENAPI_RATE_LIMITED_WARNING =
  "네이버 쇼핑 검색 요청이 잠시 제한되어 결과가 비어 있을 수 있습니다.";
const OPENAPI_ERROR_WARNING =
  "네이버 쇼핑 검색 API 호출이 실패해 결과가 비어 있을 수 있습니다.";
const OPENAPI_MISSING_CREDS_WARNING =
  "네이버 OpenAPI 자격 증명이 설정되어 있지 않아 결과를 가져오지 못했습니다.";

export type StoreAnalyzeItem = {
  rank: number;
  imageUrl?: string;
  productName: string;
  productUrl?: string;
  category?: string | null;
  price?: number | null;
  discountedPrice?: number | null;
  deliveryFee?: string | null;
  sixMonthSales?: number | null;
  reviewCount?: number | null;
  rating?: number | null;
  score?: number | null;
  tags?: string[] | null;
  naverShoppingId?: string | null;
};

export type StoreUrlInfo = {
  inputUrl: string;
  normalizedStoreUrl: string;
  origin: "smartstore" | "brand";
  storeName: string;
  productId: string | null;
  analyzedFromProductUrl: boolean;
};

export type StoreAnalyzeResult = {
  storeName: string;
  inputUrl: string;
  normalizedStoreUrl: string;
  productId: string | null;
  analyzedFromProductUrl: boolean;
  items: StoreAnalyzeItem[];
  source: "naver-shopping-openapi" | "openapi-product-fallback" | "empty";
  warning?: string;
};

type OpenApiShopItem = {
  title?: string;
  link?: string;
  image?: string;
  lprice?: string;
  hprice?: string;
  mallName?: string;
  productId?: string | number;
  mallProductId?: string | number;
  category1?: string;
  category2?: string;
  category3?: string;
  category4?: string;
  adId?: string | number;
  ad?: boolean;
  isAd?: boolean;
};

type OpenApiShopResponse = {
  items?: OpenApiShopItem[];
  errorMessage?: string;
};

type OpenApiFetchOutcome =
  | { ok: true; items: OpenApiShopItem[] }
  | { ok: false; reason: "rate-limited" | "missing-creds" | "error" };

function withHttps(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function parseSmartstoreStoreUrl(rawUrl: string): StoreUrlInfo {
  const inputUrl = rawUrl.trim();
  if (!inputUrl) throw new Error("분석할 스마트스토어 또는 상품 URL을 입력해 주세요.");

  let u: URL;
  try {
    u = new URL(withHttps(inputUrl));
  } catch {
    throw new Error("스마트스토어 또는 브랜드스토어 URL 형식으로 입력해 주세요.");
  }

  u.search = "";
  u.hash = "";

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const bareHost = host.replace(/^m\./, "");
  const origin =
    bareHost === "smartstore.naver.com" ? "smartstore" : bareHost === "brand.naver.com" ? "brand" : null;
  if (!origin) {
    throw new Error("smartstore.naver.com 또는 brand.naver.com URL만 분석할 수 있습니다.");
  }

  const segs = u.pathname.split("/").filter(Boolean);
  const productIndex = segs.indexOf("products");
  const storeSlugRaw = productIndex > 0 ? segs[productIndex - 1] : segs[0];
  if (!storeSlugRaw || storeSlugRaw === "products") {
    throw new Error("URL에서 스토어명을 찾지 못했습니다.");
  }

  let storeName = storeSlugRaw;
  try {
    storeName = decodeURIComponent(storeSlugRaw);
  } catch {
    storeName = storeSlugRaw;
  }

  const productId =
    productIndex >= 0 && /^\d+$/.test(segs[productIndex + 1] ?? "")
      ? segs[productIndex + 1]
      : extractNaverSmartstoreProductId(inputUrl);

  const storeBase = origin === "brand" ? "https://brand.naver.com" : "https://smartstore.naver.com";
  const normalizedStoreUrl = `${storeBase}/${encodeURIComponent(storeName)}`;

  return {
    inputUrl,
    normalizedStoreUrl,
    origin,
    storeName,
    productId,
    analyzedFromProductUrl: Boolean(productId),
  };
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").replace(/[^\d.-]/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getClientCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeComparable(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function joinOpenApiCategory(it: OpenApiShopItem): string | null {
  const parts = [it.category1, it.category2, it.category3, it.category4]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" > ") : null;
}

function looksLikeAd(it: OpenApiShopItem): boolean {
  if (it.ad === true || it.isAd === true) return true;
  if (it.adId != null && String(it.adId).trim()) return true;
  return false;
}

function openApiItemMatchesStore(it: OpenApiShopItem, info: StoreUrlInfo): boolean {
  const storeKey = normalizeComparable(info.storeName);
  const mallKey = normalizeComparable(String(it.mallName ?? ""));
  const link = String(it.link ?? "").toLowerCase();
  if (mallKey && (mallKey === storeKey || mallKey.includes(storeKey) || storeKey.includes(mallKey))) {
    return true;
  }
  const slug = info.storeName.toLowerCase();
  return (
    link.includes(`smartstore.naver.com/${slug}`) ||
    link.includes(`brand.naver.com/${slug}`) ||
    Boolean(info.productId && link.includes(`/products/${info.productId}`))
  );
}

function openApiItemMatchesProductId(it: OpenApiShopItem, productId: string): boolean {
  const link = String(it.link ?? "");
  return (
    String(it.mallProductId ?? "") === productId ||
    String(it.productId ?? "") === productId ||
    link.includes(`/products/${productId}`)
  );
}

function openApiItemToAnalyzeItem(
  it: OpenApiShopItem,
  rank: number,
  info: StoreUrlInfo
): StoreAnalyzeItem {
  const productName = stripHtmlTags(typeof it.title === "string" ? it.title : "");
  const link = typeof it.link === "string" && it.link.trim() ? it.link.trim() : undefined;
  const listPrice = asNumber(it.lprice);
  const highPrice = asNumber(it.hprice);
  const discountedPrice =
    listPrice !== null && highPrice !== null && highPrice > 0 && highPrice < listPrice ? highPrice : null;
  const mallProductId =
    it.mallProductId != null && String(it.mallProductId).trim()
      ? String(it.mallProductId).trim()
      : null;
  const fallbackProductUrl = mallProductId
    ? `${info.normalizedStoreUrl}/products/${mallProductId}`
    : info.productId
      ? `${info.normalizedStoreUrl}/products/${info.productId}`
      : undefined;
  return {
    rank,
    imageUrl: typeof it.image === "string" && it.image.trim() ? it.image.trim() : undefined,
    productName: productName || "상품명 없음",
    productUrl: link || fallbackProductUrl,
    category: joinOpenApiCategory(it),
    price: listPrice ?? highPrice,
    discountedPrice,
    deliveryFee: null,
    sixMonthSales: null,
    reviewCount: null,
    rating: null,
    score: null,
    tags: null,
    naverShoppingId:
      it.productId != null && String(it.productId).trim() ? String(it.productId).trim() : null,
  };
}

async function fetchOpenApiItemsSafe(query: string, display: number): Promise<OpenApiFetchOutcome> {
  const creds = getClientCreds();
  if (!creds) return { ok: false, reason: "missing-creds" };

  const url = new URL(SHOP_API);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(100, Math.max(1, display))));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OPENAPI_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        "X-Naver-Client-Id": creds.clientId,
        "X-Naver-Client-Secret": creds.clientSecret,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.status === 429) {
      return { ok: false, reason: "rate-limited" };
    }

    const raw = await res.text();

    if (!res.ok) {
      console.warn("[smartstore-store-analyze] openapi non-ok", {
        status: res.status,
        bodyHead: raw.slice(0, 160),
      });
      return { ok: false, reason: "error" };
    }

    let data: OpenApiShopResponse;
    try {
      data = JSON.parse(raw) as OpenApiShopResponse;
    } catch {
      return { ok: false, reason: "error" };
    }

    return { ok: true, items: Array.isArray(data.items) ? data.items : [] };
  } catch (e) {
    console.warn("[smartstore-store-analyze] openapi fetch failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}

type CollectedItems = {
  items: StoreAnalyzeItem[];
  warning?: string;
  source: "naver-shopping-openapi" | "openapi-product-fallback" | "empty";
};

async function collectFromStoreOpenApi(
  info: StoreUrlInfo,
  limit: number
): Promise<{ items: OpenApiShopItem[]; warning?: string }> {
  const queries = [info.storeName, `${info.storeName} 스마트스토어`];
  const seen = new Set<string>();
  const collected: OpenApiShopItem[] = [];
  let lastWarning: string | undefined;

  for (const query of queries) {
    const result = await fetchOpenApiItemsSafe(query, Math.min(100, limit + 40));
    if (!result.ok) {
      lastWarning =
        result.reason === "rate-limited"
          ? OPENAPI_RATE_LIMITED_WARNING
          : result.reason === "missing-creds"
            ? OPENAPI_MISSING_CREDS_WARNING
            : OPENAPI_ERROR_WARNING;
      if (result.reason === "missing-creds") break;
      continue;
    }

    for (const it of result.items) {
      if (looksLikeAd(it)) continue;
      if (!openApiItemMatchesStore(it, info)) continue;
      const key = String(it.link ?? it.productId ?? it.mallProductId ?? it.title ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collected.push(it);
      if (collected.length >= limit) break;
    }
    if (collected.length >= limit) break;
  }

  return { items: collected.slice(0, limit), warning: lastWarning };
}

async function collectFromProductIdOpenApi(
  info: StoreUrlInfo
): Promise<{ item: OpenApiShopItem | null; warning?: string }> {
  if (!info.productId) return { item: null };
  const result = await fetchOpenApiItemsSafe(info.productId, 20);
  if (!result.ok) {
    const warning =
      result.reason === "rate-limited"
        ? OPENAPI_RATE_LIMITED_WARNING
        : result.reason === "missing-creds"
          ? OPENAPI_MISSING_CREDS_WARNING
          : OPENAPI_ERROR_WARNING;
    return { item: null, warning };
  }
  const matched = result.items.find(
    (it) => !looksLikeAd(it) && openApiItemMatchesProductId(it, info.productId!)
  );
  return { item: matched ?? null };
}

function joinWarnings(parts: Array<string | undefined>): string | undefined {
  const merged = Array.from(
    new Set(parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p)))
  );
  return merged.length > 0 ? merged.join(" ") : undefined;
}

async function gatherOpenApiItems(info: StoreUrlInfo, limit: number): Promise<CollectedItems> {
  const warnings: string[] = [];

  const store = await collectFromStoreOpenApi(info, limit);
  if (store.warning) warnings.push(store.warning);
  if (store.items.length > 0) {
    return {
      items: store.items.map((it, idx) => openApiItemToAnalyzeItem(it, idx + 1, info)),
      warning: joinWarnings(warnings),
      source: "naver-shopping-openapi",
    };
  }

  const product = await collectFromProductIdOpenApi(info);
  if (product.warning) warnings.push(product.warning);
  if (product.item) {
    return {
      items: [openApiItemToAnalyzeItem(product.item, 1, info)],
      warning: joinWarnings(warnings),
      source: "openapi-product-fallback",
    };
  }

  warnings.push(EMPTY_RESULT_WARNING);
  return { items: [], warning: joinWarnings(warnings), source: "empty" };
}

export async function analyzeSmartstoreStore(input: {
  url: string;
  limit?: number;
}): Promise<StoreAnalyzeResult> {
  const info = parseSmartstoreStoreUrl(input.url);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

  let collected: CollectedItems;
  try {
    collected = await gatherOpenApiItems(info, limit);
  } catch (e) {
    console.warn("[smartstore-store-analyze] gather failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    collected = {
      items: [],
      warning: OPENAPI_ERROR_WARNING,
      source: "empty",
    };
  }

  return {
    storeName: info.storeName,
    inputUrl: info.inputUrl,
    normalizedStoreUrl: info.normalizedStoreUrl,
    productId: info.productId,
    analyzedFromProductUrl: info.analyzedFromProductUrl,
    items: collected.items,
    source: collected.source,
    warning: collected.warning,
  };
}
