import {
  cooldownOn429,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";

const LOG_P = "[smartstore-review-fetcher]";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1";

export type SmartstoreReviewSummary = {
  reviewCount: number | null;
  reviewRating: number | null;
  photoVideoReviewCount: number | null;
  monthlyUseReviewCount: number | null;
  repurchaseReviewCount: number | null;
  storePickReviewCount: number | null;
  starScoreSummary: Record<"1" | "2" | "3" | "4" | "5", number> | null;
};

export type SmartstoreRecentReviewItem = {
  reviewKey: string;
  postedAt: Date | null;
  rating: number | null;
  author: string | null;
  content: string;
};

export type FetchSmartstoreReviewResult = {
  productPageUrl: string;
  summary: SmartstoreReviewSummary;
  recentReviews: SmartstoreRecentReviewItem[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractNextDataJson(html: string): unknown | null {
  const m = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function collectKeyMatches(
  input: unknown,
  keyPatterns: RegExp[],
  results: Array<{ key: string; value: unknown }> = []
): Array<{ key: string; value: unknown }> {
  if (results.length > 400) return results;
  if (Array.isArray(input)) {
    for (const v of input) collectKeyMatches(v, keyPatterns, results);
    return results;
  }
  const o = asRecord(input);
  if (!o) return results;
  for (const [k, v] of Object.entries(o)) {
    if (keyPatterns.some((re) => re.test(k))) {
      results.push({ key: k, value: v });
    }
    collectKeyMatches(v, keyPatterns, results);
  }
  return results;
}

function pickMostObjectLike(matches: Array<{ key: string; value: unknown }>): Record<string, unknown> | null {
  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const m of matches) {
    const o = asRecord(m.value);
    if (!o) continue;
    const keys = Object.keys(o);
    const score = keys.length;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

function extractStarScoreSummaryFromReviewSummary(reviewSummary: Record<string, unknown> | null) {
  if (!reviewSummary) return null;
  const matches = collectKeyMatches(reviewSummary, [/starScoreSummary/i]);
  const obj = pickMostObjectLike(matches);
  if (!obj) return null;

  const out: Record<"1" | "2" | "3" | "4" | "5", number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
  for (const k of ["1", "2", "3", "4", "5"] as const) {
    const n = safeNumber(obj[k]);
    out[k] = n == null ? 0 : clampInt(n, 0, 10_000_000);
  }
  return out;
}

function extractReviewSummary(nextData: unknown): SmartstoreReviewSummary {
  const summaryEmpty: SmartstoreReviewSummary = {
    reviewCount: null,
    reviewRating: null,
    photoVideoReviewCount: null,
    monthlyUseReviewCount: null,
    repurchaseReviewCount: null,
    storePickReviewCount: null,
    starScoreSummary: null,
  };

  const matches = collectKeyMatches(nextData, [/reviewSummary/i]);
  const reviewSummary = pickMostObjectLike(matches);
  if (!reviewSummary) return summaryEmpty;

  const countCandidates = [
    reviewSummary.reviewCount,
    reviewSummary.totalReviewCount,
    reviewSummary.reviewTotalCount,
    reviewSummary.totalCount,
  ];
  const ratingCandidates = [
    reviewSummary.reviewRating,
    reviewSummary.averageScore,
    reviewSummary.avgScore,
    reviewSummary.averageRating,
    reviewSummary.avgRating,
    reviewSummary.score,
  ];

  const reviewCount = countCandidates.map(safeNumber).find((n) => n != null) ?? null;
  const reviewRating = ratingCandidates.map(safeNumber).find((n) => n != null) ?? null;

  // extra metrics (key names vary; we match broadly + use fallback patterns)
  const photoCandidates = [
    (reviewSummary as any).photoVideoReviewCount,
    (reviewSummary as any).photoAndVideoReviewCount,
    (reviewSummary as any).photoReviewCount,
    (reviewSummary as any).mediaReviewCount,
  ];
  const monthlyUseCandidates = [
    (reviewSummary as any).monthlyUseReviewCount,
    (reviewSummary as any).oneMonthUseReviewCount,
    (reviewSummary as any).monthUseReviewCount,
    (reviewSummary as any).oneMonthReviewCount,
  ];
  const repurchaseCandidates = [
    (reviewSummary as any).repurchaseReviewCount,
    (reviewSummary as any).rePurchaseReviewCount,
    (reviewSummary as any).repurchaseCount,
  ];
  const storePickCandidates = [
    (reviewSummary as any).storePickReviewCount,
    (reviewSummary as any).storePickCount,
    (reviewSummary as any).storePickReviewCnt,
  ];

  const photoVideoReviewCount =
    photoCandidates.map(safeNumber).find((n) => n != null) ?? null;
  const monthlyUseReviewCount =
    monthlyUseCandidates.map(safeNumber).find((n) => n != null) ?? null;
  const repurchaseReviewCount =
    repurchaseCandidates.map(safeNumber).find((n) => n != null) ?? null;
  const storePickReviewCount =
    storePickCandidates.map(safeNumber).find((n) => n != null) ?? null;

  return {
    reviewCount: reviewCount == null ? null : clampInt(reviewCount, 0, 100_000_000),
    reviewRating: reviewRating == null ? null : Math.max(0, Math.min(reviewRating, 5)),
    photoVideoReviewCount:
      photoVideoReviewCount == null ? null : clampInt(photoVideoReviewCount, 0, 100_000_000),
    monthlyUseReviewCount:
      monthlyUseReviewCount == null ? null : clampInt(monthlyUseReviewCount, 0, 100_000_000),
    repurchaseReviewCount:
      repurchaseReviewCount == null ? null : clampInt(repurchaseReviewCount, 0, 100_000_000),
    storePickReviewCount:
      storePickReviewCount == null ? null : clampInt(storePickReviewCount, 0, 100_000_000),
    starScoreSummary: extractStarScoreSummaryFromReviewSummary(reviewSummary),
  };
}

function tryExtractRecentReviews(nextData: unknown, limit = 20): SmartstoreRecentReviewItem[] {
  const patterns = [/reviewList/i, /reviews/i, /recentReview/i];
  const matches = collectKeyMatches(nextData, patterns);

  // pick first array-like match that contains object entries with text/content
  const arrays = matches
    .map((m) => m.value)
    .filter(Array.isArray) as unknown[][];

  const best = arrays.find((arr) => arr.some((v) => {
    const o = asRecord(v);
    return Boolean(o && (o.content || o.reviewContent || o.text || o.body));
  }));
  if (!best) return [];

  const out: SmartstoreRecentReviewItem[] = [];
  for (const raw of best) {
    if (out.length >= limit) break;
    const o = asRecord(raw);
    if (!o) continue;

    const content =
      safeString(o.content) ??
      safeString(o.reviewContent) ??
      safeString(o.text) ??
      safeString(o.body) ??
      "";
    const norm = normalizeWhitespace(content);
    if (!norm) continue;

    const author =
      safeString(o.author) ??
      safeString(o.writer) ??
      safeString(o.nickname) ??
      safeString(o.memberName) ??
      null;

    const rating =
      safeNumber(o.rating) ??
      safeNumber(o.score) ??
      safeNumber(o.starScore) ??
      null;

    const ts =
      safeString(o.postedAt) ??
      safeString(o.createdAt) ??
      safeString(o.date) ??
      safeString(o.regTime) ??
      null;
    const postedAt = (() => {
      if (!ts) return null;
      const d = new Date(ts);
      return Number.isFinite(d.getTime()) ? d : null;
    })();

    const reviewKey =
      safeString(o.reviewKey) ??
      safeString(o.reviewId) ??
      safeString(o.id) ??
      `${postedAt ? postedAt.toISOString() : "no-date"}:${norm.slice(0, 32)}`;

    out.push({
      reviewKey,
      postedAt,
      rating: rating == null ? null : clampInt(rating, 0, 5),
      author,
      content: norm.slice(0, 800),
    });
  }

  return out;
}

function toMobileProductUrl(productUrl: string, productId: string): string {
  try {
    const u = new URL(productUrl.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    const storeSlug = pi > 0 ? segs[pi - 1] : null;
    if (!storeSlug) return productUrl;
    if (host === "brand.naver.com") {
      return `https://m.brand.naver.com/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(
        productId
      )}`;
    }
    if (host === "smartstore.naver.com") {
      return `https://m.smartstore.naver.com/${encodeURIComponent(
        storeSlug
      )}/products/${encodeURIComponent(productId)}`;
    }
  } catch {
    // ignore
  }
  return productUrl;
}

async function fetchMobileHtml(url: string): Promise<{ status: number; finalUrl: string; html: string }> {
  await randomSmartstoreDelay("ranking");
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": MOBILE_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://m.smartstore.naver.com/",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (res.status === 429) {
    await cooldownOn429();
    throw new SmartstoreNaverRateLimitedError(
      "보안 차단 감지: 네이버가 요청을 일시적으로 제한(HTTP 429)했습니다."
    );
  }

  const html = await res.text();
  return { status: res.status, finalUrl: res.url || url, html };
}

export async function fetchSmartstoreReviewSnapshot(input: {
  productUrl: string;
  productId: string;
}): Promise<FetchSmartstoreReviewResult> {
  const productUrl = input.productUrl.trim();
  const productId = String(input.productId ?? "").trim();
  const mobileUrl = toMobileProductUrl(productUrl, productId);

  console.log(`${LOG_P} started`, { productId, productUrl, mobileUrl });
  const { status, finalUrl, html } = await fetchMobileHtml(mobileUrl);
  console.log(`${LOG_P} fetched`, { httpStatus: status, finalUrl, htmlLen: html.length });

  const nextData = extractNextDataJson(html);
  if (!nextData) {
    console.warn(`${LOG_P} __NEXT_DATA__ not found`, { productId, finalUrl });
  }

  const summary = extractReviewSummary(nextData);
  const recentReviews = tryExtractRecentReviews(nextData, 20);

  return {
    productPageUrl: finalUrl,
    summary,
    recentReviews,
  };
}

