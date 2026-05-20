import { cooldownOn429 } from "@/lib/smartstore-bot-shield";
import { fetchSmartstoreMetaViaShoppingSearchApi } from "@/lib/fetch-smartstore-search-api";
import { fetchSmartstoreProduct } from "@/lib/fetch-smartstore-product-meta";
import { extractNaverSmartstoreProductId } from "@/lib/smartstore-url";
import {
  SMARTSTORE_UNIFIED_ACCEPT_ENCODING,
  SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
  SMARTSTORE_UNIFIED_USER_AGENT,
} from "@/lib/naver-smartstore-unified-fetch-headers";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 40;
const FETCH_TIMEOUT_MS = 12_000;
const SHOP_API = "https://openapi.naver.com/v1/search/shop.json";
const STORE_DIRECT_LIMIT_WARNING =
  "네이버 스토어 직접 요청은 제한되어 OpenAPI 기반 결과로 표시했습니다.";

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

type ProductCandidate = {
  id?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  price?: number | null;
  discountedPrice?: number | null;
  deliveryFee?: string | null;
  reviewCount?: number | null;
  rating?: number | null;
  tags?: string[] | null;
  naverShoppingId?: string | null;
  productUrl?: string | null;
};

export type StoreAnalyzeResult = {
  storeName: string;
  inputUrl: string;
  normalizedStoreUrl: string;
  productId: string | null;
  analyzedFromProductUrl: boolean;
  items: StoreAnalyzeItem[];
  source:
    | "naver-shopping-openapi"
    | "openapi-product-fallback"
    | "shopping-search-product"
    | "single-product-fallback"
    | "store-products-api"
    | "html-embedded";
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

function headers(referer: string, accept: "html" | "json"): Record<string, string> {
  return {
    Accept:
      accept === "json"
        ? "application/json, text/plain, */*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": SMARTSTORE_UNIFIED_ACCEPT_ENCODING,
    "Accept-Language": SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
    Referer: referer,
    "User-Agent": SMARTSTORE_UNIFIED_USER_AGENT,
  };
}

async function fetchTextOnce(
  url: string,
  referer: string,
  accept: "html" | "json",
  options: { swallowRateLimit?: boolean } = {}
): Promise<{ text: string | null; rateLimited: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: headers(referer, accept),
      cache: "no-store",
      redirect: "follow",
    });
    if (res.status === 429) {
      await cooldownOn429();
      if (options.swallowRateLimit) {
        return { text: null, rateLimited: true };
      }
      throw new Error("네이버 요청이 잠시 제한되었습니다. 잠시 후 다시 시도하거나 상품 URL로 분석해 주세요.");
    }
    if (!res.ok) return { text: null, rateLimited: false };
    const text = await res.text();
    if (/captcha|nprotect|보안문자|자동입력방지/i.test(text)) {
      throw new Error("네이버 보안 확인 화면이 감지되었습니다. 잠시 후 다시 시도해 주세요.");
    }
    return { text, rateLimited: false };
  } finally {
    clearTimeout(t);
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").replace(/[^\d.-]/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되어 있지 않습니다.");
  }
  return { clientId, clientSecret };
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeComparable(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = asString(obj[key]);
    if (v) return v;
  }
  return null;
}

function firstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = asNumber(obj[key]);
    if (n !== null) return n;
  }
  return null;
}

function firstDeliveryFee(obj: Record<string, unknown>): string | null {
  const direct = firstString(obj, ["deliveryFee", "deliveryFeeText", "baseDeliveryFee", "shippingFeeText"]);
  if (direct) return direct;
  const feeInfo = asRecord(obj.deliveryFeeInfo) ?? asRecord(obj.deliveryInfo);
  if (!feeInfo) return null;
  const fee = firstNumber(feeInfo, ["deliveryFee", "baseFee", "fee", "price"]);
  if (fee !== null && fee === 0) return "무료";
  if (fee !== null) return `${fee.toLocaleString()}원`;
  return firstString(feeInfo, ["deliveryFeeText", "feeText", "summary"]);
}

