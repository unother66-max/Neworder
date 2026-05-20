import {
  cooldownOn429,
  isSmartstoreNaverRateLimitedError,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";
import {
  buildNaverJsonFetchHeadersUnified,
  buildSmartstoreMobileDocumentFetchHeaders,
  loadSystemConfigNaverCookie,
  SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
  SMARTSTORE_UNIFIED_USER_AGENT,
} from "@/lib/naver-smartstore-unified-fetch-headers";
import {
  fetchSmartstoreMetaViaShoppingSearchApi,
  isSmartstoreShoppingSearchConfigured,
} from "@/lib/fetch-smartstore-search-api";

const LOG_P = "[smartstore-review-fetcher-lite]";
const BLOCKED_HTML_PATTERNS = [
  /captcha/i,
  /자동입력\s*방지/i,
  /비정상적인\s*접근/i,
  /접근이\s*제한/i,
  /로그인(이|후)\s*필요/i,
];
const NOT_FOUND_HTML_PATTERNS = [
  /상품을\s*찾을\s*수\s*없/i,
  /페이지를\s*찾을\s*수\s*없/i,
  /존재하지\s*않는\s*상품/i,
  /삭제된\s*상품/i,
  /판매\s*종료/i,
  /not\s+found/i,
];

type ProductUrlKind = "SMARTSTORE" | "BRAND" | "CATALOG" | "UNKNOWN";
type ReviewSummaryCandidate = {
  url: string;
  source: string;
  verifiedBy?: "html" | "script" | "embedded-json" | null;
  disabledReason?: string | null;
};

type ParsedReviewSummary = SmartstoreReviewSnapshot["summary"] & {
  hasReviewData: boolean;
};

type DetectedReviewSummarySource = {
  reviewProductId: string | null;
  leafCategoryId: number | null;
  verifiedSummaryUrl: string | null;
  discoveredSource: "html-script" | "network-confirmed-pattern" | null;
  productReviewInfo: Record<string, unknown> | null;
  recentProductReviewInfo: Record<string, unknown> | null;
  identifiers: Array<{ path: string; key: string; value: unknown }>;
};

const REVIEW_SOURCE_KEYWORDS =
  /(review|reviews|score|average|total|product-review|productReview|merchantNo|originProductNo|channelNo|accountNo|productNo|nvMid|catalogue|catalog|summary)/i;

const blockedReviewSourceUrls = new Set<string>();

export class SmartstoreReviewProductNotFoundError extends Error {
  constructor(message = "상품이 존재하지 않거나 접근할 수 없습니다.") {
    super(message);
    this.name = "SmartstoreReviewProductNotFoundError";
  }
}

export class SmartstoreReviewBlockedError extends Error {
  constructor(message = "네이버 응답이 차단되어 리뷰 데이터를 가져오지 못했습니다.") {
    super(message);
    this.name = "SmartstoreReviewBlockedError";
  }
}

export class SmartstoreReviewParseError extends Error {
  constructor(message = "리뷰 데이터 파싱에 실패했습니다.") {
    super(message);
    this.name = "SmartstoreReviewParseError";
  }
}

export type SmartstoreRecentReview = {
  reviewKey: string;
  postedAt: Date | null;
  rating: number | null;
  author: string | null;
  content: string;
};

export type SmartstoreReviewSnapshot = {
  productPageUrl: string;
  summary: {
    reviewCount: number | null;
    reviewRating: number | null;
    photoVideoReviewCount: number | null;
    monthlyUseReviewCount: number | null;
    repurchaseReviewCount: number | null;
    storePickReviewCount: number | null;
    starScoreSummary: Record<"1" | "2" | "3" | "4" | "5", number> | null;
  };
  recentReviews: SmartstoreRecentReview[];
};

function parseOptionalNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseOptionalNonNegativeInt(v: unknown): number | null {
  const n = parseOptionalNumber(v);
  if (n == null) return null;
  return Math.max(0, Math.trunc(n));
}

function collectValuesByKeys(root: unknown, keys: readonly string[]): unknown[] {
  const wanted = new Set(keys);
  const out: unknown[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown) => {
    if (node == null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (wanted.has(key)) out.push(value);
      if (value != null && typeof value === "object") walk(value);
    }
  };

  walk(root);
  return out;
}

function asPlainRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function collectRecordsByKey(
  root: unknown,
  targetKey: string,
  limit = 10
): Array<{ path: string; value: Record<string, unknown> }> {
  const out: Array<{ path: string; value: Record<string, unknown> }> = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string) => {
    if (out.length >= limit) return;
    if (node == null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, 40); i += 1) {
        walk(node[i], `${path}[${i}]`);
        if (out.length >= limit) return;
      }
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      const rec = asPlainRecord(value);
      if (key === targetKey && rec) {
        out.push({ path: nextPath, value: rec });
        if (out.length >= limit) return;
      }
      if (value != null && typeof value === "object") walk(value, nextPath);
      if (out.length >= limit) return;
    }
  };

  walk(root, "");
  return out;
}

function collectFirstNumberWithPath(
  root: unknown,
  keys: readonly string[]
): { path: string; key: string; value: number } | null {
  const wanted = new Set(keys);
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string): { path: string; key: string; value: number } | null => {
    if (node == null || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, 80); i += 1) {
        const found = walk(node[i], `${path}[${i}]`);
        if (found) return found;
      }
      return null;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (wanted.has(key)) {
        const n = parseOptionalNonNegativeInt(value);
        if (n != null) return { path: nextPath, key, value: n };
      }
      const found = walk(value, nextPath);
      if (found) return found;
    }
    return null;
  };

  return walk(root, "");
}

function collectReviewRelatedEntries(
  root: unknown,
  limit = 80
): Array<{ path: string; key: string; value: unknown }> {
  const out: Array<{ path: string; key: string; value: unknown }> = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string) => {
    if (out.length >= limit) return;
    if (node == null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < Math.min(node.length, 20); i += 1) {
        walk(node[i], `${path}[${i}]`);
        if (out.length >= limit) return;
      }
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (REVIEW_SOURCE_KEYWORDS.test(key)) {
        out.push({
          path: nextPath,
          key,
          value:
            typeof value === "string" || typeof value === "number" || typeof value === "boolean"
              ? value
              : Array.isArray(value)
              ? `[array:${value.length}]`
              : value && typeof value === "object"
              ? "[object]"
              : value,
        });
        if (out.length >= limit) return;
      }
      if (typeof value === "string" && REVIEW_SOURCE_KEYWORDS.test(value)) {
        out.push({ path: nextPath, key, value: value.slice(0, 240) });
        if (out.length >= limit) return;
      }
      if (value != null && typeof value === "object") walk(value, nextPath);
      if (out.length >= limit) return;
    }
  };

  walk(root, "");
  return out;
}

