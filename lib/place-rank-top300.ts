import {
  buildGetPlacesListFetchHeadersForServer,
  NAVER_PCMAP_GRAPHQL_URL,
  pickBusinessesCoords,
} from "./naver-map-businesses-shared";
import { parseNullableNaverReviewCountField } from "./merge-pcmap-businesses-batch";
import { buildPcmapPlaceListRequestPayload } from "./pcmap-place-list-request";
import { resolvePlaceRankSearchMode } from "./place-rank-search-mode";

const TOP300_LIMIT = 300;
/** 기존 플레이스 순위 조회와 동일한 pcmap 목록 크기. */
const TOP300_PAGE_SIZE = 70;
const TOP300_PAGE_COUNT = Math.ceil(TOP300_LIMIT / TOP300_PAGE_SIZE);
const KEYWORD_MAX_LENGTH = 100;

type JsonRecord = Record<string, unknown>;

export type PlaceRankTop300Row = {
  rank: number;
  placeId: string;
  name: string;
  category: string;
  thumbnail?: string;
  address?: string;
  rating: string | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: string | null;
};

export type PlaceRankTop300Result = {
  keyword: string;
  total: number;
  availableTotal: number;
  results: PlaceRankTop300Row[];
  searchMode: "restaurant" | "place";
  source: "pcmap-place-list";
  naverRequestCount: number;
  requestOperationCount: number;
  requestedStarts: number[];
  completedPages: number;
  duplicateCount: number;
  invalidItemCount: number;
  partial: boolean;
};