function extractTags(obj: Record<string, unknown>): string[] | null {
  const direct = obj.tags ?? obj.sellerTags ?? obj.productTags;
  if (Array.isArray(direct)) {
    const tags = direct
      .map((t) => (typeof t === "string" ? t.trim() : asString(t)))
      .filter((t): t is string => Boolean(t));
    return tags.length > 0 ? tags : null;
  }
  const seo = asRecord(obj.seoInfo);
  const seoTags = seo?.sellerTags;
  if (Array.isArray(seoTags)) {
    const tags = seoTags
      .map((t) => (typeof t === "string" ? t.trim() : asString(t)))
      .filter((t): t is string => Boolean(t));
    return tags.length > 0 ? tags : null;
  }
  return null;
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
  const storeKey = normalizeComparable(decodeURIComponent(info.storeName));
  const mallKey = normalizeComparable(String(it.mallName ?? ""));
  const link = String(it.link ?? "").toLowerCase();
  if (mallKey && (mallKey === storeKey || mallKey.includes(storeKey) || storeKey.includes(mallKey))) {
    return true;
  }
  return (
    link.includes(`smartstore.naver.com/${info.storeName.toLowerCase()}`) ||
    link.includes(`brand.naver.com/${info.storeName.toLowerCase()}`) ||
    link.includes(`/products/${info.productId ?? "__no_product__"}`)
  );
}

