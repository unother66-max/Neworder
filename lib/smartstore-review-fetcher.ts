import {
  cooldownOn429,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";
import {
  buildSmartstoreMobileDocumentFetchHeaders,
  loadSystemConfigNaverCookie,
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
}): Promise<SmartstoreReviewSnapshot | null> {
  if (!isSmartstoreShoppingSearchConfigured()) {
    console.warn(`${LOG_P} fallback skip: search API not configured`, {
      productId: input.productId,
      failureStage: input.failureStage,
      failurePageUrl: input.failurePageUrl,
    });
    return null;
  }

  const meta = await fetchSmartstoreMetaViaShoppingSearchApi({
    productUrl: input.productUrl,
    productId: input.productId,
    productUrlType: toSearchApiUrlType(input.productUrlKind),
  });

  console.log(`${LOG_P} fallback search-api 결과`, {
    productId: input.productId,
    failureStage: input.failureStage,
    failurePageUrl: input.failurePageUrl,
    searchApiUsed: meta.searchApiUsed,
    searchApiMatched: meta.searchApiMatched,
    matchedProductId: meta.matchedProductId,
    reviewCount: meta.reviewCount,
    reviewRating: meta.reviewRating,
    name: meta.name,
    category: meta.category,
    image: meta.thumbnailLink,
    mallName: meta.mallName,
  });

  if (!meta.searchApiMatched || meta.reviewCount == null) {
    return null;
  }

  return {
    productPageUrl: input.failurePageUrl,
    summary: {
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
}): Promise<SmartstoreReviewSnapshot> {
  const productId = String(input.productId).trim();
  const parsedUrl = normalizeUrl(input.productUrl);
  const productUrlKind = classifyProductUrl(parsedUrl);
  const candidateUrls = buildCandidateProductPages(productUrlKind, parsedUrl, productId);

  console.log(`${LOG_P} 리뷰 요약 수집 시작`, {
    productId,
    productUrl: input.productUrl,
    productUrlKind,
    candidateUrls,
  });

  // 1. 실제 사람처럼 보이게 딜레이 살짝 (봇 방패 우회)
  await randomSmartstoreDelay("ranking");

  // 2. 소장님의 네이버 신분증(쿠키) 로드
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
      });
      if (fallback) {
        console.log(`${LOG_P} fallback 성공: search-api reviewCount 사용`, {
          productId,
          pageUrl,
          reviewCount: fallback.summary.reviewCount,
        });
        return fallback;
      }
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