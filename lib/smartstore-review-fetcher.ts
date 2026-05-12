import {
  cooldownOn429,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";
import {
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

function jsonRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function finiteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
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

/** 쿠키 없음 — HTML 수집 전 1순위. 실패 시 null → 기존 HTML·fallback. */
async function trySmartstoreReviewProductSummaryApi(input: {
  productId: string;
  leafCategoryId: number;
  refererPcUrl: string;
}): Promise<SmartstoreReviewSnapshot | null> {
  try {
    const leaf = Math.trunc(input.leafCategoryId);
    if (!Number.isFinite(leaf) || leaf <= 0) return null;

    const url = new URL(
      `https://smartstore.naver.com/i/v1/contents/reviews/product-summary/${encodeURIComponent(
        input.productId
      )}`
    );
    url.searchParams.set("leafCategoryId", String(leaf));

    const refererPc = normalizePcProductReferer(input.refererPcUrl);

    const res = await fetch(url.toString(), {
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
      console.warn(`${LOG_P} product-summary rate-limit`, {
        productId: input.productId,
        leafCategoryId: leaf,
        status: res.status,
      });
      return null;
    }

    if (!res.ok) {
      console.warn(`${LOG_P} product-summary non-OK`, {
        productId: input.productId,
        leafCategoryId: leaf,
        status: res.status,
      });
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await res.text()) as unknown;
    } catch {
      console.warn(`${LOG_P} product-summary JSON parse fail`, { productId: input.productId });
      return null;
    }

    const info = jsonRecord(jsonRecord(parsed)?.productReviewInfo);
    if (!info) {
      console.warn(`${LOG_P} product-summary missing productReviewInfo`, {
        productId: input.productId,
      });
      return null;
    }

    const reviewCount = finiteNumber(info.reviewCount);
    const avg = finiteNumber(info.averageReviewScore);
    if (reviewCount == null && avg == null) {
      console.warn(`${LOG_P} product-summary no summary signal`, { productId: input.productId });
      return null;
    }

    const photo = finiteNumber(info.photoReviewCount);
    const video = finiteNumber(info.videoReviewCount);
    const photoVideoReviewCount =
      photo == null && video == null ? null : Math.trunc((photo ?? 0) + (video ?? 0));

    const monthlyRaw = finiteNumber(info.afterUseReviewCount);
    const monthlyUseReviewCount =
      monthlyRaw == null ? null : Math.max(0, Math.trunc(monthlyRaw));

    const starScoreSummary: Record<"1" | "2" | "3" | "4" | "5", number> = {
      "1": Math.max(0, Math.trunc(finiteNumber(info.score1ReviewCount) ?? 0)),
      "2": Math.max(0, Math.trunc(finiteNumber(info.score2ReviewCount) ?? 0)),
      "3": Math.max(0, Math.trunc(finiteNumber(info.score3ReviewCount) ?? 0)),
      "4": Math.max(0, Math.trunc(finiteNumber(info.score4ReviewCount) ?? 0)),
      "5": Math.max(0, Math.trunc(finiteNumber(info.score5ReviewCount) ?? 0)),
    };

    console.log(`${LOG_P} product-summary 성공`, {
      productId: input.productId,
      leafCategoryId: leaf,
      reviewCount,
      avg,
    });

    return {
      productPageUrl: refererPc,
      summary: {
        reviewCount:
          reviewCount == null ? null : Math.max(0, Math.trunc(reviewCount)),
        reviewRating: avg,
        photoVideoReviewCount,
        monthlyUseReviewCount,
        repurchaseReviewCount: null,
        storePickReviewCount: null,
        starScoreSummary,
      },
      recentReviews: [],
    };
  } catch (e) {
    console.warn(`${LOG_P} product-summary exception`, {
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

  const reviewCount = getNum(/"(?:reviewCount|totalReviewCount|totalElements)"\s*:\s*(\d+)/i);
  const averageReviewScore = getNum(/"(?:averageReviewScore|ratingValue)"\s*:\s*"?([\d.]+)"?/i);
  const photoReviewCount = getNum(
    /"(?:photoReviewCount|photoReviewCnt|photoVideoReviewCount)"\s*:\s*(\d+)/i
  );
  const afterUseReviewCount = getNum(
    /"(?:afterUseReviewCount|monthlyUseReviewCount)"\s*:\s*(\d+)/i
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
    reviewCount: meta.reviewCount,
    reviewRating: meta.reviewRating,
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

  // 매칭 성공 — review 데이터 유무와 관계없이 스냅샷 반환.
  // route.ts는 reviewCount/reviewRating이 null이면 기존 DB 값을 그대로 유지하고
  // 히스토리 레코드도 생성하지 않으므로 데이터가 덮어쓰이지 않는다.
  const hasReviewData = meta.reviewCount != null || meta.reviewRating != null;
  console.log(
    `${LOG_P} fallback ${hasReviewData ? "성공 (리뷰 데이터 포함)" : "부분성공 (메타만, 리뷰 없음 — 기존 DB 값 유지)"}`,
    {
      productId: input.productId,
      failureStage: input.failureStage,
      matchedProductId: meta.matchedProductId,
      pickedTitle: meta.name,
      pickedMallName: meta.mallName,
      reviewCount: meta.reviewCount,
      reviewRating: meta.reviewRating,
      hasReviewData,
    }
  );

  return {
    productPageUrl: input.failurePageUrl,
    summary: {
      // null이면 route.ts가 기존 DB 값을 유지함
      reviewCount: meta.reviewCount,
      reviewRating: meta.reviewRating,
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

export async function fetchSmartstoreReviewSnapshot(input: {
  productUrl: string;
  productId: string;
  /** DB에 저장된 상품명 — fallback 검색에 적극 활용 */
  productName?: string | null;
  /** DB에 저장된 스토어명 — fallback 검색 보조 */
  storeName?: string | null;
  /** 네이버 리뷰 요약 JSON API용 leafCategoryId (없으면 HTML·검색만 사용) */
  leafCategoryId?: number | null;
}): Promise<SmartstoreReviewSnapshot> {
  const productId = String(input.productId).trim();
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
    productUrl: input.productUrl,
    productUrlKind,
    productName: input.productName ?? null,
    storeName: input.storeName ?? null,
    leafCategoryId: trimmedLeaf,
    candidateUrls,
  });

  // 1. 실제 사람처럼 보이게 딜레이 살짝 (봇 방패 우회)
  await randomSmartstoreDelay("ranking");

  if (
    trimmedLeaf != null &&
    (productUrlKind === "SMARTSTORE" || productUrlKind === "BRAND") &&
    /^\d+$/.test(productId)
  ) {
    const viaApi = await trySmartstoreReviewProductSummaryApi({
      productId,
      leafCategoryId: trimmedLeaf,
      refererPcUrl: input.productUrl,
    });
    if (viaApi) return viaApi;
  }

  // 2. 소장님의 네이버 신분증(쿠키) 로드 — HTML 페이지용 (product-summary API는 비쿠키)
  const naverCookie = await loadSystemConfigNaverCookie();
  let sawBlocked = false;
  let sawNotFound = false;
  let lastParseFailure: { url: string; status: number; htmlPreview: string } | null = null;

  for (const pageUrl of candidateUrls) {
    const headers = buildSmartstoreMobileDocumentFetchHeaders({
      mobileUrl: pageUrl,
      normalizedProductUrl: input.productUrl,
      productId,
      naverCookie,
    });

    const res = await fetch(pageUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (res.status === 429) {
      console.error(`${LOG_P} 단계 실패: fetch(429)`, { productId, pageUrl, productUrlKind });
      const fallback = await tryFallbackViaShoppingSearchApi({
        productUrl: input.productUrl,
        productId,
        productUrlKind,
        failureStage: "fetch(429)",
        failurePageUrl: pageUrl,
        existingProductName: input.productName,
        existingStoreName: input.storeName,
      });
      if (fallback) return fallback;
      await cooldownOn429();
      throw new SmartstoreNaverRateLimitedError("네이버 IP 차단 발생 (429)");
    }

    const html = await res.text();
    const htmlPreview = html.slice(0, 240).replace(/\s+/g, " ");

    if ([401, 403, 406, 418, 503].includes(res.status)) {
      sawBlocked = true;
      console.error(`${LOG_P} 단계 실패: fetch(blocked-status)`, {
        productId,
        pageUrl,
        status: res.status,
        htmlPreview,
      });
      continue;
    }

    if (!res.ok) {
      console.error(`${LOG_P} 단계 실패: fetch(non-ok)`, {
        productId,
        pageUrl,
        status: res.status,
        htmlPreview,
      });
      if (res.status === 404) sawNotFound = true;
      continue;
    }

    if (BLOCKED_HTML_PATTERNS.some((p) => p.test(html))) {
      sawBlocked = true;
      console.error(`${LOG_P} 단계 실패: fetch(blocked-html)`, {
        productId,
        pageUrl,
        status: res.status,
        htmlPreview,
      });
      continue;
    }
    if (NOT_FOUND_HTML_PATTERNS.some((p) => p.test(html))) {
      sawNotFound = true;
      console.error(`${LOG_P} 단계 실패: fetch(not-found-html)`, {
        productId,
        pageUrl,
        status: res.status,
        htmlPreview,
      });
      continue;
    }

    const data = extractDataByBulldozer(html);
    if (!data.hasAnySignal) {
      lastParseFailure = { url: pageUrl, status: res.status, htmlPreview };
      console.error(`${LOG_P} 단계 실패: parse(no-signal)`, {
        productId,
        pageUrl,
        status: res.status,
        htmlPreview,
      });
      continue;
    }

    console.log(`${LOG_P} 수집 성공`, {
      productId,
      pageUrl,
      productUrlKind,
      reviewCount: data.reviewCount,
      reviewRating: data.averageReviewScore,
    });

    return {
      productPageUrl: pageUrl,
      summary: {
        reviewCount: data.reviewCount,
        reviewRating: data.averageReviewScore,
        photoVideoReviewCount: data.photoReviewCount,
        monthlyUseReviewCount: data.afterUseReviewCount,
        repurchaseReviewCount: data.repurchaseReviewCount,
        storePickReviewCount: data.storePickReviewCount,
        starScoreSummary: {
          "1": data.score1Count,
          "2": data.score2Count,
          "3": data.score3Count,
          "4": data.score4Count,
          "5": data.score5Count,
        },
      },
      recentReviews: [],
    };
  }

  // 모든 후보 URL이 실패한 경우, 상품명 기반 검색 fallback을 마지막으로 시도
  const failureStage = sawBlocked
    ? "all-blocked"
    : sawNotFound
    ? "all-not-found"
    : "all-parse-failed";

  console.warn(`${LOG_P} 모든 HTML 수집 실패, 검색 API fallback 마지막 시도`, {
    productId,
    failureStage,
    sawBlocked,
    sawNotFound,
    existingProductName: input.productName ?? null,
  });

  const lastFallback = await tryFallbackViaShoppingSearchApi({
    productUrl: input.productUrl,
    productId,
    productUrlKind,
    failureStage,
    failurePageUrl: input.productUrl,
    existingProductName: input.productName,
    existingStoreName: input.storeName,
  }).catch((e) => {
    console.error(`${LOG_P} fallback 자체 오류`, { productId, error: String(e) });
    return null;
  });

  if (lastFallback) return lastFallback;

  if (sawBlocked) {
    throw new SmartstoreReviewBlockedError(
      "네이버가 요청을 차단하거나 로그인/검증 페이지를 반환했습니다."
    );
  }
  if (sawNotFound) {
    throw new SmartstoreReviewProductNotFoundError(
      "상품이 존재하지 않거나 현재 URL 유형에서 리뷰 페이지를 찾을 수 없습니다."
    );
  }
  if (productUrlKind === "CATALOG") {
    throw new SmartstoreReviewParseError(
      "카탈로그 상품은 리뷰 요약 소스가 제공되지 않거나 파싱이 불가능합니다."
    );
  }
  throw new SmartstoreReviewParseError(
    `리뷰 데이터 파싱에 실패했습니다.${
      lastParseFailure
        ? ` 마지막 시도: ${lastParseFailure.url} (status=${lastParseFailure.status})`
        : ""
    }`
  );
}