function openApiItemMatchesProductId(it: OpenApiShopItem, productId: string): boolean {
  const link = String(it.link ?? "");
  return (
    String(it.mallProductId ?? "") === productId ||
    String(it.productId ?? "") === productId ||
    link.includes(`/products/${productId}`) ||
    link.includes(`products/${productId}?`)
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
  return {
    rank,
    imageUrl: typeof it.image === "string" && it.image.trim() ? it.image.trim() : undefined,
    productName: productName || "상품명 없음",
    productUrl:
      link ||
      (mallProductId
        ? `${info.normalizedStoreUrl}/products/${mallProductId}`
        : info.productId
          ? `${info.normalizedStoreUrl}/products/${info.productId}`
          : undefined),
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

async function fetchOpenApiItems(query: string, display: number): Promise<{
  items: OpenApiShopItem[];
  rateLimited: boolean;
}> {
  const { clientId, clientSecret } = getClientCreds();
  const url = new URL(SHOP_API);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(100, Math.max(1, display))));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const raw = await res.text();
  if (res.status === 429) {
    await cooldownOn429();
    return { items: [], rateLimited: true };
  }

  let data: OpenApiShopResponse;
  try {
    data = JSON.parse(raw) as OpenApiShopResponse;
  } catch {
    return { items: [], rateLimited: false };
  }

  if (!res.ok) {
    const msg = typeof data.errorMessage === "string" ? data.errorMessage : raw.slice(0, 120);
    throw new Error(`네이버 쇼핑 검색 API 오류가 발생했습니다: ${msg}`);
  }

  return { items: Array.isArray(data.items) ? data.items : [], rateLimited: false };
}

async function analyzeFromShoppingOpenApi(
  info: StoreUrlInfo,
  limit: number
): Promise<{ items: StoreAnalyzeItem[]; warning?: string }> {
  const queries = [
    decodeURIComponent(info.storeName),
    `${decodeURIComponent(info.storeName)} 스마트스토어`,
  ];
  const seen = new Set<string>();
  const collected: OpenApiShopItem[] = [];
  let rateLimited = false;

  for (const query of queries) {
    const result = await fetchOpenApiItems(query, Math.min(100, limit + 40));
    rateLimited ||= result.rateLimited;
    if (result.rateLimited) break;

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

  const warning = rateLimited
    ? "네이버 쇼핑 검색 요청이 잠시 제한되어 일부 결과만 표시될 수 있습니다."
    : undefined;
  return {
    items: collected.slice(0, limit).map((it, idx) => openApiItemToAnalyzeItem(it, idx + 1, info)),
    warning,
  };
}

async function analyzeProductFromShoppingOpenApi(
  info: StoreUrlInfo
): Promise<{ items: StoreAnalyzeItem[]; rateLimited: boolean }> {
  if (!info.productId) return { items: [], rateLimited: false };
  const result = await fetchOpenApiItems(info.productId, 20);
  if (result.rateLimited) return { items: [], rateLimited: true };
  const matched = result.items.find((it) => !looksLikeAd(it) && openApiItemMatchesProductId(it, info.productId!));
  return {
    items: matched ? [openApiItemToAnalyzeItem(matched, 1, info)] : [],
    rateLimited: false,
  };
}

function imageFromObject(obj: Record<string, unknown>): string | null {
  const direct = firstString(obj, ["imageUrl", "image", "thumbnailUrl", "representImageUrl"]);
  if (direct) return direct;
  const representImage = asRecord(obj.representImage);
  return representImage ? firstString(representImage, ["url", "imageUrl", "thumbnailUrl"]) : null;
}

function categoryFromObject(obj: Record<string, unknown>): string | null {
  const direct = firstString(obj, ["category", "categoryName", "wholeCategoryName", "categoryText"]);
  if (direct) return direct;
  const cat = asRecord(obj.category);
  if (!cat) return null;
  return firstString(cat, ["wholeCategoryName", "name", "categoryName"]);
}

function productUrlFromObject(obj: Record<string, unknown>, info: StoreUrlInfo): string | null {
  const direct = firstString(obj, ["productUrl", "url", "mallProductUrl", "link"]);
  if (direct?.startsWith("http")) return direct;
  const id = firstString(obj, [
    "channelProductNo",
    "productNo",
    "id",
    "productId",
    "originProductNo",
    "saleProductNo",
  ]);
  if (!id || !/^\d+$/.test(id)) return null;
  const base = info.origin === "brand" ? "https://brand.naver.com" : "https://smartstore.naver.com";
  return `${base}/${encodeURIComponent(info.storeName)}/products/${encodeURIComponent(id)}`;
}

function candidateFromObject(obj: Record<string, unknown>, info: StoreUrlInfo): ProductCandidate | null {
  const name = firstString(obj, ["name", "productName", "title", "dispName"]);
  const id = firstString(obj, [
    "channelProductNo",
    "productNo",
    "id",
    "productId",
    "originProductNo",
    "saleProductNo",
  ]);
  const imageUrl = imageFromObject(obj);
  const price = firstNumber(obj, ["salePrice", "price", "mobileSalePrice", "saleAmount"]);
  const discountedPrice = firstNumber(obj, [
    "discountedPrice",
    "discountedSalePrice",
    "mobileDiscountedSalePrice",
    "benefitPrice",
  ]);
  const productUrl = productUrlFromObject(obj, info);

  if (!name || (!id && !productUrl && !imageUrl)) return null;
  return {
    id,
    name,
    imageUrl,
    category: categoryFromObject(obj),
    price,
    discountedPrice,
    deliveryFee: firstDeliveryFee(obj),
    reviewCount: firstNumber(obj, [
      "reviewCount",
      "reviewAmount",
      "totalReviewCount",
      "reviewTotalCount",
    ]),
    rating: firstNumber(obj, [
      "averageReviewScore",
      "reviewScore",
      "rating",
      "reviewRating",
      "productReviewScore",
    ]),
    tags: extractTags(obj),
    naverShoppingId: firstString(obj, [
      "naverShoppingProductId",
      "shoppingProductNo",
      "naverShoppingId",
    ]),
    productUrl,
  };
}

function collectProductCandidates(root: unknown, info: StoreUrlInfo, limit: number): ProductCandidate[] {
  const out: ProductCandidate[] = [];
  const seen = new Set<unknown>();
  const stack: unknown[] = [root];

  while (stack.length > 0 && out.length < limit * 3) {
    const cur = stack.pop();
    if (!cur || seen.has(cur)) continue;
    if (typeof cur === "object") seen.add(cur);

    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }

    const obj = asRecord(cur);
    if (!obj) continue;
    const candidate = candidateFromObject(obj, info);
    if (candidate) out.push(candidate);
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }

  return out;
}

function parseJsonFromScripts(html: string): unknown[] {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? "");
  const parsed: unknown[] = [];
  for (const script of scripts) {
    const t = script.trim();
    if (!t) continue;
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        parsed.push(JSON.parse(t) as unknown);
        continue;
      } catch {
        /* continue */
      }
    }
    const nextData = t.match(/self\.__next_f\.push\(\s*(\[.+\])\s*\)/s);
    if (nextData?.[1]) {
      try {
        parsed.push(JSON.parse(nextData[1]) as unknown);
      } catch {
        /* continue */
      }
    }
  }
  return parsed;
}

