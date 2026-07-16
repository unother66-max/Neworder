import { buildPcmapPlaceListRequestBatch } from "./pcmap-place-list-request";

export type NaverPlaceType = "restaurant" | "place";
export type KeywordCollectionStatus = "AVAILABLE" | "UNAVAILABLE";

export type ReviewSnapshot = {
  ok: boolean;
  reason: string | null;
  debugReason: string | null;
  hintType: NaverPlaceType | null;
  chosenType: NaverPlaceType | null;
  triedTypes: NaverPlaceType[];
  requestUrls: string[];
  cacheStatus: "MISS" | "IN_FLIGHT_DEDUPE" | "FORCE_BYPASS";
  totalReviewCount: number | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCountText: string | null;
  /** 네이버 업체 정보(/information)의 업체 소개 키워드 */
  registeredKeywords: string[] | null;
  registeredKeywordsStatus: KeywordCollectionStatus;
  /** GraphQL microReview 기반 방문자 리뷰 특징 */
  reviewFeatureKeywords: string[] | null;
  reviewFeatureKeywordsStatus: KeywordCollectionStatus;
  /** @deprecated PlaceReviewHistory 호환용. registeredKeywords와 동일하다. */
  keywordList: string[] | null;
  /** @deprecated registeredKeywordsStatus와 동일하다. */
  keywordListStatus: KeywordCollectionStatus;
};

export type GetReviewSnapshotInput = {
  placeUrl: string;
  placeName?: string | null;
  category?: string | null;
  businessType?: string | null;
  placeId?: string | null;
  pcmapUrl?: string | null;
  x?: string | null;
  y?: string | null;
  force?: boolean;
  /** false면 리뷰/저장 수는 수집하되 /information 등록 키워드 요청만 생략한다. */
  collectRegisteredKeywords?: boolean;
};

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";

declare global {
  var __placeReviewSnapshotInFlight:
    | Map<string, Promise<ReviewSnapshot>>
    | undefined;
}

const snapshotInFlight =
  globalThis.__placeReviewSnapshotInFlight ?? new Map<string, Promise<ReviewSnapshot>>();
globalThis.__placeReviewSnapshotInFlight = snapshotInFlight;

export function resolveSnapshotRequestCacheStatus(
  force: boolean,
  hasInFlight: boolean
): ReviewSnapshot["cacheStatus"] {
  if (force) return "FORCE_BYPASS";
  return hasInFlight ? "IN_FLIGHT_DEDUPE" : "MISS";
}

function extractPublicPlaceId(placeUrl?: string | null) {
  if (!placeUrl) return "";

  const matched =
    placeUrl.match(/restaurant\/(\d+)/) ||
    placeUrl.match(/place\/(\d+)/) ||
    placeUrl.match(/placeId=(\d+)/) ||
    placeUrl.match(/entry\/place\/(\d+)/);

  return matched?.[1] ?? "";
}

function parseKoreanNumber(value: unknown) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).replace(/,/g, "").trim();
  if (!raw) return null;

  if (/^\d+\+$/.test(raw)) {
    return Number(raw.replace("+", ""));
  }

  const manMatch = raw.match(/^(\d+(?:\.\d+)?)만\+?$/);
  if (manMatch) {
    return Math.round(Number(manMatch[1]) * 10000);
  }

  const cheonMatch = raw.match(/^(\d+(?:\.\d+)?)천\+?$/);
  if (cheonMatch) {
    return Math.round(Number(cheonMatch[1]) * 1000);
  }

  const only = raw.replace(/[^\d.]/g, "");
  if (!only) return null;

  const num = Number(only);
  return Number.isFinite(num) ? num : null;
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

function detectNaverBlockReason(status: number, body: string): string | null {
  if (status === 429) return "COOLDOWN_HTTP_429";
  if (status === 403) return "BLOCKED_HTTP_403";
  if (
    /"pageId"\s*:\s*"ncaptcha/i.test(body) ||
    /"ncaptcha"\s*:\s*\{/i.test(body) ||
    /"confirmRules"\s*:\s*"CE_/i.test(body) ||
    /ncaptcha-all-search-no-result/i.test(body) ||
    /요청.{0,10}(차단|제한)/i.test(body)
  ) {
    return "NCAPTCHA";
  }
  return null;
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://map.naver.com/",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1",
    },
    cache: "no-store",
  });

  const html = await res.text();
  const blockReason = detectNaverBlockReason(res.status, html);
  return {
    html,
    status: res.status,
    ok: res.ok,
    blocked: blockReason !== null,
    blockReason,
    finalUrl: res.url || url,
  };
}