function dedupeReviewTraceEntries(
  entries: Array<{ path: string; key: string; value: unknown }>
): Array<{ path: string; key: string; value: unknown }> {
  const seen = new Set<string>();
  const out: Array<{ path: string; key: string; value: unknown }> = [];
  for (const e of entries) {
    const sig = `${e.path}:${e.key}:${String(e.value)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(e);
  }
  return out;
}

function pickFirstNumber(root: unknown, keys: readonly string[]): number | null {
  for (const value of collectValuesByKeys(root, keys)) {
    const n = parseOptionalNumber(value);
    if (n != null) return n;
  }
  return null;
}

function pickFirstInt(root: unknown, keys: readonly string[]): number | null {
  for (const value of collectValuesByKeys(root, keys)) {
    const n = parseOptionalNonNegativeInt(value);
    if (n != null) return n;
  }
  return null;
}

function parseStarScoreSummary(root: unknown): Record<"1" | "2" | "3" | "4" | "5", number> | null {
  const summary = {
    "1": pickFirstInt(root, ["score1ReviewCount", "score1Count"]) ?? 0,
    "2": pickFirstInt(root, ["score2ReviewCount", "score2Count"]) ?? 0,
    "3": pickFirstInt(root, ["score3ReviewCount", "score3Count"]) ?? 0,
    "4": pickFirstInt(root, ["score4ReviewCount", "score4Count"]) ?? 0,
    "5": pickFirstInt(root, ["score5ReviewCount", "score5Count"]) ?? 0,
  };
  return Object.values(summary).some((n) => n > 0) ? summary : null;
}

function parseReviewSummaryFromUnknown(root: unknown): ParsedReviewSummary {
  const reviewCount = pickFirstInt(root, [
    "reviewCount",
    "totalReviewCount",
    "totalCount",
    "reviewTotalCount",
  ]);
  const reviewRating = pickFirstNumber(root, [
    "reviewRating",
    "averageReviewScore",
    "averageScore",
    "score",
    "reviewScore",
  ]);

  let photoVideoReviewCount = pickFirstInt(root, [
    "photoVideoReviewCount",
    "photoReviewCount",
    "mediaReviewCount",
    "photoCount",
  ]);
  const videoReviewCount = pickFirstInt(root, ["videoReviewCount", "videoCount"]);
  if (photoVideoReviewCount != null && videoReviewCount != null) {
    photoVideoReviewCount += videoReviewCount;
  }

  const monthlyUseReviewCount = pickFirstInt(root, [
    "afterUseReviewCount",
    "monthReviewCount",
    "monthlyReviewCount",
  ]);
  const repurchaseReviewCount = pickFirstInt(root, [
    "repurchaseReviewCount",
    "repurchaseCount",
  ]);
  const storePickReviewCount = pickFirstInt(root, [
    "storePickReviewCount",
    "storePickCount",
  ]);
  const starScoreSummary = parseStarScoreSummary(root);

  const hasReviewData = [
    reviewCount,
    reviewRating,
    photoVideoReviewCount,
    monthlyUseReviewCount,
    repurchaseReviewCount,
    storePickReviewCount,
    starScoreSummary,
  ].some((v) => v != null);

  return {
    reviewCount,
    reviewRating,
    photoVideoReviewCount,
    monthlyUseReviewCount,
    repurchaseReviewCount,
    storePickReviewCount,
    starScoreSummary,
    hasReviewData,
  };
}

function buildVerifiedProductSummaryUrl(input: {
  productUrlKind: ProductUrlKind;
  reviewProductId: string;
  leafCategoryId: number;
}): string {
  const origin =
    input.productUrlKind === "BRAND"
      ? "https://brand.naver.com/n"
      : "https://smartstore.naver.com/i";
  const u = new URL(
    `${origin}/v1/contents/reviews/product-summary/${encodeURIComponent(input.reviewProductId)}`
  );
  u.searchParams.set("leafCategoryId", String(input.leafCategoryId));
  return u.toString();
}

function buildProductDetailSourceUrl(input: {
  productUrlKind: ProductUrlKind;
  channelSlug: string | null;
  urlProductId: string;
}): string | null {
  if (!input.channelSlug || !/^\d+$/.test(input.urlProductId)) return null;
  const slug = encodeURIComponent(input.channelSlug);
  const pid = encodeURIComponent(input.urlProductId);
  if (input.productUrlKind === "BRAND") {
    return `https://brand.naver.com/n/v2/channels/${slug}/products/${pid}?withWindow=false`;
  }
  if (input.productUrlKind === "SMARTSTORE") {
    return `https://smartstore.naver.com/i/v2/channels/${slug}/products/${pid}?withWindow=false`;
  }
  return null;
}

