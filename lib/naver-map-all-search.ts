import {
  NAVER_MAP_GRAPHQL_UA,
  pickBusinessesCoords,
} from "./naver-map-businesses-shared";

/**
 * 네이버 지도 웹(map.naver.com) 통합 검색 API `allSearch` 응답 형식.
 * @see https://map.naver.com/p/search/… 에서 Network → allSearch
 *
 * `searchCoord`·`boundary`는 검색어 기준 `pickBusinessesCoords`(서울역·강남 등)로 맞춰
 * PC맵 GraphQL·지도 검색과 동일한 지역 컨텍스트를 씁니다.
 *
 * 무토큰 호출은 `buildAllSearchUrlCheckPlaceRankStyle` / `fetchAllSearchPlacesCheckPlaceRankStyle`.
 *
 * 토큰 기반 호출은 `fetchAllSearchPlacesWithTokenDetailed` 또는
 * `NAVER_MAP_ALL_SEARCH_TOKEN` / Playwright 자동 갱신(`fetchAllSearchPlacesAutoDetailed`).
 */

export const NAVER_MAP_ALL_SEARCH_URL =
  "https://map.naver.com/p/api/search/allSearch";

/** 레거시·테스트용 고정 좌표(시청 인근). 실제 URL 조립은 `pickBusinessesCoords` 우선 */
export const NAVER_MAP_ALL_SEARCH_CHECK_PLACE_X = "126.9779692";
export const NAVER_MAP_ALL_SEARCH_CHECK_PLACE_Y = "37.566535";

export const NAVER_MAP_ALL_SEARCH_CHECK_PLACE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)";

/** GraphQL `GraphqlItem` / place-rank-analyze 파이프라인과 맞춘 중간 형태 */
export type MapAllSearchPlaceRow = {
  id: string;
  name: string;
  category: string;
  roadAddress: string;
  address: string;
  x: string;
  y: string;
  thumUrl: string;
  /** 지도 JSON: placeReviewCount ≈ 방문자 리뷰, reviewCount ≈ 블로그 리뷰 */
  placeReviewCount: number;
  reviewCount: number;
  rank: number;
};

export type NaverMapAllSearchPlaceListItem = {
  index?: string;
  rank?: string;
  id?: string;
  name?: string;
  category?: string[];
  categoryPath?: string[];
  roadAddress?: string;
  address?: string;
  x?: string;
  y?: string;
  thumUrl?: string;
  imageUrl?: string;
  thumbnail?: string;
  reviewCount?: number;
  placeReviewCount?: number;
  visitorReviewCount?: number;
  blogCafeReviewCount?: number;
};

export type NaverMapAllSearchApiResult = {
  result?: {
    type?: string;
    place?: {
      page?: number;
      totalCount?: number;
      list?: NaverMapAllSearchPlaceListItem[];
      boundary?: string[];
    } | null;
    ncaptcha?: { confirmRules?: string };
    metaInfo?: { pageId?: string; searchedQuery?: string };
  };
};

type AllSearchPlaceBlock = {
  page?: number;
  totalCount?: number;
  list?: NaverMapAllSearchPlaceListItem[];
  boundary?: string[];
} | null;

/** `result.place` 또는 `data.result.place` (응답 변형 대응) */
export function getAllSearchPlaceBlock(json: unknown): AllSearchPlaceBlock {
  const j = json as NaverMapAllSearchApiResult & {
    data?: NaverMapAllSearchApiResult;
  };
  const p = j?.result?.place ?? j?.data?.result?.place;
  if (p === undefined) return null;
  return p ?? null;
}

/** 무토큰 allSearch URL — 검색어에 맞는 중심좌표(서울역·강남 등) */
export function buildAllSearchUrlCheckPlaceRankStyle(keyword: string): string {
  const trimmed = String(keyword || "").trim();
  const q = encodeURIComponent(trimmed);
  const { x, y } = pickBusinessesCoords(trimmed);
  const sc = `${x};${y}`;
  const boundary = `${x};${y};${x};${y}`;
  return `${NAVER_MAP_ALL_SEARCH_URL}?query=${q}&type=all&searchCoord=${sc}&boundary=${boundary}&sscode=svc.mapv5.search`;
}