function findNextDataJson(html: string) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function collectKeyMatches(
  input: unknown,
  keyPatterns: RegExp[],
  results: Array<{ key: string; value: unknown }> = []
) {
  if (!input || typeof input !== "object") return results;

  if (Array.isArray(input)) {
    for (const item of input) {
      collectKeyMatches(item, keyPatterns, results);
    }
    return results;
  }

  for (const [key, value] of Object.entries(input)) {
    if (keyPatterns.some((pattern) => pattern.test(key))) {
      results.push({ key, value });
    }
    collectKeyMatches(value, keyPatterns, results);
  }

  return results;
}

function pickBestNumber(
  matches: Array<{ key: string; value: unknown }>,
  preferredKeyPatterns: RegExp[] = []
) {
  for (const pattern of preferredKeyPatterns) {
    for (const item of matches) {
      if (pattern.test(item.key)) {
        const parsed = parseKoreanNumber(item.value);
        if (parsed !== null) return parsed;
      }
    }
  }

  for (const item of matches) {
    const parsed = parseKoreanNumber(item.value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractCountsFromJsonObject(json: unknown) {
  if (!json) {
    return {
      visitorReviewCount: null,
      blogReviewCount: null,
      saveCount: null,
    };
  }

  const visitorMatches = collectKeyMatches(json, [
    /visitorReviewCount/i,
    /visitorReview/i,
  ]);

  const blogMatches = collectKeyMatches(json, [
    /blogReviewCount/i,
    /blogReview/i,
  ]);

  const saveMatches = collectKeyMatches(json, [
    /^saveCount$/i,
    /^savedCount$/i,
    /bookmarkCount/i,
    /keepCount/i,
    /pickCount/i,
    /zzimCount/i,
    /favoriteCount/i,
    /scrapCount/i,
    /wishCount/i,
    /interestCount/i,
  ]);

  const visitorReviewCount = pickBestNumber(visitorMatches, [
    /^visitorReviewCount$/i,
  ]);

  const blogReviewCount = pickBestNumber(blogMatches, [
    /^blogReviewCount$/i,
  ]);

  const saveCount = pickBestNumber(saveMatches, [
    /^saveCount$/i,
    /^savedCount$/i,
    /bookmarkCount/i,
    /keepCount/i,
    /pickCount/i,
    /zzimCount/i,
    /favoriteCount/i,
  ]);

  return {
    visitorReviewCount,
    blogReviewCount,
    saveCount,
  };
}

function extractCountByLabel(html: string, labels: string[]) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(`${escaped}\\s*([0-9][0-9,]*(?:\\.\\d+)?(?:만|천)?\\+?)`, "i"),
      new RegExp(`([0-9][0-9,]*(?:\\.\\d+)?(?:만|천)?\\+?)\\s*${escaped}`, "i"),
      new RegExp(`${escaped}[^0-9]{0,10}([0-9][0-9,]*(?:\\.\\d+)?(?:만|천)?\\+?)`, "i"),
    ];

    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) {
        const parsed = parseKoreanNumber(matched[1]);
        if (parsed !== null) return parsed;
      }
    }
  }

  return null;
}