export type Top300KeywordValidation =
  | { ok: true; keyword: string }
  | { ok: false; message: string };

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type CollectOptions = {
  fetchImpl?: FetchLike;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textField(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function numericTotal(value: unknown): number {
  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function ratingField(value: unknown): string | null {
  const raw = textField(value);
  const numeric = Number(raw);
  return raw && Number.isFinite(numeric) && numeric > 0 && numeric <= 5
    ? raw
    : null;
}

function saveCountField(value: unknown): string | null {
  const raw = textField(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    return `${Number(raw).toLocaleString("ko-KR")}+`;
  }
  return raw;
}

function firstImageUrl(item: JsonRecord): string {
  for (const value of [
    item.imageUrl,
    item.thumbnail,
    item.thumUrl,
    item.image,
  ]) {
    const url = textField(value);
    if (url) return url;
  }
  return "";
}

function batchBusinesses(
  part: unknown,
  searchMode: "restaurant" | "place"
): { items: unknown[]; total: number; valid: boolean; hasError: boolean } {
  if (!isRecord(part)) {
    return { items: [], total: 0, valid: false, hasError: true };
  }

  const hasError = Array.isArray(part.errors) && part.errors.length > 0;
  const data = isRecord(part.data) ? part.data : null;
  const alias = searchMode === "restaurant" ? "restaurants" : "places";
  const container = data && isRecord(data[alias]) ? data[alias] : null;
  const businesses =
    container && isRecord(container.businesses)
      ? container.businesses
      : null;

  if (!businesses) {
    return { items: [], total: 0, valid: false, hasError };
  }

  return {
    items: Array.isArray(businesses.items) ? businesses.items : [],
    total: numericTotal(businesses.total),
    valid: true,
    hasError,
  };
}

function mapTop300Row(
  item: unknown,
  rank: number
): PlaceRankTop300Row | null {
  if (!isRecord(item)) return null;

  const placeId = textField(item.id);
  const name = textField(item.name);
  if (!placeId || !name) return null;

  const category =
    textField(item.category) || textField(item.businessCategory);
  const thumbnail = firstImageUrl(item);
  const address = textField(item.roadAddress) || textField(item.address);

  return {
    rank,
    placeId,
    name,
    category,
    ...(thumbnail ? { thumbnail } : {}),
    ...(address ? { address } : {}),
    rating: ratingField(item.visitorReviewScore),
    visitorReviewCount: parseNullableNaverReviewCountField(
      item.visitorReviewCount
    ),
    blogReviewCount: parseNullableNaverReviewCountField(
      item.blogCafeReviewCount
    ),
    saveCount: saveCountField(item.saveCount),
  };
}

export function validateTop300Keyword(
  value: unknown
): Top300KeywordValidation {
  if (typeof value !== "string") {
    return { ok: false, message: "검색 키워드를 입력해주세요." };
  }

  const keyword = value.trim().replace(/\s+/g, " ");
  if (!keyword) {
    return { ok: false, message: "검색 키워드를 입력해주세요." };
  }
  if (keyword.length > KEYWORD_MAX_LENGTH) {
    return {
      ok: false,
      message: `검색 키워드는 ${KEYWORD_MAX_LENGTH}자 이하로 입력해주세요.`,
    };
  }

  return { ok: true, keyword };
}

/**
 * pcmap placeList의 70개짜리 5페이지를 GraphQL batch 한 번으로 요청한다.
 * 목록 응답만 사용하며 업체별 상세·리뷰·키워드 API는 호출하지 않는다.
 */
export async function collectNaverPlaceTop300(
  keywordValue: string,
  options: CollectOptions = {}
): Promise<PlaceRankTop300Result> {
  const validation = validateTop300Keyword(keywordValue);
  if (!validation.ok) throw new TypeError(validation.message);

  const keyword = validation.keyword;
  const searchMode = resolvePlaceRankSearchMode({ keyword });
  const coords = pickBusinessesCoords(keyword);
  const requestedStarts = Array.from(
    { length: TOP300_PAGE_COUNT },
    (_, index) => 1 + index * TOP300_PAGE_SIZE
  );
  const requestBody = requestedStarts.map((start) =>
    buildPcmapPlaceListRequestPayload({
      businessType: searchMode,
      keyword,
      x: coords.x,
      y: coords.y,
      start,
      display: TOP300_PAGE_SIZE,
      includeDisplayFields: true,
    })
  );
  const headers = buildGetPlacesListFetchHeadersForServer(keyword, coords);
  if (searchMode === "restaurant") {
    headers.Referer =
      `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(keyword)}` +
      `&x=${coords.x}&y=${coords.y}`;
    headers.Accept = "application/json, text/plain, */*";
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(NAVER_PCMAP_GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`NAVER_PCMAP_HTTP_${response.status}`);
  }

  let batch: unknown;
  try {
    batch = JSON.parse(raw);
  } catch {
    throw new Error("NAVER_PCMAP_NON_JSON_RESPONSE");
  }
  if (!Array.isArray(batch)) {
    throw new Error("NAVER_PCMAP_INVALID_BATCH_RESPONSE");
  }

  const rawItems: unknown[] = [];
  let availableTotal = 0;
  let completedPages = 0;
  let failedPages = 0;

  for (let index = 0; index < requestedStarts.length; index += 1) {
    const page = batchBusinesses(batch[index], searchMode);
    availableTotal = Math.max(availableTotal, page.total);
    if (page.valid && !page.hasError) completedPages += 1;
    else failedPages += 1;
    rawItems.push(...page.items);
  }

  const seenPlaceIds = new Set<string>();
  const results: PlaceRankTop300Row[] = [];
  let duplicateCount = 0;
  let invalidItemCount = 0;

  for (const item of rawItems) {
    if (results.length >= TOP300_LIMIT) break;
    const row = mapTop300Row(item, results.length + 1);
    if (!row) {
      invalidItemCount += 1;
      continue;
    }
    if (seenPlaceIds.has(row.placeId)) {
      duplicateCount += 1;
      continue;
    }
    seenPlaceIds.add(row.placeId);
    results.push({ ...row, rank: results.length + 1 });
  }

  if (results.length === 0) {
    throw new Error("NAVER_PCMAP_EMPTY_RESULT");
  }

  return {
    keyword,
    total: results.length,
    availableTotal: Math.max(availableTotal, results.length),
    results,
    searchMode,
    source: "pcmap-place-list",
    naverRequestCount: 1,
    requestOperationCount: requestBody.length,
    requestedStarts,
    completedPages,
    duplicateCount,
    invalidItemCount,
    partial: failedPages > 0,
  };
}