async function tryDetectReviewSummarySourceFromProductDetailApi(input: {
  productUrl: string;
  urlProductId: string;
  productUrlKind: ProductUrlKind;
  channelSlug: string | null;
  naverCookie: string;
}): Promise<DetectedReviewSummarySource | null> {
  const sourceUrl = buildProductDetailSourceUrl({
    productUrlKind: input.productUrlKind,
    channelSlug: input.channelSlug,
    urlProductId: input.urlProductId,
  });
  if (!sourceUrl) return null;
  if (blockedReviewSourceUrls.has(sourceUrl)) return null;

  await randomSmartstoreDelay("ranking");
  console.log("[smartstore-review-source-trace] fetch product-detail source start", {
    productId: input.urlProductId,
    sourceUrl: safeCandidateUrlForLog(sourceUrl),
  });
  const res = await fetch(sourceUrl, {
    method: "GET",
    cache: "no-store",
    headers: buildNaverJsonFetchHeadersUnified({
      productId: input.urlProductId,
      naverCookie: input.naverCookie,
      productPageUrl: input.productUrl,
      requestUrl: sourceUrl,
    }),
  });
  if (res.status === 429) {
    blockedReviewSourceUrls.add(sourceUrl);
    console.warn("[smartstore-review-source-trace] hit 429 cooldown", {
      productId: input.urlProductId,
      sourceUrl: safeCandidateUrlForLog(sourceUrl),
    });
    await cooldownOn429();
    throw new SmartstoreNaverRateLimitedError("네이버 상품 상세 소스 조회 제한 발생 (429)");
  }
  const text = await res.text();
  if (!res.ok) {
    console.warn("[smartstore-review-source-trace] product-detail source failed", {
      productId: input.urlProductId,
      status: res.status,
      head: text.slice(0, 160),
    });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const detected = detectReviewSummarySourceFromJson(parsed, {
    urlProductId: input.urlProductId,
    productUrlKind: input.productUrlKind,
  });
  console.log("[smartstore-review-source-trace]", {
    productId: input.urlProductId,
    source: "product-detail-json",
    detectedReviewProductId: detected.reviewProductId,
    detectedLeafCategoryId: detected.leafCategoryId,
    verifiedSummaryUrl: detected.verifiedSummaryUrl
      ? safeCandidateUrlForLog(detected.verifiedSummaryUrl)
      : null,
  });
  return detected.verifiedSummaryUrl
    ? { ...detected, discoveredSource: "network-confirmed-pattern" }
    : detected;
}

function detectReviewSummarySourceFromJson(
  root: unknown,
  input: {
    urlProductId: string;
    productUrlKind: ProductUrlKind;
    fallbackLeafCategoryId?: number | null;
  }
): DetectedReviewSummarySource {
  const productReviewInfo = collectRecordsByKey(root, "productReviewInfo", 3)[0]?.value ?? null;
  const recentProductReviewInfo =
    collectRecordsByKey(root, "recentProductReviewInfo", 3)[0]?.value ?? null;
  const identifiers = collectReviewRelatedEntries(root, 120).filter((e) =>
    /reviewProductId|productReviewInfo|recentProductReviewInfo|merchantNo|originProductNo|channelNo|accountNo|productNo|nvMid|catalogue|catalog|channelProductNo|saleProductNo|contentProductNo|leafCategoryId/i.test(
      e.key
    )
  );

  const leaf =
    collectFirstNumberWithPath(root, ["leafCategoryId", "leafCategoryNo"])?.value ??
    input.fallbackLeafCategoryId ??
    null;

  const explicitReviewId =
    parseOptionalNonNegativeInt(productReviewInfo?.id) ??
    parseOptionalNonNegativeInt(recentProductReviewInfo?.id) ??
    collectFirstNumberWithPath(root, [
      "reviewProductId",
      "productReviewId",
      "contentProductNo",
      "originProductNo",
      "saleProductNo",
      "productNo",
      "channelProductNo",
    ])?.value ??
    null;

  const reviewProductId =
    explicitReviewId != null && String(explicitReviewId) !== input.urlProductId
      ? String(explicitReviewId)
      : null;
  const verifiedSummaryUrl =
    reviewProductId != null && leaf != null
      ? buildVerifiedProductSummaryUrl({
          productUrlKind: input.productUrlKind,
          reviewProductId,
          leafCategoryId: leaf,
        })
      : null;

  return {
    reviewProductId,
    leafCategoryId: leaf,
    verifiedSummaryUrl,
    discoveredSource: verifiedSummaryUrl ? "network-confirmed-pattern" : null,
    productReviewInfo,
    recentProductReviewInfo,
    identifiers,
  };
}

function detectReviewSummarySourceFromHtml(
  html: string,
  input: {
    urlProductId: string;
    productUrlKind: ProductUrlKind;
    fallbackLeafCategoryId?: number | null;
  }
): DetectedReviewSummarySource {
  let best: DetectedReviewSummarySource = {
    reviewProductId: null,
    leafCategoryId: input.fallbackLeafCategoryId ?? null,
    verifiedSummaryUrl: null,
    discoveredSource: null,
    productReviewInfo: null,
    recentProductReviewInfo: null,
    identifiers: [],
  };

  for (const embedded of extractEmbeddedJsonCandidates(html)) {
    const detected = detectReviewSummarySourceFromJson(embedded.value, input);
    if (detected.identifiers.length > best.identifiers.length) {
      best = { ...detected, discoveredSource: detected.discoveredSource ?? "html-script" };
    }
    if (detected.verifiedSummaryUrl) {
      return { ...detected, discoveredSource: "html-script" };
    }
  }

  const leaf =
    parseOptionalNonNegativeInt(
      html.match(/"leafCategoryId"\s*:\s*"?(\d+)"?/i)?.[1] ??
        html.match(/"leafCategoryNo"\s*:\s*"?(\d+)"?/i)?.[1]
    ) ?? best.leafCategoryId;
  const htmlId =
    parseOptionalNonNegativeInt(
      html.match(/"recentProductReviewInfo"\s*:\s*\{[^{}]*"id"\s*:\s*"?(\d+)"?/i)?.[1] ??
        html.match(/"productReviewInfo"\s*:\s*\{[^{}]*"id"\s*:\s*"?(\d+)"?/i)?.[1]
    ) ?? null;
  if (htmlId != null && String(htmlId) !== input.urlProductId && leaf != null) {
    const reviewProductId = String(htmlId);
    return {
      ...best,
      reviewProductId,
      leafCategoryId: leaf,
      verifiedSummaryUrl: buildVerifiedProductSummaryUrl({
        productUrlKind: input.productUrlKind,
        reviewProductId,
        leafCategoryId: leaf,
      }),
      discoveredSource: "html-script",
    };
  }

  return { ...best, leafCategoryId: leaf };
}

function normalizePcProductReferer(productUrl: string): string {
  try {
    const u = new URL(productUrl.startsWith("http") ? productUrl : `https://${productUrl}`);
    u.search = "";
    u.hash = "";
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h === "m.smartstore.naver.com") {
      u.hostname = "smartstore.naver.com";
    } else if (h === "m.brand.naver.com") {
      u.hostname = "brand.naver.com";
    }
    return u.toString();
  } catch {
    return String(productUrl).split("?")[0]!.split("#")[0]!;
  }
}

function extractChannelSlugFromProductUrl(productUrl: string): string | null {
  const u = normalizeUrl(productUrl);
  if (!u) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  const pi = segs.indexOf("products");
  if (pi > 0) return segs[pi - 1] ?? null;
  return null;
}

function safeCandidateUrlForLog(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function decodeScriptJsonText(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractEmbeddedJsonCandidates(html: string): Array<{ source: string; value: unknown }> {
  const out: Array<{ source: string; value: unknown }> = [];
  const pushJson = (source: string, raw: string) => {
    const text = decodeScriptJsonText(raw);
    if (!text || !/^\s*[\[{]/.test(text)) return;
    try {
      out.push({ source, value: JSON.parse(text) as unknown });
    } catch {
      /* ignore invalid embedded snippets */
    }
  };

  for (const match of html.matchAll(
    /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    pushJson("__NEXT_DATA__", match[1] ?? "");
  }
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    pushJson("script:application/json", match[1] ?? "");
  }
  return out;
}

function normalizeDiscoveredReviewUrl(raw: string, baseUrl: string): string | null {
  const cleaned = raw
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
  if (!cleaned || !REVIEW_SOURCE_KEYWORDS.test(cleaned)) return null;
  try {
    if (/^https?:\/\//i.test(cleaned)) return new URL(cleaned).toString();
    if (cleaned.startsWith("/")) return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
  return null;
}

function extractReviewUrlCandidatesFromText(
  text: string,
  baseUrl: string,
  source: string
): ReviewSummaryCandidate[] {
  const found = new Map<string, ReviewSummaryCandidate>();
  const push = (raw: string) => {
    const url = normalizeDiscoveredReviewUrl(raw, baseUrl);
    if (!url) return;
    if (blockedReviewSourceUrls.has(url)) {
      found.set(url, {
        url,
        source,
        verifiedBy: "script",
        disabledReason: "blocked-after-429",
      });
      return;
    }
    found.set(url, { url, source, verifiedBy: "script", disabledReason: null });
  };

  for (const m of text.matchAll(/https?:\/\/[^"'`\s<>]+/gi)) {
    push(m[0]);
  }
  for (const m of text.matchAll(/["'`]((?:\/[^"'`<>\s]*)?(?:review|reviews|product-review|summary)[^"'`<>\s]*)["'`]/gi)) {
    push(m[1] ?? "");
  }

  return Array.from(found.values());
}

function dedupeReviewCandidates(candidates: ReviewSummaryCandidate[]): ReviewSummaryCandidate[] {
  const seen = new Map<string, ReviewSummaryCandidate>();
  for (const c of candidates) {
    if (!seen.has(c.url)) seen.set(c.url, c);
  }
  return Array.from(seen.values());
}

export function buildSmartstoreReviewSummaryCandidates(input: {
  productId: string;
  storeName?: string | null;
  channelSlug?: string | null;
  productUrlKind: ProductUrlKind;
  leafCategoryId?: number | null;
}): ReviewSummaryCandidate[] {
  const productId = input.productId.trim();
  const leaf =
    typeof input.leafCategoryId === "number" &&
    Number.isFinite(input.leafCategoryId) &&
    Math.trunc(input.leafCategoryId) > 0
      ? Math.trunc(input.leafCategoryId)
      : null;
  if (!/^\d+$/.test(productId)) return [];

  const dedup = new Map<string, ReviewSummaryCandidate>();
  const add = (url: string, source: string) => {
    if (!dedup.has(url)) {
      dedup.set(url, {
        url,
        source,
        verifiedBy: null,
        disabledReason: "unverified-guessed-endpoint",
      });
    }
  };
  const addProductSummary = (origin: string, apiPrefix: "i" | "n", source: string) => {
    const u = new URL(
      `${origin}/${apiPrefix}/v1/contents/reviews/product-summary/${encodeURIComponent(productId)}`
    );
    if (leaf != null) {
      u.searchParams.set("leafCategoryId", String(leaf));
    }
    add(u.toString(), source);
  };

  if (input.productUrlKind === "BRAND") {
    addProductSummary("https://brand.naver.com", "n", "brand-product-summary");
    addProductSummary("https://smartstore.naver.com", "i", "smartstore-product-summary");
  } else {
    addProductSummary("https://smartstore.naver.com", "i", "smartstore-product-summary");
    addProductSummary("https://brand.naver.com", "n", "brand-product-summary");
  }

  return Array.from(dedup.values());
}

/** HTML/script에서 발견된 검증 후보만 호출한다. 429는 즉시 중단하고 route에서 기존 DB를 유지한다. */
async function trySmartstoreReviewSummaryApi(input: {
  productId: string;
  productUrlKind: ProductUrlKind;
  storeName?: string | null;
  channelSlug?: string | null;
  leafCategoryId?: number | null;
  refererPcUrl: string;
  candidates: ReviewSummaryCandidate[];
}): Promise<SmartstoreReviewSnapshot | null> {
  try {
    const candidates = dedupeReviewCandidates(input.candidates).filter((c) => !c.disabledReason);
    console.log("[smartstore-review-summary-api] candidates", {
      productId: input.productId,
      productUrlKind: input.productUrlKind,
      candidateCount: candidates.length,
      candidates: candidates.map((c) => ({
        source: c.source,
        url: safeCandidateUrlForLog(c.url),
        verifiedBy: c.verifiedBy ?? null,
      })),
    });
    if (candidates.length === 0) return null;

    const refererPc = normalizePcProductReferer(input.refererPcUrl);

    for (const candidate of candidates) {
      if (blockedReviewSourceUrls.has(candidate.url)) {
        console.warn("[smartstore-review-summary-api] fetch skipped", {
          productId: input.productId,
          source: candidate.source,
          reason: "blocked-after-429",
          url: safeCandidateUrlForLog(candidate.url),
        });
        continue;
      }
      await randomSmartstoreDelay("ranking");
      console.log("[smartstore-review-summary-api] fetch start", {
        productId: input.productId,
        source: candidate.source,
        url: safeCandidateUrlForLog(candidate.url),
      });

      const res = await fetch(candidate.url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
          Referer: refererPc,
          "User-Agent": SMARTSTORE_UNIFIED_USER_AGENT,
          "X-Client-Version": "20260429185405",
          "X-Service-Type": "NONE",
        },
      });

      if (res.status === 429) {
        blockedReviewSourceUrls.add(candidate.url);
        console.warn("[smartstore-review-summary-api] hit 429 cooldown", {
          productId: input.productId,
          source: candidate.source,
          status: res.status,
        });
        await cooldownOn429();
        throw new SmartstoreNaverRateLimitedError("네이버 리뷰 요약 API 제한 발생 (429)");
      }

      const rawText = await res.text();
      if (!res.ok) {
        console.warn("[smartstore-review-summary-api] fetch failed", {
          productId: input.productId,
          source: candidate.source,
          status: res.status,
          head: rawText.slice(0, 160),
        });
        continue;
      }

      console.log("[smartstore-review-summary-api] fetch success", {
        productId: input.productId,
        source: candidate.source,
        status: res.status,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        console.warn("[smartstore-review-summary-api] fetch failed", {
          productId: input.productId,
          source: candidate.source,
          status: res.status,
          reason: "json-parse",
          head: rawText.slice(0, 160),
        });
        continue;
      }

      const parsedSummary = parseReviewSummaryFromUnknown(parsed);
      console.log("[smartstore-review-summary-api] parsed", {
        productId: input.productId,
        source: candidate.source,
        reviewCount: parsedSummary.reviewCount,
        averageReviewScore: parsedSummary.reviewRating,
        photoVideoReviewCount: parsedSummary.photoVideoReviewCount,
        afterUseReviewCount: parsedSummary.monthlyUseReviewCount,
        repurchaseReviewCount: parsedSummary.repurchaseReviewCount,
        storePickReviewCount: parsedSummary.storePickReviewCount,
        hasReviewData: parsedSummary.hasReviewData,
      });
      if (!parsedSummary.hasReviewData) continue;

      return {
        productPageUrl: refererPc,
        summary: {
          reviewCount: parsedSummary.reviewCount,
          reviewRating: parsedSummary.reviewRating,
          photoVideoReviewCount: parsedSummary.photoVideoReviewCount,
          monthlyUseReviewCount: parsedSummary.monthlyUseReviewCount,
          repurchaseReviewCount: parsedSummary.repurchaseReviewCount,
          storePickReviewCount: parsedSummary.storePickReviewCount,
          starScoreSummary: parsedSummary.starScoreSummary,
        },
        recentReviews: [],
      };
    }

    return null;
  } catch (e) {
    if (isSmartstoreNaverRateLimitedError(e)) throw e;
    console.warn("[smartstore-review-summary-api] fetch failed", {
      productId: input.productId,
      error: String(e),
    });
    return null;
  }
}

/**
 * 🎯 [스나이퍼 로직] HTML 원본에서 정규식으로 데이터를 낚아챕니다.
 * 브라우저를 띄우지 않아도 되기 때문에 Vercel에서 에러가 날 일이 없습니다.
 */
function extractDataByBulldozer(html: string) {
  const getNum = (regex: RegExp): { value: number; matched: boolean } => {
    const match = html.match(regex);
    return {
      value: match ? Number(match[1].replace(/,/g, "")) : 0,
      matched: Boolean(match),
    };
  };

  const reviewCount = getNum(/"(?:reviewCount|totalReviewCount|totalCount|reviewTotalCount|totalElements)"\s*:\s*(\d+)/i);
  const averageReviewScore = getNum(/"(?:reviewRating|averageReviewScore|averageScore|reviewScore|ratingValue)"\s*:\s*"?([\d.]+)"?/i);
  const photoReviewCount = getNum(
    /"(?:photoVideoReviewCount|photoReviewCount|photoReviewCnt|mediaReviewCount|photoCount)"\s*:\s*(\d+)/i
  );
  const afterUseReviewCount = getNum(
    /"(?:afterUseReviewCount|monthReviewCount|monthlyReviewCount|monthlyUseReviewCount)"\s*:\s*(\d+)/i
  );
  const repurchaseReviewCount = getNum(/"(?:repurchaseReviewCount|repurchaseCount)"\s*:\s*(\d+)/i);
  const storePickReviewCount = getNum(/"(?:storePickReviewCount|storePickCount)"\s*:\s*(\d+)/i);
  const score1Count = getNum(/"score1Count"\s*:\s*(\d+)/i);
  const score2Count = getNum(/"score2Count"\s*:\s*(\d+)/i);
  const score3Count = getNum(/"score3Count"\s*:\s*(\d+)/i);
  const score4Count = getNum(/"score4Count"\s*:\s*(\d+)/i);
  const score5Count = getNum(/"score5Count"\s*:\s*(\d+)/i);

  return {
    reviewCount: reviewCount.value,
    averageReviewScore: averageReviewScore.value,
    photoReviewCount: photoReviewCount.value,
    afterUseReviewCount: afterUseReviewCount.value,
    repurchaseReviewCount: repurchaseReviewCount.value,
    storePickReviewCount: storePickReviewCount.value,
    // 별점 분포 (1~5점)
    score1Count: score1Count.value,
    score2Count: score2Count.value,
    score3Count: score3Count.value,
    score4Count: score4Count.value,
    score5Count: score5Count.value,
    hasAnySignal: [
      reviewCount.matched,
      averageReviewScore.matched,
      photoReviewCount.matched,
      afterUseReviewCount.matched,
      repurchaseReviewCount.matched,
      storePickReviewCount.matched,
      score1Count.matched,
      score2Count.matched,
      score3Count.matched,
      score4Count.matched,
      score5Count.matched,
    ].some(Boolean),
  };
}

function normalizeUrl(inputUrl: string): URL | null {
  const raw = String(inputUrl ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

function classifyProductUrl(url: URL | null): ProductUrlKind {
  if (!url) return "UNKNOWN";
  if (/(\.|^)smartstore\.naver\.com$/i.test(url.hostname)) return "SMARTSTORE";
  if (/(\.|^)brand\.naver\.com$/i.test(url.hostname)) return "BRAND";
  if (/(\.|^)shopping\.naver\.com$/i.test(url.hostname) && /\/catalog\//i.test(url.pathname)) {
    return "CATALOG";
  }
  return "UNKNOWN";
}

function toSearchApiUrlType(
  kind: ProductUrlKind
): "smartstore" | "brand" | "shoppingCatalog" | "unknown" {
  if (kind === "SMARTSTORE") return "smartstore";
  if (kind === "BRAND") return "brand";
  if (kind === "CATALOG") return "shoppingCatalog";
  return "unknown";
}

async function tryFallbackViaShoppingSearchApi(input: {
  productUrl: string;
  productId: string;
  productUrlKind: ProductUrlKind;
  failureStage: string;
  failurePageUrl: string;
  /** DB에 저장된 상품명 — fallback 검색 쿼리에 우선 활용 */
  existingProductName?: string | null;
  /** DB에 저장된 스토어명 — 약매칭 보조 */
  existingStoreName?: string | null;
}): Promise<SmartstoreReviewSnapshot | null> {
  if (!isSmartstoreShoppingSearchConfigured()) {
    console.warn(`${LOG_P} fallback skip: search API not configured`, {
      productId: input.productId,
      failureStage: input.failureStage,
    });
    return null;
  }

  const productNameHint = input.existingProductName?.trim() || null;
  const storeNameHint = input.existingStoreName?.trim() || null;

  console.log(`${LOG_P} fallback 시작`, {
    productId: input.productId,
    failureStage: input.failureStage,
    existingProductName: productNameHint,
    existingStoreName: storeNameHint,
  });

  const meta = await fetchSmartstoreMetaViaShoppingSearchApi({
    productUrl: input.productUrl,
    productId: input.productId,
    productUrlType: toSearchApiUrlType(input.productUrlKind),
    // 상품명을 existingNameHint AND ogTitle 둘 다 넘겨
    // → buildQueryCandidates가 "slug+name" 조합 쿼리도 생성함
    existingNameHint: productNameHint,
    ogTitle: productNameHint,
    attemptedChannelSlug: storeNameHint,
  });

  console.log(`${LOG_P} fallback search-api 결과`, {
    productId: input.productId,
    failureStage: input.failureStage,
    searchApiUsed: meta.searchApiUsed,
    searchApiMatched: meta.searchApiMatched,
    weakMatch: meta.weakMatch,
    matchedProductId: meta.matchedProductId,
    pickedTitle: meta.name,
    pickedMallName: meta.mallName,
    reviewCount: null,
    reviewRating: null,
    reviewMetricSource: "ignored-search-api",
  });

  // 상품 매칭에 실패하면 null 반환 (다음 단계에서 throw)
  if (!meta.searchApiMatched) {
    console.warn(`${LOG_P} fallback 실패: 상품 매칭 불가`, {
      productId: input.productId,
      searchApiMatched: meta.searchApiMatched,
      weakMatch: meta.weakMatch,
    });
    return null;
  }

  // 매칭 성공 — search-api는 상품명/이미지/가격/카테고리 보강용이다.
  // 네이버 쇼핑 검색 API에는 리뷰 상세 지표가 없으므로 리뷰 성공으로 보지 않는다.
  const hasReviewData = false;
  console.log(
    `${LOG_P} fallback 부분성공 (메타만, 리뷰 없음 — 기존 DB 값 유지)`,
    {
      productId: input.productId,
      failureStage: input.failureStage,
      matchedProductId: meta.matchedProductId,
      pickedTitle: meta.name,
      pickedMallName: meta.mallName,
      reviewCount: null,
      reviewRating: null,
      hasReviewData,
    }
  );

  return {
    productPageUrl: input.failurePageUrl,
    summary: {
      // null이면 route.ts가 기존 DB 값을 유지함
      reviewCount: null,
      reviewRating: null,
      photoVideoReviewCount: null,
      monthlyUseReviewCount: null,
      repurchaseReviewCount: null,
      storePickReviewCount: null,
      starScoreSummary: null,
    },
    recentReviews: [],
  };
}

function buildCandidateProductPages(
  kind: ProductUrlKind,
  inputUrl: URL | null,
  productId: string
): string[] {
  const dedup = new Set<string>();
  const push = (url: string) => {
    const v = url.trim();
    if (!v) return;
    dedup.add(v);
  };

  if (inputUrl) {
    inputUrl.search = "";
    inputUrl.hash = "";
    push(inputUrl.toString());
  }

  // 리뷰 요약 데이터는 모바일 상품 상세에 노출되는 경우가 대부분이라 모바일 경로를 우선 조회합니다.
  if (kind === "BRAND") {
    push(`https://m.brand.naver.com/products/${productId}`);
    push(`https://m.smartstore.naver.com/products/${productId}`);
  } else if (kind === "SMARTSTORE") {
    push(`https://m.smartstore.naver.com/products/${productId}`);
    push(`https://smartstore.naver.com/products/${productId}`);
  } else if (kind === "CATALOG") {
    push(`https://shopping.naver.com/catalog/${productId}`);
    push(`https://m.smartstore.naver.com/products/${productId}`);
    push(`https://m.brand.naver.com/products/${productId}`);
  } else {
    push(`https://m.smartstore.naver.com/products/${productId}`);
    push(`https://m.brand.naver.com/products/${productId}`);
  }

  return Array.from(dedup);
}

export type SmartstoreReviewSourceTraceResult = {
  input: {
    productUrl: string;
    productId: string;
    storeName: string | null;
    shoppingProductId: string | null;
    productUrlKind: ProductUrlKind;
    channelSlug: string | null;
    leafCategoryId: number | null;
  };
  fetchMode: "dryRun" | "singleFetch";
  guessedCandidatesDisabled: Array<{ source: string; url: string; reason: string | null }>;
  urlProductId: string;
  detectedReviewProductId: string | null;
  detectedLeafCategoryId: number | null;
  verifiedSummaryUrl: string | null;
  parsedProductReviewInfo: Record<string, unknown> | null;
  recentProductReviewInfo: Record<string, unknown> | null;
  discoveredSource: "html-script" | "network-confirmed-pattern" | null;
  discoveredReviewUrlCandidates: Array<{
    source: string;
    url: string;
    disabledReason: string | null;
  }>;
  embeddedJson: Array<{
    source: string;
    parsedSummary: ParsedReviewSummary;
    reviewRelatedEntries: Array<{ path: string; key: string; value: unknown }>;
  }>;
  identifiers: Array<{ path: string; key: string; value: unknown }>;
  fetchAttempt: null | {
    url: string;
    status: number;
    ok: boolean;
    stoppedBecause?: string;
    htmlPreview?: string;
  };
};

export async function traceSmartstoreReviewSources(input: {
  productUrl?: string | null;
  productId: string;
  storeName?: string | null;
  shoppingProductId?: string | null;
  leafCategoryId?: number | null;
  fetchMode?: "dryRun" | "singleFetch";
}): Promise<SmartstoreReviewSourceTraceResult> {
  const productId = String(input.productId ?? "").trim();
  const storeName = input.storeName?.trim() || null;
  const productUrl =
    input.productUrl?.trim() ||
    (storeName
      ? `https://smartstore.naver.com/${encodeURIComponent(storeName)}/products/${encodeURIComponent(productId)}`
      : `https://smartstore.naver.com/products/${encodeURIComponent(productId)}`);
  const parsedUrl = normalizeUrl(productUrl);
  const productUrlKind = classifyProductUrl(parsedUrl);
  const channelSlug = extractChannelSlugFromProductUrl(productUrl) ?? storeName;
  const leafCategoryId =
    typeof input.leafCategoryId === "number" &&
    Number.isFinite(input.leafCategoryId) &&
    Math.trunc(input.leafCategoryId) > 0
      ? Math.trunc(input.leafCategoryId)
      : null;
  const fetchMode = input.fetchMode ?? "dryRun";

  const guessedCandidatesDisabled = buildSmartstoreReviewSummaryCandidates({
    productId,
    productUrlKind,
    storeName,
    channelSlug,
    leafCategoryId,
  }).map((c) => ({
    source: c.source,
    url: safeCandidateUrlForLog(c.url),
    reason: c.disabledReason ?? null,
  }));

  const result: SmartstoreReviewSourceTraceResult = {
    input: {
      productUrl,
      productId,
      storeName,
      shoppingProductId: input.shoppingProductId?.trim() || null,
      productUrlKind,
      channelSlug,
      leafCategoryId,
    },
    fetchMode,
    guessedCandidatesDisabled,
    urlProductId: productId,
    detectedReviewProductId: null,
    detectedLeafCategoryId: leafCategoryId,
    verifiedSummaryUrl: null,
    parsedProductReviewInfo: null,
    recentProductReviewInfo: null,
    discoveredSource: null,
    discoveredReviewUrlCandidates: [],
    embeddedJson: [],
    identifiers: [],
    fetchAttempt: null,
  };

  console.log("[smartstore-review-source-trace]", {
    mode: "debug",
    productId,
    storeName,
    shoppingProductId: result.input.shoppingProductId,
    guessedCandidatesDisabled,
    fetchMode,
  });

  if (fetchMode === "dryRun") return result;

  const naverCookie = await loadSystemConfigNaverCookie();
  const productDetailSourceUrl = buildProductDetailSourceUrl({
    productUrlKind,
    channelSlug,
    urlProductId: productId,
  });
  const detectedFromProductDetail = await tryDetectReviewSummarySourceFromProductDetailApi({
    productUrl,
    urlProductId: productId,
    productUrlKind,
    channelSlug,
    naverCookie,
  });
  if (detectedFromProductDetail) {
    result.fetchAttempt = {
      url: safeCandidateUrlForLog(
        buildProductDetailSourceUrl({ productUrlKind, channelSlug, urlProductId: productId }) ??
          productUrl
      ),
      status: detectedFromProductDetail.verifiedSummaryUrl ? 200 : 204,
      ok: Boolean(detectedFromProductDetail.verifiedSummaryUrl),
    };
    result.detectedReviewProductId = detectedFromProductDetail.reviewProductId;
    result.detectedLeafCategoryId = detectedFromProductDetail.leafCategoryId;
    result.verifiedSummaryUrl = detectedFromProductDetail.verifiedSummaryUrl
      ? safeCandidateUrlForLog(detectedFromProductDetail.verifiedSummaryUrl)
      : null;
    result.parsedProductReviewInfo = detectedFromProductDetail.productReviewInfo;
    result.recentProductReviewInfo = detectedFromProductDetail.recentProductReviewInfo;
    result.discoveredSource = detectedFromProductDetail.discoveredSource;
    result.identifiers = dedupeReviewTraceEntries([
      ...result.identifiers,
      ...detectedFromProductDetail.identifiers,
    ]);
    console.log("[smartstore-review-source-trace]", {
      mode: "debug-result",
      productId,
      detectedReviewProductId: result.detectedReviewProductId,
      detectedLeafCategoryId: result.detectedLeafCategoryId,
      verifiedSummaryUrl: result.verifiedSummaryUrl,
      discoveredSource: result.discoveredSource,
    });
    if (detectedFromProductDetail.verifiedSummaryUrl) return result;
  }
  if (productDetailSourceUrl) {
    result.fetchAttempt ??= {
      url: safeCandidateUrlForLog(productDetailSourceUrl),
      status: 204,
      ok: false,
      stoppedBecause: "single-fetch-budget-used",
    };
    return result;
  }

  const candidatePages = buildCandidateProductPages(productUrlKind, parsedUrl, productId);
  const pageUrl = candidatePages[0] ?? productUrl;
  await randomSmartstoreDelay("ranking");
  const headers = buildSmartstoreMobileDocumentFetchHeaders({
    mobileUrl: pageUrl,
    normalizedProductUrl: productUrl,
    productId,
    naverCookie,
  });

  const res = await fetch(pageUrl, { method: "GET", headers, cache: "no-store" });
  if (res.status === 429) {
    blockedReviewSourceUrls.add(pageUrl);
    result.fetchAttempt = {
      url: safeCandidateUrlForLog(pageUrl),
      status: res.status,
      ok: false,
      stoppedBecause: "429",
    };
    console.warn("[smartstore-review-source-trace] hit 429 cooldown", result.fetchAttempt);
    await cooldownOn429();
    return result;
  }

  const html = await res.text();
  result.fetchAttempt = {
    url: safeCandidateUrlForLog(pageUrl),
    status: res.status,
    ok: res.ok,
    htmlPreview: html.slice(0, 240).replace(/\s+/g, " "),
  };
  if (!res.ok) return result;

  result.discoveredReviewUrlCandidates = extractReviewUrlCandidatesFromText(
    html,
    pageUrl,
    "html-script"
  ).map((c) => ({
    source: c.source,
    url: safeCandidateUrlForLog(c.url),
    disabledReason: c.disabledReason ?? null,
  }));

  const embedded = extractEmbeddedJsonCandidates(html);
  for (const item of embedded) {
    const reviewRelatedEntries = collectReviewRelatedEntries(item.value, 80);
    result.embeddedJson.push({
      source: item.source,
      parsedSummary: parseReviewSummaryFromUnknown(item.value),
      reviewRelatedEntries,
    });
    result.identifiers.push(
      ...reviewRelatedEntries.filter((e) =>
        /merchantNo|originProductNo|channelNo|accountNo|productNo|nvMid|catalogue|catalog|channelProductNo/i.test(
          e.key
        )
      )
    );
  }

  const detected = detectReviewSummarySourceFromHtml(html, {
    urlProductId: productId,
    productUrlKind,
    fallbackLeafCategoryId: leafCategoryId,
  });
  result.detectedReviewProductId = detected.reviewProductId;
  result.detectedLeafCategoryId = detected.leafCategoryId;
  result.verifiedSummaryUrl = detected.verifiedSummaryUrl
    ? safeCandidateUrlForLog(detected.verifiedSummaryUrl)
    : null;
  result.parsedProductReviewInfo = detected.productReviewInfo;
  result.recentProductReviewInfo = detected.recentProductReviewInfo;
  result.discoveredSource = detected.discoveredSource;
  result.identifiers = dedupeReviewTraceEntries([...result.identifiers, ...detected.identifiers]);

  console.log("[smartstore-review-source-trace]", {
    mode: "debug-result",
    productId,
    detectedReviewProductId: result.detectedReviewProductId,
    detectedLeafCategoryId: result.detectedLeafCategoryId,
    verifiedSummaryUrl: result.verifiedSummaryUrl,
    fetchAttempt: result.fetchAttempt,
    discoveredReviewUrlCandidates: result.discoveredReviewUrlCandidates,
    embeddedJsonCount: result.embeddedJson.length,
    identifierCount: result.identifiers.length,
  });

  return result;
}

export async function fetchSmartstoreReviewSnapshot(input: {
  productUrl: string;
  productId: string;
  /** 리뷰 product-summary API path id. URL productId와 다를 수 있다. */
  reviewProductId?: string | null;
  /** DB에 저장된 상품명 — fallback 검색에 적극 활용 */
  productName?: string | null;
  /** DB에 저장된 스토어명 — fallback 검색 보조 */
  storeName?: string | null;
  /** 네이버 리뷰 요약 JSON API용 leafCategoryId (없으면 HTML·검색만 사용) */
  leafCategoryId?: number | null;
}): Promise<SmartstoreReviewSnapshot> {
  const productId = String(input.productId).trim();
  const reviewProductId = String(input.reviewProductId ?? "").trim() || null;
  const parsedUrl = normalizeUrl(input.productUrl);
  const productUrlKind = classifyProductUrl(parsedUrl);
  const candidateUrls = buildCandidateProductPages(productUrlKind, parsedUrl, productId);

  const trimmedLeaf =
    typeof input.leafCategoryId === "number" &&
    Number.isFinite(input.leafCategoryId) &&
    Math.trunc(input.leafCategoryId) > 0
      ? Math.trunc(input.leafCategoryId)
      : null;

  console.log(`${LOG_P} 리뷰 요약 수집 시작`, {
    productId,
    reviewProductId,
    productUrl: input.productUrl,
    productUrlKind,
    productName: input.productName ?? null,
    storeName: input.storeName ?? null,
    leafCategoryId: trimmedLeaf,
    candidateUrls,
  });
  console.log("[smartstore-review-source-trace]", {
    file: "lib/smartstore-review-fetcher.ts",
    function: "fetchSmartstoreReviewSnapshot",
    sources: [
      "smartstore-review-summary-api",
      "smartstore-product-html-json",
      "smartstore-search-api-meta-only",
    ],
    productId,
    reviewProductId,
    productUrlKind,
  });
  const channelSlug = extractChannelSlugFromProductUrl(input.productUrl);
  const guessedDisabledCandidates = buildSmartstoreReviewSummaryCandidates({
    productId,
    productUrlKind,
    storeName: input.storeName ?? null,
    channelSlug,
    leafCategoryId: trimmedLeaf,
  });
  console.log("[smartstore-review-summary-api] candidates", {
    productId,
    productUrlKind,
    candidateCount: 0,
    disabledGuessCount: guessedDisabledCandidates.length,
    disabledGuesses: guessedDisabledCandidates.map((c) => ({
      source: c.source,
      url: safeCandidateUrlForLog(c.url),
      reason: c.disabledReason,
    })),
  });

  if (reviewProductId != null && trimmedLeaf != null) {
    const verifiedSummaryUrl = buildVerifiedProductSummaryUrl({
      productUrlKind,
      reviewProductId,
      leafCategoryId: trimmedLeaf,
    });
    console.log("[smartstore-review-source-trace] using stored review source ids", {
      productId,
      reviewProductId,
      leafCategoryId: trimmedLeaf,
    });
    console.log("[smartstore-review-summary-api] verified url", {
      productId,
      urlProductId: productId,
      reviewProductId,
      leafCategoryId: trimmedLeaf,
      url: safeCandidateUrlForLog(verifiedSummaryUrl),
    });
    const viaVerifiedApi = await trySmartstoreReviewSummaryApi({
      productId,
      productUrlKind,
      storeName: input.storeName ?? null,
      channelSlug,
      leafCategoryId: trimmedLeaf,
      refererPcUrl: input.productUrl,
      candidates: [
        {
          url: verifiedSummaryUrl,
          source: "network-confirmed-product-summary",
          verifiedBy: "embedded-json",
          disabledReason: null,
        },
      ],
    });
    if (viaVerifiedApi) {
      console.log(`${LOG_P} review-summary fallback success`, {
        productId,
        reviewCount: viaVerifiedApi.summary.reviewCount,
        reviewRating: viaVerifiedApi.summary.reviewRating,
        photoVideoReviewCount: viaVerifiedApi.summary.photoVideoReviewCount,
        monthlyUseReviewCount: viaVerifiedApi.summary.monthlyUseReviewCount,
        repurchaseReviewCount: viaVerifiedApi.summary.repurchaseReviewCount,
        storePickReviewCount: viaVerifiedApi.summary.storePickReviewCount,
      });
      return viaVerifiedApi;
    }
    console.warn("[smartstore-review-fetcher-lite] review-summary fallback failed keep-existing", {
      productId,
      reviewProductId,
      leafCategoryId: trimmedLeaf,
      reason: "verified-summary-empty-or-parse-failed",
    });
    return {
      productPageUrl: input.productUrl,
      summary: {
        reviewCount: null,
        reviewRating: null,
        photoVideoReviewCount: null,
        monthlyUseReviewCount: null,
        repurchaseReviewCount: null,
        storePickReviewCount: null,
        starScoreSummary: null,
      },
      recentReviews: [],
    };
  }

  console.warn("[smartstore-review-source-trace] review source ids missing", {
    productId,
    reviewProductId,
    leafCategoryId: trimmedLeaf,
    action: "keep-existing-without-network-source-discovery",
  });
  return {
    productPageUrl: input.productUrl,
    summary: {
      reviewCount: null,
      reviewRating: null,
      photoVideoReviewCount: null,
      monthlyUseReviewCount: null,
      repurchaseReviewCount: null,
      storePickReviewCount: null,
      starScoreSummary: null,
    },
    recentReviews: [],
  };

}