function extractSaveCountFromRawHtml(html: string) {
  const patterns = [
    /"saveCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"savedCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"bookmarkCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"keepCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"pickCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"zzimCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"favoriteCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"scrapCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"wishCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
    /"interestCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?)"?/i,
  ];

  for (const pattern of patterns) {
    const matched = html.match(pattern);
    if (matched?.[1]) {
      const parsed = parseKoreanNumber(matched[1]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

export function extractReviewCountsFromRawHtml(html: string) {
  const extract = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const matched = html.match(pattern);
      if (matched?.[1]) {
        const parsed = parseKoreanNumber(matched[1]);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  };

  return {
    visitorReviewCount: extract([
      /"visitorReviewCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?\+?)"?/i,
      /"placeReviewCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?\+?)"?/i,
      /(?:"|\\")visitorReviewsTotal(?:"|\\")\s*:\s*"?([0-9][0-9,]*)"?/i,
    ]),
    blogReviewCount: extract([
      /"blogReviewCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?\+?)"?/i,
      /"blogCafeReviewCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?\+?)"?/i,
      /(?:"|\\")cafeBlogReviewsTotal(?:"|\\")\s*:\s*"?([0-9][0-9,]*)"?/i,
    ]),
  };
}

type KeywordParseResult = {
  keywords: string[] | null;
  status: KeywordCollectionStatus;
};

function normalizeKeywordText(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const normalized = value
    .normalize("NFKC")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[#\s]+|[#\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const split = /[,|]/.test(normalized)
    ? normalized.split(/[,|]/)
    : [normalized];
  return split
    .map((item) => item.replace(/^[#\s]+|[#\s]+$/g, "").trim())
    .filter((item) => item.length > 0 && item.length <= 80);
}

function normalizeKeywordValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeKeywordValue(item));
  }
  if (typeof value === "string") {
    return normalizeKeywordText(value);
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  for (const key of [
    "name",
    "displayName",
    "keyword",
    "text",
    "label",
    "review",
    "value",
  ]) {
    if (typeof record[key] === "string") {
      return normalizeKeywordText(record[key]);
    }
  }
  return [];
}

function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= 10) break;
  }
  return result;
}

export function extractReviewFeatureKeywordsFromObject(
  input: unknown
): KeywordParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { keywords: null, status: "UNAVAILABLE" };
  }

  const record = input as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "microReview")) {
    return { keywords: null, status: "UNAVAILABLE" };
  }

  return {
    keywords: uniqueKeywords(normalizeKeywordValue(record.microReview)),
    status: "AVAILABLE",
  };
}

/**
 * /place-review가 기존부터 사용하던 업체 등록 키워드 파서.
 * `/information` 초기 상태의 `keywordList`만 읽고 microReview는 섞지 않는다.
 */