function normalizeItems(candidates: ProductCandidate[], info: StoreUrlInfo, limit: number): StoreAnalyzeItem[] {
  const seen = new Set<string>();
  const out: StoreAnalyzeItem[] = [];
  for (const c of candidates) {
    const key = c.productUrl || c.id || c.name || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      rank: out.length + 1,
      imageUrl: c.imageUrl ?? undefined,
      productName: c.name || "상품명 없음",
      productUrl: c.productUrl ?? undefined,
      category: c.category ?? null,
      price: c.price ?? null,
      discountedPrice: c.discountedPrice ?? null,
      deliveryFee: c.deliveryFee ?? null,
      sixMonthSales: null,
      reviewCount: c.reviewCount ?? null,
      rating: c.rating ?? null,
      score: null,
      tags: c.tags ?? null,
      naverShoppingId: c.naverShoppingId ?? c.id ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function analyzeFromStoreHtml(
  info: StoreUrlInfo,
  limit: number
): Promise<{ items: StoreAnalyzeItem[]; rateLimited: boolean }> {
  const { text: html, rateLimited } = await fetchTextOnce(info.normalizedStoreUrl, info.normalizedStoreUrl, "html", {
    swallowRateLimit: true,
  });
  if (!html) return { items: [], rateLimited };
  const candidates = parseJsonFromScripts(html).flatMap((json) =>
    collectProductCandidates(json, info, limit)
  );
  return { items: normalizeItems(candidates, info, limit), rateLimited };
}

function buildStoreProductsApiUrl(info: StoreUrlInfo, limit: number): string {
  const base =
    info.origin === "brand"
      ? `https://brand.naver.com/n/v2/channels/${encodeURIComponent(info.storeName)}/products`
      : `https://smartstore.naver.com/i/v2/channels/${encodeURIComponent(info.storeName)}/products`;
  const u = new URL(base);
  u.searchParams.set("categorySearchType", "STDCATEGORY");
  u.searchParams.set("sortType", "POPULAR");
  u.searchParams.set("page", "1");
  u.searchParams.set("pageSize", String(limit));
  return u.toString();
}

async function analyzeFromStoreProductsApi(
  info: StoreUrlInfo,
  limit: number
): Promise<{ items: StoreAnalyzeItem[]; rateLimited: boolean }> {
  const apiUrl = buildStoreProductsApiUrl(info, limit);
  const { text, rateLimited } = await fetchTextOnce(apiUrl, info.normalizedStoreUrl, "json", {
    swallowRateLimit: true,
  });
  if (!text) return { items: [], rateLimited };
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { items: [], rateLimited };
  }
  return { items: normalizeItems(collectProductCandidates(json, info, limit), info, limit), rateLimited };
}

async function analyzeFromShoppingSearchProductMeta(
  info: StoreUrlInfo
): Promise<{ items: StoreAnalyzeItem[]; rateLimited: boolean }> {
  if (!info.productId) return { items: [], rateLimited: false };
  const productUrl = `${info.normalizedStoreUrl}/products/${encodeURIComponent(info.productId)}`;
  const meta = await fetchSmartstoreMetaViaShoppingSearchApi({
    productId: info.productId,
    productUrl,
    attemptedChannelSlug: info.storeName,
  });
  if (!meta.name && !meta.thumbnailLink && !meta.category) {
    return { items: [], rateLimited: false };
  }
  return {
    items: [
      {
        rank: 1,
        imageUrl: meta.thumbnailLink ?? undefined,
        productName: meta.name?.trim() || "상품명 없음",
        productUrl: meta.matchedLink ?? productUrl,
        category: meta.category,
        price: meta.price,
        discountedPrice: meta.price,
        deliveryFee: null,
        sixMonthSales: null,
        reviewCount: meta.reviewCount,
        rating: meta.reviewRating,
        score: null,
        tags: null,
        naverShoppingId: meta.matchedProductId ?? info.productId,
      },
    ],
    rateLimited: false,
  };
}

async function analyzeSingleProductFallback(info: StoreUrlInfo): Promise<StoreAnalyzeItem[]> {
  if (!info.productId) return [];
  const productUrl = `${info.normalizedStoreUrl}/products/${encodeURIComponent(info.productId)}`;
  try {
    const meta = await fetchSmartstoreProduct(productUrl);
    if (!meta.name.trim() && !meta.imageUrl && !meta.category) return [];
    return [
      {
        rank: 1,
        imageUrl: meta.imageUrl ?? undefined,
        productName: meta.name.trim() || "상품명 없음",
        productUrl,
        category: meta.category,
        price: null,
        discountedPrice: null,
        deliveryFee: null,
        sixMonthSales: null,
        reviewCount: null,
        rating: null,
        score: null,
        tags: null,
        naverShoppingId: info.productId,
      },
    ];
  } catch {
    return [];
  }
}

function joinWarnings(parts: Array<string | undefined>): string | undefined {
  const merged = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return merged.length > 0 ? merged.join(" ") : undefined;
}

function buildStoreAnalyzeResult(
  info: StoreUrlInfo,
  items: StoreAnalyzeItem[],
  source: StoreAnalyzeResult["source"],
  warning?: string
): StoreAnalyzeResult {
  return {
    storeName: info.storeName,
    inputUrl: info.inputUrl,
    normalizedStoreUrl: info.normalizedStoreUrl,
    productId: info.productId,
    analyzedFromProductUrl: info.analyzedFromProductUrl,
    items,
    source,
    warning,
  };
}

export async function analyzeSmartstoreStore(input: {
  url: string;
  limit?: number;
}): Promise<StoreAnalyzeResult> {
  const info = parseSmartstoreStoreUrl(input.url);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const warnings: string[] = [];
  let sawRateLimit = false;

  const fromOpenApi = await analyzeFromShoppingOpenApi(info, limit);
  if (fromOpenApi.warning) warnings.push(fromOpenApi.warning);
  if (fromOpenApi.items.length > 0) {
    return buildStoreAnalyzeResult(
      info,
      fromOpenApi.items,
      "naver-shopping-openapi",
      joinWarnings(warnings)
    );
  }
  if (fromOpenApi.warning) sawRateLimit = true;

  const openApiProduct = await analyzeProductFromShoppingOpenApi(info);
  if (openApiProduct.rateLimited) {
    sawRateLimit = true;
    warnings.push("네이버 쇼핑 검색 요청이 잠시 제한되어 일부 결과만 표시될 수 있습니다.");
  }
  if (openApiProduct.items.length > 0) {
    return buildStoreAnalyzeResult(
      info,
      openApiProduct.items,
      "openapi-product-fallback",
      joinWarnings(warnings)
    );
  }

  const searchMeta = await analyzeFromShoppingSearchProductMeta(info);
  if (searchMeta.rateLimited) sawRateLimit = true;
  if (searchMeta.items.length > 0) {
    return buildStoreAnalyzeResult(
      info,
      searchMeta.items,
      "shopping-search-product",
      joinWarnings(warnings)
    );
  }

  const single = await analyzeSingleProductFallback(info);
  if (single.length > 0) {
    return buildStoreAnalyzeResult(info, single, "single-product-fallback", joinWarnings(warnings));
  }

  const fromApi = await analyzeFromStoreProductsApi(info, limit);
  if (fromApi.rateLimited) {
    sawRateLimit = true;
    warnings.push(STORE_DIRECT_LIMIT_WARNING);
  }
  if (fromApi.items.length > 0) {
    return buildStoreAnalyzeResult(
      info,
      fromApi.items,
      "store-products-api",
      joinWarnings(warnings)
    );
  }

  const fromHtml = await analyzeFromStoreHtml(info, limit);
  if (fromHtml.rateLimited) {
    sawRateLimit = true;
    warnings.push(STORE_DIRECT_LIMIT_WARNING);
  }
  if (fromHtml.items.length > 0) {
    return buildStoreAnalyzeResult(info, fromHtml.items, "html-embedded", joinWarnings(warnings));
  }

  if (sawRateLimit) {
    throw new Error("네이버 요청이 잠시 제한되었습니다. 잠시 후 다시 시도하거나 상품 URL로 분석해 주세요.");
  }

  throw new Error("상품 목록을 찾지 못했습니다. 상품 URL로 다시 분석해 주세요.");
}