export function buildAllSearchRefererCheckPlaceRankStyle(keyword: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(
    String(keyword || "").trim()
  )}?c=15.00,0,0,0,dh`;
}

/**
 * 토큰 allSearch URL 공통 — 검색어 기준 좌표(`pickBusinessesCoords`).
 */
export function buildNaverMapAllSearchParams(keyword: string): {
  query: string;
  searchCoord: string;
  boundary: string;
} {
  const trimmed = String(keyword || "").trim();
  const { x, y } = pickBusinessesCoords(trimmed);
  return {
    query: trimmed,
    searchCoord: `${x};${y}`,
    boundary: `${x};${y};${x};${y}`,
  };
}

export function buildNaverMapAllSearchUrl(
  keyword: string,
  token: string
): string {
  const { query, searchCoord, boundary } = buildNaverMapAllSearchParams(keyword);
  const u = new URL(NAVER_MAP_ALL_SEARCH_URL);
  u.searchParams.set("query", query);
  u.searchParams.set("type", "all");
  u.searchParams.set("searchCoord", searchCoord);
  u.searchParams.set("boundary", boundary);
  u.searchParams.set("sscode", "svc.mapv5.search");
  u.searchParams.set("token", token);
  return u.toString();
}

const ALL_SEARCH_FAIL_LOG_PREVIEW = 600;

/** Node fetch 기본 무제한 대기 방지 — NAVER_MAP_FETCH_TIMEOUT_MS (3~120초, 기본 20초) */
function parseAllSearchFetchTimeoutMs(): number {
  const raw = parseInt(
    String(process.env.NAVER_MAP_FETCH_TIMEOUT_MS || "").trim(),
    10
  );
  if (Number.isFinite(raw) && raw >= 3_000 && raw <= 120_000) return raw;
  return 20_000;
}

function allSearchFetchSignal(): AbortSignal {
  return AbortSignal.timeout(parseAllSearchFetchTimeoutMs());
}

function isAllSearchFetchTimedOut(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  return (
    typeof DOMException !== "undefined" &&
    e instanceof DOMException &&
    e.name === "TimeoutError"
  );
}

function logAllSearchCheckPlaceStyleFailure(
  keyword: string,
  payload: Record<string, unknown>
) {
  console.warn("[allSearch checkPlaceStyle] 실패", {
    keyword,
    ...payload,
  });
}

/** `isAllSearchNcaptchaOrEmpty === true`일 때 구체적 사유 */
function diagnoseAllSearchEmptyOrBlocked(json: unknown): {
  reason: string;
  hasNcaptcha: boolean;
  topLevelKeys: string[];
  listType?: string;
} {
  const j = json as Record<string, unknown> | null;
  const topLevelKeys =
    j && typeof j === "object" ? Object.keys(j).slice(0, 20) : [];

  const nc =
    (j?.result as { ncaptcha?: unknown } | undefined)?.ncaptcha ??
    (
      j?.data as { result?: { ncaptcha?: unknown } } | undefined
    )?.result?.ncaptcha;
  if (nc) {
    return { reason: "NCAPTCHA", hasNcaptcha: true, topLevelKeys };
  }

  const place = getAllSearchPlaceBlock(json);
  if (place === undefined || place === null) {
    return { reason: "PLACE_BLOCK_MISSING", hasNcaptcha: false, topLevelKeys };
  }
  const list = place.list;
  if (!Array.isArray(list)) {
    return {
      reason: "PLACE_LIST_NOT_ARRAY",
      hasNcaptcha: false,
      topLevelKeys,
      listType: list === undefined ? "undefined" : typeof list,
    };
  }
  return {
    reason: "UNEXPECTED_REJECT",
    hasNcaptcha: false,
    topLevelKeys,
  };
}

export function extractAllSearchNcaptchaConfirmRules(
  json: unknown
): string | undefined {
  const j = json as Record<string, unknown> | null;
  if (!j) return undefined;
  const nc =
    (j.result as { ncaptcha?: { confirmRules?: unknown } } | undefined)
      ?.ncaptcha ??
    (
      (
        j.data as
          | { result?: { ncaptcha?: { confirmRules?: unknown } } }
          | undefined
      )?.result?.ncaptcha
    );
  const r = nc?.confirmRules;
  return typeof r === "string" ? r : undefined;
}

export type AllSearchCheckPlaceFailureCode =
  | "KEYWORD_EMPTY"
  | "JSON_PARSE"
  | "HTTP_ERROR"
  | "FETCH_TIMEOUT"
  | "CE_EMPTY_TOKEN"
  | "NCAPTCHA"
  | "PLACE_BLOCK_MISSING"
  | "PLACE_LIST_NOT_ARRAY"
  | "UNEXPECTED_REJECT"
  | "EMPTY_LIST"
  | "PARSE_ROWS_INVALID";

export type FetchAllSearchCheckPlaceDetailedResult =
  | { ok: true; places: MapAllSearchPlaceRow[]; totalCount: number }
  | {
      ok: false;
      failureCode: AllSearchCheckPlaceFailureCode;
      userMessage: string;
    };

export function userMessageForAllSearchFailure(
  code: AllSearchCheckPlaceFailureCode,
  confirmRules?: string
): string {
  if (confirmRules === "CE_EMPTY_TOKEN" || code === "CE_EMPTY_TOKEN") {
    return "네이버가 토큰 없는 검색을 차단했습니다(CE_EMPTY_TOKEN). 지도 Network의 allSearch에서 token을 복사해 sessionStorage(PLACE_ANALYSIS_NAVER_MAP_TOKEN) 또는 .env의 NAVER_MAP_ALL_SEARCH_TOKEN에 넣어 주세요.";
  }
  switch (code) {
    case "FETCH_TIMEOUT":
      return "allSearch HTTP 요청이 시간 초과되었습니다. NAVER_MAP_FETCH_TIMEOUT_MS를 늘리거나 네트워크를 확인해 주세요.";
    case "NCAPTCHA":
      return "네이버에서 allSearch 접근이 제한되었습니다. 잠시 후 재시도하거나 토큰을 사용해 보세요.";
    case "HTTP_ERROR":
      return "allSearch HTTP 응답이 실패했습니다.";
    case "JSON_PARSE":
      return "allSearch 응답을 해석하지 못했습니다.";
    case "PLACE_BLOCK_MISSING":
    case "PLACE_LIST_NOT_ARRAY":
    case "UNEXPECTED_REJECT":
      return "allSearch 응답 형식이 예상과 달라 목록을 가져오지 못했습니다.";
    case "EMPTY_LIST":
      return "allSearch 검색 결과가 비어 있습니다.";
    case "PARSE_ROWS_INVALID":
      return "allSearch 목록 항목을 해석하지 못했습니다.";
    case "KEYWORD_EMPTY":
      return "검색어가 비어 있습니다.";
    default:
      return "allSearch 호출에 실패했습니다.";
  }
}

/**
 * 서버 무토큰 allSearch — 성공/실패와 사용자용 메시지까지 반환.
 */
export async function fetchAllSearchPlacesCheckPlaceRankStyleDetailed(
  keyword: string
): Promise<FetchAllSearchCheckPlaceDetailedResult> {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      failureCode: "KEYWORD_EMPTY",
      userMessage: userMessageForAllSearchFailure("KEYWORD_EMPTY"),
    };
  }

  const url = buildAllSearchUrlCheckPlaceRankStyle(trimmed);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Referer: buildAllSearchRefererCheckPlaceRankStyle(trimmed),
        "User-Agent": NAVER_MAP_ALL_SEARCH_CHECK_PLACE_UA,
      },
      cache: "no-store",
      signal: allSearchFetchSignal(),
    });
  } catch (e) {
    if (isAllSearchFetchTimedOut(e)) {
      logAllSearchCheckPlaceStyleFailure(trimmed, {
        step: "FETCH_TIMEOUT",
        url,
      });
      return {
        ok: false,
        failureCode: "FETCH_TIMEOUT",
        userMessage: userMessageForAllSearchFailure("FETCH_TIMEOUT"),
      };
    }
    throw e;
  }

  const text = await res.text();
  const bodyPreview = text.slice(0, ALL_SEARCH_FAIL_LOG_PREVIEW);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (parseErr) {
    logAllSearchCheckPlaceStyleFailure(trimmed, {
      step: "JSON_PARSE",
      url,
      httpStatus: res.status,
      httpOk: res.ok,
      bodyPreview,
      parseError:
        parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    return {
      ok: false,
      failureCode: "JSON_PARSE",
      userMessage: userMessageForAllSearchFailure("JSON_PARSE"),
    };
  }

  if (!res.ok) {
    logAllSearchCheckPlaceStyleFailure(trimmed, {
      step: "HTTP",
      url,
      httpStatus: res.status,
      httpOk: res.ok,
      bodyPreview,
    });
    return {
      ok: false,
      failureCode: "HTTP_ERROR",
      userMessage: userMessageForAllSearchFailure("HTTP_ERROR"),
    };
  }

  if (isAllSearchNcaptchaOrEmpty(json)) {
    const diag = diagnoseAllSearchEmptyOrBlocked(json);
    const confirmRules = extractAllSearchNcaptchaConfirmRules(json);
    let failureCode: AllSearchCheckPlaceFailureCode;
    if (diag.reason === "NCAPTCHA") {
      failureCode =
        confirmRules === "CE_EMPTY_TOKEN" ? "CE_EMPTY_TOKEN" : "NCAPTCHA";
    } else if (diag.reason === "PLACE_BLOCK_MISSING") {
      failureCode = "PLACE_BLOCK_MISSING";
    } else if (diag.reason === "PLACE_LIST_NOT_ARRAY") {
      failureCode = "PLACE_LIST_NOT_ARRAY";
    } else {
      failureCode = "UNEXPECTED_REJECT";
    }
    logAllSearchCheckPlaceStyleFailure(trimmed, {
      step: "STRUCTURE_OR_CAPTCHA",
      url,
      httpStatus: res.status,
      ...diag,
      confirmRules: confirmRules ?? null,
      bodyPreview:
        typeof text === "string" && text.length > 0
          ? bodyPreview
          : "(empty body)",
    });
    return {
      ok: false,
      failureCode,
      userMessage: userMessageForAllSearchFailure(failureCode, confirmRules),
    };
  }

  const places = extractPlacesFromAllSearchJson(json);
  const block = getAllSearchPlaceBlock(json);
  const totalCount = Number(block?.totalCount ?? places.length);

  const rawListLen = Array.isArray(block?.list) ? block!.list!.length : 0;
  if (places.length === 0 && rawListLen > 0) {
    logAllSearchCheckPlaceStyleFailure(trimmed, {
      step: "PARSE_ROWS_ALL_INVALID",
      url,
      httpStatus: res.status,
      rawListLen,
      hint: "place.list 항목이 id/name 없음 등으로 전부 스킵됨",
    });
    return {
      ok: false,
      failureCode: "PARSE_ROWS_INVALID",
      userMessage: userMessageForAllSearchFailure("PARSE_ROWS_INVALID"),
    };
  }

  if (places.length === 0) {
    return {
      ok: false,
      failureCode: "EMPTY_LIST",
      userMessage: userMessageForAllSearchFailure("EMPTY_LIST"),
    };
  }

  return { ok: true, places, totalCount };
}

/**
 * 서버에서 토큰 없이 `/place`와 같은 allSearch 호출.
 * 실패 시 null. 상세 진단은 `fetchAllSearchPlacesCheckPlaceRankStyleDetailed`.
 */
export async function fetchAllSearchPlacesCheckPlaceRankStyle(
  keyword: string
): Promise<{ places: MapAllSearchPlaceRow[]; totalCount: number } | null> {
  const r = await fetchAllSearchPlacesCheckPlaceRankStyleDetailed(keyword);
  if (!r.ok) return null;
  return { places: r.places, totalCount: r.totalCount };
}

async function fetchAllSearchJsonWithHeaders(
  url: string,
  keyword: string
): Promise<
  | { ok: true; json: unknown; httpStatus: number }
  | { ok: false; failureCode: AllSearchCheckPlaceFailureCode; httpStatus: number }
> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: buildAllSearchRefererCheckPlaceRankStyle(keyword),
        Origin: "https://map.naver.com",
        "User-Agent": NAVER_MAP_GRAPHQL_UA,
      },
      cache: "no-store",
      signal: allSearchFetchSignal(),
    });
  } catch (e) {
    if (isAllSearchFetchTimedOut(e)) {
      logAllSearchCheckPlaceStyleFailure(keyword, {
        step: "FETCH_TIMEOUT_TOKEN",
        url,
      });
      return { ok: false, failureCode: "FETCH_TIMEOUT", httpStatus: 0 };
    }
    throw e;
  }

  const text = await res.text();
  const bodyPreview = text.slice(0, ALL_SEARCH_FAIL_LOG_PREVIEW);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (parseErr) {
    logAllSearchCheckPlaceStyleFailure(keyword, {
      step: "JSON_PARSE_TOKEN",
      url,
      httpStatus: res.status,
      httpOk: res.ok,
      bodyPreview,
      parseError:
        parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    return { ok: false, failureCode: "JSON_PARSE", httpStatus: res.status };
  }

  if (!res.ok) {
    logAllSearchCheckPlaceStyleFailure(keyword, {
      step: "HTTP_TOKEN",
      url,
      httpStatus: res.status,
      httpOk: res.ok,
      bodyPreview,
    });
    return { ok: false, failureCode: "HTTP_ERROR", httpStatus: res.status };
  }

  return { ok: true, json, httpStatus: res.status };
}

/** Playwright 등 브라우저 컨텍스트에서 받은 JSON을 동일 규칙으로 해석 */
export function interpretAllSearchJsonDetailed(
  keyword: string,
  json: unknown,
  meta: { url: string; httpStatus: number }
): FetchAllSearchCheckPlaceDetailedResult {
  return detailedFromAllSearchJson(
    keyword,
    json,
    meta.url,
    meta.httpStatus
  );
}

function detailedFromAllSearchJson(
  keyword: string,
  json: unknown,
  url: string,
  httpStatus: number
): FetchAllSearchCheckPlaceDetailedResult {
  if (isAllSearchNcaptchaOrEmpty(json)) {
    const diag = diagnoseAllSearchEmptyOrBlocked(json);
    const confirmRules = extractAllSearchNcaptchaConfirmRules(json);
    let failureCode: AllSearchCheckPlaceFailureCode;
    if (diag.reason === "NCAPTCHA") {
      failureCode =
        confirmRules === "CE_EMPTY_TOKEN" ? "CE_EMPTY_TOKEN" : "NCAPTCHA";
    } else if (diag.reason === "PLACE_BLOCK_MISSING") {
      failureCode = "PLACE_BLOCK_MISSING";
    } else if (diag.reason === "PLACE_LIST_NOT_ARRAY") {
      failureCode = "PLACE_LIST_NOT_ARRAY";
    } else {
      failureCode = "UNEXPECTED_REJECT";
    }
    logAllSearchCheckPlaceStyleFailure(keyword, {
      step: "STRUCTURE_OR_CAPTCHA_TOKEN",
      url,
      httpStatus,
      ...diag,
      confirmRules: confirmRules ?? null,
    });
    return {
      ok: false,
      failureCode,
      userMessage: userMessageForAllSearchFailure(failureCode, confirmRules),
    };
  }

  const places = extractPlacesFromAllSearchJson(json);
  const block = getAllSearchPlaceBlock(json);
  const totalCount = Number(block?.totalCount ?? places.length);
  const rawListLen = Array.isArray(block?.list) ? block!.list!.length : 0;

  if (places.length === 0 && rawListLen > 0) {
    logAllSearchCheckPlaceStyleFailure(keyword, {
      step: "PARSE_ROWS_ALL_INVALID_TOKEN",
      url,
      httpStatus,
      rawListLen,
    });
    return {
      ok: false,
      failureCode: "PARSE_ROWS_INVALID",
      userMessage: userMessageForAllSearchFailure("PARSE_ROWS_INVALID"),
    };
  }

  if (places.length === 0) {
    return {
      ok: false,
      failureCode: "EMPTY_LIST",
      userMessage: userMessageForAllSearchFailure("EMPTY_LIST"),
    };
  }

  return { ok: true, places, totalCount };
}

/**
 * `buildNaverMapAllSearchUrl` + 지도와 동일한 Origin/Referer/UA.
 */
export async function fetchAllSearchPlacesWithTokenDetailed(
  keyword: string,
  token: string
): Promise<FetchAllSearchCheckPlaceDetailedResult> {
  const trimmed = String(keyword || "").trim();
  const tok = String(token || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      failureCode: "KEYWORD_EMPTY",
      userMessage: userMessageForAllSearchFailure("KEYWORD_EMPTY"),
    };
  }
  if (!tok) {
    return {
      ok: false,
      failureCode: "CE_EMPTY_TOKEN",
      userMessage: userMessageForAllSearchFailure("CE_EMPTY_TOKEN"),
    };
  }

  const url = buildNaverMapAllSearchUrl(trimmed, tok);
  const fetched = await fetchAllSearchJsonWithHeaders(url, trimmed);
  if (!fetched.ok) {
    return {
      ok: false,
      failureCode: fetched.failureCode,
      userMessage: userMessageForAllSearchFailure(fetched.failureCode),
    };
  }

  return detailedFromAllSearchJson(trimmed, fetched.json, url, fetched.httpStatus);
}

export type CheckPlaceRankListItem = {
  rank: number;
  placeId: string;
  name: string;
  category: string;
  address: string;
  imageUrl: string;
  review: { visitor: number; blog: number; total: number };
};

/** `/api/check-place-rank` 응답 `list` 항목 생성 */
export function mapAllSearchRowsToCheckPlaceRankList(
  rows: MapAllSearchPlaceRow[],
  display: number
): CheckPlaceRankListItem[] {
  return rows.slice(0, display).map((row, index) => ({
    rank: index + 1,
    placeId: row.id,
    name: row.name,
    category: row.category,
    address: row.roadAddress || row.address,
    imageUrl: row.thumUrl,
    review: {
      visitor: row.placeReviewCount,
      blog: row.reviewCount,
      total: row.placeReviewCount + row.reviewCount,
    },
  }));
}

function pickCategoryLabel(categories: string[] | undefined): string {
  if (!Array.isArray(categories) || categories.length === 0) return "";
  const pilates = categories.find((c) => /필라테스/i.test(c));
  if (pilates) return pilates;
  return categories[categories.length - 1] ?? "";
}

export function mapAllSearchListItemToRow(
  item: NaverMapAllSearchPlaceListItem,
  index: number
): MapAllSearchPlaceRow | null {
  const id = String(item.id ?? "").trim();
  const name = String(item.name ?? "").trim();
  if (!id || !name) return null;

  const visitor = Number(
    item.placeReviewCount ?? item.visitorReviewCount ?? 0
  );
  const blog = Number(item.reviewCount ?? item.blogCafeReviewCount ?? 0);
  const rankNum = parseInt(String(item.rank ?? item.index ?? ""), 10);

  const catFromPath =
    Array.isArray(item.categoryPath) && item.categoryPath.length > 0
      ? item.categoryPath.join(" > ")
      : "";
  const cat = catFromPath || pickCategoryLabel(item.category);

  return {
    id,
    name,
    category: cat,
    roadAddress: String(item.roadAddress ?? "").trim(),
    address: String(item.address ?? "").trim(),
    x: String(item.x ?? "").trim(),
    y: String(item.y ?? "").trim(),
    thumUrl: String(
      item.thumUrl ?? item.imageUrl ?? item.thumbnail ?? ""
    ).trim(),
    placeReviewCount: Number.isFinite(visitor) ? visitor : 0,
    reviewCount: Number.isFinite(blog) ? blog : 0,
    rank: Number.isFinite(rankNum) ? rankNum : index + 1,
  };
}

export function extractPlacesFromAllSearchJson(
  json: unknown
): MapAllSearchPlaceRow[] {
  const place = getAllSearchPlaceBlock(json);
  const list = place?.list;
  if (!Array.isArray(list)) return [];

  const out: MapAllSearchPlaceRow[] = [];
  for (let i = 0; i < list.length; i++) {
    const row = mapAllSearchListItemToRow(list[i], i);
    if (row) out.push(row);
  }
  return out;
}

/** ncaptcha·비정상 응답만 차단. `place.list`가 빈 배열이면 0건 검색으로 정상 처리 */
export function isAllSearchNcaptchaOrEmpty(json: unknown): boolean {
  const j = json as NaverMapAllSearchApiResult & {
    data?: NaverMapAllSearchApiResult;
  };
  const nc =
    j?.result?.ncaptcha ?? j?.data?.result?.ncaptcha;
  if (nc) return true;
  const place = getAllSearchPlaceBlock(json);
  if (place === undefined || place === null) return true;
  if (!Array.isArray(place.list)) return true;
  return false;
}