export function extractRegisteredKeywordsFromHtml(
  html: string
): KeywordParseResult {
  // /place-review의 기존 정상 동작과 같은 첫 keywordList 배열을 우선한다.
  const matched = html.match(
    /(?:\\"|")keywordList(?:\\"|")\s*:\s*(\[[\s\S]*?\])/i
  );
  if (matched?.[1]) {
    try {
      const parsed = JSON.parse(matched[1].replace(/\\"/g, '"'));
      return {
        keywords: uniqueKeywords(normalizeKeywordValue(parsed)),
        status: "AVAILABLE",
      };
    } catch {
      return { keywords: null, status: "UNAVAILABLE" };
    }
  }

  const nextData = findNextDataJson(html);
  const matches = collectKeyMatches(nextData, [/^keywordList$/i]);
  if (matches.length > 0) {
    return {
      keywords: uniqueKeywords(normalizeKeywordValue(matches[0]?.value)),
      status: "AVAILABLE",
    };
  }
  return { keywords: null, status: "UNAVAILABLE" };
}

export type ParsedTypeResult = {
  type: NaverPlaceType;
  pageMetricCount: number;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: number | null;
  registeredKeywords: string[] | null;
  registeredKeywordsStatus: KeywordCollectionStatus;
  reviewFeatureKeywords: string[] | null;
  reviewFeatureKeywordsStatus: KeywordCollectionStatus;
  /** @deprecated registeredKeywords alias */
  keywordList: string[] | null;
  /** @deprecated registeredKeywordsStatus alias */
  keywordListStatus: KeywordCollectionStatus;
  blocked?: boolean;
  debugReason?: string | null;
  requestUrls?: string[];
  operationName?: string;
};

export function chooseBestPlaceTypeResult<T extends ParsedTypeResult>(
  results: T[]
) {
  const score = (result: T) =>
    result.pageMetricCount * 10 +
    Number(result.visitorReviewCount !== null) * 4 +
    Number(result.blogReviewCount !== null) * 4 +
    Number(result.saveCount !== null) * 2 +
    Number((result.registeredKeywords?.length ?? 0) > 0);

  return [...results].sort((a, b) => score(b) - score(a))[0] ?? null;
}

const GENERAL_PLACE_PATTERN =
  /(필라테스|발레|바레|요가|피트니스|헬스|퍼스널트레이닝|\bpt\b|학원|교습|학교|병원|의원|치과|한의원|약국|미용실|헤어|네일|피부|뷰티|마사지|재활|체형교정|스포츠)/i;
const RESTAURANT_PATTERN =
  /(음식점|한식|양식|일식|중식|카페|커피|베이커리|디저트|술집|주점|맛집|레스토랑|피자|치킨|분식|고기|국수|요리)/i;

function typeFromBusinessType(value: unknown): NaverPlaceType | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (/^(restaurant|food|cafe)$/.test(normalized)) return "restaurant";
  if (/^(place|general|business)$/.test(normalized)) return "place";
  return null;
}

function typeFromUrl(value: unknown): NaverPlaceType | null {
  const url = String(value || "");
  if (/\/restaurant\//i.test(url)) return "restaurant";
  if (/\/place\//i.test(url) || /\/entry\/place\//i.test(url)) return "place";
  return null;
}

export function resolvePlaceTypeOrder(
  input: Pick<
    GetReviewSnapshotInput,
    "businessType" | "category" | "placeName" | "placeUrl" | "pcmapUrl"
  >
): NaverPlaceType[] {
  const explicit = typeFromBusinessType(input.businessType);
  if (explicit) {
    return explicit === "restaurant"
      ? ["restaurant", "place"]
      : ["place", "restaurant"];
  }

  const category = String(input.category || "");
  if (GENERAL_PLACE_PATTERN.test(category)) return ["place", "restaurant"];
  if (RESTAURANT_PATTERN.test(category)) return ["restaurant", "place"];

  const pcmapHint = typeFromUrl(input.pcmapUrl);
  if (pcmapHint) {
    return pcmapHint === "restaurant"
      ? ["restaurant", "place"]
      : ["place", "restaurant"];
  }

  const name = String(input.placeName || "");
  if (GENERAL_PLACE_PATTERN.test(name)) return ["place", "restaurant"];
  if (RESTAURANT_PATTERN.test(name)) return ["restaurant", "place"];

  const urlHint = typeFromUrl(input.placeUrl) ?? "place";
  return urlHint === "restaurant"
    ? ["restaurant", "place"]
    : ["place", "restaurant"];
}

function hasCompleteMetrics(result: ParsedTypeResult | null | undefined) {
  return (
    result?.visitorReviewCount !== null &&
    result?.visitorReviewCount !== undefined &&
    result.blogReviewCount !== null &&
    result.blogReviewCount !== undefined &&
    result.saveCount !== null &&
    result.saveCount !== undefined
  );
}

export async function runPlaceTypeAttempts(
  typeOrder: NaverPlaceType[],
  loadAttempt: (type: NaverPlaceType) => Promise<ParsedTypeResult>
): Promise<{
  chosen: ParsedTypeResult | null;
  attempts: ParsedTypeResult[];
  stoppedByBlock: boolean;
}> {
  const attempts: ParsedTypeResult[] = [];
  for (const type of typeOrder) {
    const attempt = await loadAttempt(type);
    attempts.push(attempt);
    if (hasCompleteMetrics(attempt)) {
      return { chosen: attempt, attempts, stoppedByBlock: false };
    }
    if (attempt.blocked) {
      return { chosen: attempt, attempts, stoppedByBlock: true };
    }
  }
  return {
    chosen: chooseBestPlaceTypeResult(attempts),
    attempts,
    stoppedByBlock: false,
  };
}

type GraphqlCountsResult = {
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: number | null;
  reviewFeatureKeywords: string[] | null;
  reviewFeatureKeywordsStatus: KeywordCollectionStatus;
  blocked: boolean;
  debugReason: string | null;
  requestUrl: string;
  operationName: string;
};

async function fetchCountsFromGraphql(
  type: NaverPlaceType,
  keyword: string,
  targetName: string,
  publicPlaceId: string,
  x?: string | null,
  y?: string | null
) : Promise<GraphqlCountsResult> {
  const operationName =
    type === "restaurant" ? "getRestaurantsPcmap" : "getPlacesList";
  const alias = type === "restaurant" ? "restaurants" : "places";
  const empty = (debugReason: string | null, blocked = false): GraphqlCountsResult => ({
    visitorReviewCount: null,
    blogReviewCount: null,
    saveCount: null,
    reviewFeatureKeywords: null,
    reviewFeatureKeywordsStatus: "UNAVAILABLE",
    blocked,
    debugReason,
    requestUrl: GRAPHQL_URL,
    operationName,
  });
  try {
    const safeX = String(x || "127.0005");
    const safeY = String(y || "37.53455");

    const payload = buildPcmapPlaceListRequestBatch({
      businessType: type,
      keyword,
      x: safeX,
      y: safeY,
      start: 1,
      display: 70,
    });

    const referer = `https://pcmap.place.naver.com/${type}/list?query=${encodeURIComponent(
      keyword
    )}&x=${safeX}&y=${safeY}`;

    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://pcmap.place.naver.com",
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "X-Wtm-NCaptcha-Token": "NCAPTCHA_FALLBACK_NO_OBJECT",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const raw = await res.text();
    const blockReason = detectNaverBlockReason(res.status, raw);
    if (blockReason) return empty(`${type}:GRAPHQL_${blockReason}`, true);
    if (!res.ok) return empty(`${type}:GRAPHQL_HTTP_${res.status}`);

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return empty(`${type}:GRAPHQL_NON_JSON`);
    }
    const root = Array.isArray(json) ? json[0] : json;
    const rootRecord = root && typeof root === "object"
      ? (root as Record<string, unknown>)
      : null;
    const errors = rootRecord && Array.isArray(rootRecord.errors)
      ? rootRecord.errors
      : [];
    if (errors.length > 0) {
      const first = errors[0] as { message?: unknown };
      const message = String(first?.message || "GRAPHQL_ERROR")
        .replace(/https?:\/\/\S+/gi, "[URL]")
        .replace(/\s+/g, " ")
        .slice(0, 160);
      const errorBlockReason = detectNaverBlockReason(res.status, message);
      return empty(
        `${type}:GRAPHQL_ERROR:${message}`,
        errorBlockReason !== null
      );
    }
    const data = rootRecord?.data && typeof rootRecord.data === "object"
      ? (rootRecord.data as Record<string, unknown>)
      : null;
    const listRoot = data?.[alias] && typeof data[alias] === "object"
      ? (data[alias] as Record<string, unknown>)
      : null;
    const businesses = listRoot?.businesses && typeof listRoot.businesses === "object"
      ? (listRoot.businesses as Record<string, unknown>)
      : null;
    const items = Array.isArray(businesses?.items)
      ? (businesses.items as Array<Record<string, unknown>>)
      : [];
    const normalizedTarget = normalizeText(targetName);

    const found =
      items.find((item) => String(item?.id || "") === publicPlaceId) ||
      items.find((item) => normalizeText(String(item?.name || "")) === normalizedTarget) ||
      items.find((item) => normalizeText(String(item?.name || "")).includes(normalizedTarget)) ||
      items.find((item) => normalizedTarget.includes(normalizeText(String(item?.name || ""))));

    if (!found) {
      console.log("[review graphql not found]", {
        type,
        operationName,
        keyword,
        targetName,
        sample: items.slice(0, 10).map((item) => ({
          id: item?.id,
          name: item?.name,
          saveCount: item?.saveCount,
        })),
      });
      return empty(`${type}:GRAPHQL_TARGET_NOT_FOUND`);
    }

    const reviewFeatureKeywords =
      extractReviewFeatureKeywordsFromObject(found);

    return {
      visitorReviewCount: parseKoreanNumber(found?.visitorReviewCount),
      blogReviewCount: parseKoreanNumber(found?.blogCafeReviewCount),
      saveCount: parseKoreanNumber(found?.saveCount),
      reviewFeatureKeywords: reviewFeatureKeywords.keywords,
      reviewFeatureKeywordsStatus: reviewFeatureKeywords.status,
      blocked: false,
      debugReason: null,
      requestUrl: GRAPHQL_URL,
      operationName,
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UNKNOWN";
    return empty(`${type}:GRAPHQL_FETCH_ERROR:${errorName}`);
  }
}

function parseHtmlMetrics(html: string) {
  const jsonParsed = extractCountsFromJsonObject(findNextDataJson(html));
  const rawParsed = extractReviewCountsFromRawHtml(html);
  return {
    visitorReviewCount:
      jsonParsed.visitorReviewCount ??
      rawParsed.visitorReviewCount ??
      extractCountByLabel(html, ["방문자 리뷰", "방문자리뷰"]),
    blogReviewCount:
      jsonParsed.blogReviewCount ??
      rawParsed.blogReviewCount ??
      extractCountByLabel(html, ["블로그 리뷰", "블로그리뷰"]),
    saveCount:
      jsonParsed.saveCount ??
      extractSaveCountFromRawHtml(html) ??
      extractCountByLabel(html, ["저장", "저장수"]),
  };
}

async function fetchTypeAttempt(
  type: NaverPlaceType,
  input: GetReviewSnapshotInput,
  publicPlaceId: string
): Promise<ParsedTypeResult> {
  const collectRegisteredKeywords = input.collectRegisteredKeywords !== false;
  const placeName = String(input.placeName || "");
  const graphql = await fetchCountsFromGraphql(
    type,
    placeName,
    placeName,
    publicPlaceId,
    input.x,
    input.y
  );
  const requestUrls = [graphql.requestUrl];
  let visitorReviewCount = graphql.visitorReviewCount;
  let blogReviewCount = graphql.blogReviewCount;
  let saveCount = graphql.saveCount;
  let registeredKeywords: string[] | null = null;
  let registeredKeywordsStatus: KeywordCollectionStatus = "UNAVAILABLE";
  const reviewFeatureKeywords = graphql.reviewFeatureKeywords;
  const reviewFeatureKeywordsStatus = graphql.reviewFeatureKeywordsStatus;
  let pageMetricCount = 0;
  const debugReasons = graphql.debugReason ? [graphql.debugReason] : [];

  const finish = (blocked = false): ParsedTypeResult => {
    const complete = hasCompleteMetrics({
      type,
      pageMetricCount,
      visitorReviewCount,
      blogReviewCount,
      saveCount,
      registeredKeywords,
      registeredKeywordsStatus,
      reviewFeatureKeywords,
      reviewFeatureKeywordsStatus,
      keywordList: registeredKeywords,
      keywordListStatus: registeredKeywordsStatus,
    });
    return {
      type,
      pageMetricCount,
      visitorReviewCount,
      blogReviewCount,
      saveCount,
      registeredKeywords,
      registeredKeywordsStatus,
      reviewFeatureKeywords,
      reviewFeatureKeywordsStatus,
      keywordList: registeredKeywords,
      keywordListStatus: registeredKeywordsStatus,
      blocked,
      debugReason:
        debugReasons.join("|") ||
        (blocked || !complete ? `${type}:METRICS_INCOMPLETE` : null),
      requestUrls,
      operationName: graphql.operationName,
    };
  };

  const graphqlMetricsComplete = hasCompleteMetrics(finish());
  if (graphql.blocked) {
    return finish(graphql.blocked);
  }
  if (graphqlMetricsComplete && !collectRegisteredKeywords) {
    return finish();
  }

  const informationUrl =
    `https://pcmap.place.naver.com/${type}/${publicPlaceId}/information`;
  const urls = graphqlMetricsComplete
    ? [informationUrl]
    : collectRegisteredKeywords
      ? [
          `https://m.place.naver.com/${type}/${publicPlaceId}/home`,
          `https://m.place.naver.com/${type}/${publicPlaceId}/review/visitor?entry=ple&reviewSort=recent`,
          informationUrl,
          `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`,
        ]
      : [
          `https://m.place.naver.com/${type}/${publicPlaceId}/home`,
          `https://m.place.naver.com/${type}/${publicPlaceId}/review/visitor?entry=ple&reviewSort=recent`,
          `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`,
        ];

  let registeredKeywordRequestAttempted = false;
  for (const url of urls) {
    const isInformationRequest = url.includes("/information");
    if (isInformationRequest) registeredKeywordRequestAttempted = true;
    const response = await fetchHtml(url);
    requestUrls.push(response.finalUrl);
    if (response.blocked) {
      debugReasons.push(`${type}:HTML_${response.blockReason}`);
      return finish(true);
    }
    if (!response.ok) {
      debugReasons.push(`${type}:HTML_HTTP_${response.status}`);
      if (isInformationRequest && hasCompleteMetrics(finish())) return finish();
      continue;
    }

    const metrics = parseHtmlMetrics(response.html);
    if (visitorReviewCount === null && metrics.visitorReviewCount !== null) {
      visitorReviewCount = metrics.visitorReviewCount;
      pageMetricCount += 1;
    }
    if (blogReviewCount === null && metrics.blogReviewCount !== null) {
      blogReviewCount = metrics.blogReviewCount;
      pageMetricCount += 1;
    }
    if (saveCount === null && metrics.saveCount !== null) {
      saveCount = metrics.saveCount;
    }
    if (isInformationRequest) {
      const parsedRegisteredKeywords =
        extractRegisteredKeywordsFromHtml(response.html);
      registeredKeywords = parsedRegisteredKeywords.keywords;
      registeredKeywordsStatus = parsedRegisteredKeywords.status;
      if (parsedRegisteredKeywords.status === "UNAVAILABLE") {
        debugReasons.push(`${type}:REGISTERED_KEYWORDS_UNAVAILABLE`);
      }
    }
    if (
      hasCompleteMetrics(finish()) &&
      (!collectRegisteredKeywords ||
        registeredKeywordsStatus === "AVAILABLE" ||
        registeredKeywordRequestAttempted)
    ) {
      return finish();
    }
  }

  if (saveCount === null) {
    debugReasons.push(`${type}:SAVE_COUNT_UNAVAILABLE`);
  }

  return finish();
}

async function fetchSnapshotCore(
  input: GetReviewSnapshotInput,
  cacheStatus: ReviewSnapshot["cacheStatus"]
): Promise<ReviewSnapshot> {
  try {
    const placeUrl = input.placeUrl;
    const placeName = String(input.placeName || "");
    const publicPlaceId =
      String(input.placeId || "").trim() ||
      extractPublicPlaceId(input.pcmapUrl) ||
      extractPublicPlaceId(placeUrl);

    if (!publicPlaceId) {
      return {
        ok: false,
        reason: "PUBLIC_PLACE_ID_MISSING",
        debugReason: "PUBLIC_PLACE_ID_MISSING",
        hintType: null,
        chosenType: null,
        triedTypes: [],
        requestUrls: [],
        cacheStatus,
        totalReviewCount: null,
        visitorReviewCount: null,
        blogReviewCount: null,
        saveCountText: null,
        registeredKeywords: null,
        registeredKeywordsStatus: "UNAVAILABLE",
        reviewFeatureKeywords: null,
        reviewFeatureKeywordsStatus: "UNAVAILABLE",
        keywordList: null,
        keywordListStatus: "UNAVAILABLE",
      };
    }

    const typeOrder = resolvePlaceTypeOrder(input);
    const hintType = typeOrder[0] ?? null;
    const attempted = await runPlaceTypeAttempts(typeOrder, (type) =>
      fetchTypeAttempt(type, input, publicPlaceId)
    );
    const parsed = attempted.chosen;
    const triedTypes = attempted.attempts.map((result) => result.type);
    const requestUrls = attempted.attempts.flatMap(
      (result) => result.requestUrls ?? []
    );
    const complete = hasCompleteMetrics(parsed);
    const blockedReason = attempted.attempts
      .map((result) => result.debugReason || "")
      .find((reason) => /NCAPTCHA|COOLDOWN|BLOCKED_HTTP/i.test(reason));
    const reason = complete
      ? null
      : blockedReason
        ? /COOLDOWN/i.test(blockedReason)
          ? "NAVER_COOLDOWN"
          : "NAVER_BLOCKED_OR_CAPTCHA"
        : "REVIEW_METRICS_INCOMPLETE";
    const debugReason = complete
      ? parsed?.debugReason ?? null
      : attempted.attempts
          .map((result) => result.debugReason)
          .filter(Boolean)
          .join("|") || reason;

    console.log("[review snapshot parsed]", {
      publicPlaceId,
      placeName,
      category: input.category ?? null,
      businessType: input.businessType ?? null,
      placeUrl,
      pcmapUrl: input.pcmapUrl ?? null,
      hintType,
      chosenType: parsed?.type,
      triedTypes: attempted.attempts.map((result) => ({
        type: result.type,
        operationName: result.operationName,
        requestUrls: result.requestUrls,
        blocked: result.blocked,
        debugReason: result.debugReason,
        visitorReviewCount: result.visitorReviewCount,
        blogReviewCount: result.blogReviewCount,
        saveCount: result.saveCount,
        registeredKeywords: result.registeredKeywords,
        registeredKeywordsStatus: result.registeredKeywordsStatus,
        reviewFeatureKeywords: result.reviewFeatureKeywords,
        reviewFeatureKeywordsStatus: result.reviewFeatureKeywordsStatus,
      })),
      visitorReviewCount: parsed?.visitorReviewCount ?? null,
      blogReviewCount: parsed?.blogReviewCount ?? null,
      saveCount: parsed?.saveCount ?? null,
      registeredKeywords: parsed?.registeredKeywords ?? null,
      registeredKeywordsStatus:
        parsed?.registeredKeywordsStatus ?? "UNAVAILABLE",
      reviewFeatureKeywords: parsed?.reviewFeatureKeywords ?? null,
      reviewFeatureKeywordsStatus:
        parsed?.reviewFeatureKeywordsStatus ?? "UNAVAILABLE",
      reason,
      debugReason,
    });

    return {
      ok: complete,
      reason,
      debugReason,
      hintType,
      chosenType: parsed?.type ?? null,
      triedTypes,
      requestUrls,
      cacheStatus,
      totalReviewCount:
        parsed?.visitorReviewCount !== null &&
        parsed?.visitorReviewCount !== undefined &&
        parsed?.blogReviewCount !== null &&
        parsed?.blogReviewCount !== undefined
          ? parsed.visitorReviewCount + parsed.blogReviewCount
          : null,
      visitorReviewCount: parsed?.visitorReviewCount ?? null,
      blogReviewCount: parsed?.blogReviewCount ?? null,
      saveCountText: parsed?.saveCount != null ? String(parsed.saveCount) : null,
      registeredKeywords: parsed?.registeredKeywords ?? null,
      registeredKeywordsStatus:
        parsed?.registeredKeywordsStatus ?? "UNAVAILABLE",
      reviewFeatureKeywords: parsed?.reviewFeatureKeywords ?? null,
      reviewFeatureKeywordsStatus:
        parsed?.reviewFeatureKeywordsStatus ?? "UNAVAILABLE",
      keywordList: parsed?.registeredKeywords ?? null,
      keywordListStatus:
        parsed?.registeredKeywordsStatus ?? "UNAVAILABLE",
    };

    } catch (error) {
  console.error("[getNaverPlaceReviewSnapshot error]", error);

  return {
    ok: false,
    reason: error instanceof Error ? `FETCH_ERROR:${error.name}` : "FETCH_ERROR",
    debugReason: error instanceof Error ? `FETCH_ERROR:${error.name}` : "FETCH_ERROR",
    hintType: null,
    chosenType: null,
    triedTypes: [],
    requestUrls: [],
    cacheStatus,
    totalReviewCount: null,
    visitorReviewCount: null,
    blogReviewCount: null,
    saveCountText: null,
    registeredKeywords: null,
    registeredKeywordsStatus: "UNAVAILABLE",
    reviewFeatureKeywords: null,
    reviewFeatureKeywordsStatus: "UNAVAILABLE",
    keywordList: null,
    keywordListStatus: "UNAVAILABLE",
  };
}
}

export async function getNaverPlaceReviewSnapshot(
  input: string | GetReviewSnapshotInput
): Promise<ReviewSnapshot> {
  const normalized: GetReviewSnapshotInput =
    typeof input === "string" ? { placeUrl: input } : input;
  const force = normalized.force === true;
  // 등록 키워드 수집 여부로 key를 나누면 같은 업체의 GraphQL metric 요청이
  // 중복된다. /place-analysis가 DB lease로 keyword refresh 소유자를 정하므로
  // 동일 업체 스냅샷은 기존처럼 하나의 in-flight 요청을 공유한다.
  const key = [
    normalized.placeUrl,
    normalized.placeName ?? "",
    normalized.category ?? "",
    normalized.businessType ?? "",
    normalized.placeId ?? "",
    normalized.pcmapUrl ?? "",
    normalized.x ?? "",
    normalized.y ?? "",
  ].join("|");

  if (force) {
    return fetchSnapshotCore(
      normalized,
      resolveSnapshotRequestCacheStatus(true, snapshotInFlight.has(key))
    );
  }

  const existing = snapshotInFlight.get(key);
  if (existing) {
    const result = await existing;
    return {
      ...result,
      cacheStatus: resolveSnapshotRequestCacheStatus(false, true),
    };
  }

  const pending = fetchSnapshotCore(
    normalized,
    resolveSnapshotRequestCacheStatus(false, false)
  );
  snapshotInFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (snapshotInFlight.get(key) === pending) snapshotInFlight.delete(key);
  }
}
