import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import {
  buildLocationFallbackSearchKeyword,
  expandLocationAddressHints,
  normalizePlaceSearchKeywordTypos,
} from "@/lib/place-keyword-fallback";
import {
  BUSINESSES_GRAPHQL_PAGE_COUNT,
  BUSINESSES_SEOUL_DEFAULT_X,
  BUSINESSES_SEOUL_DEFAULT_Y,
  NAVER_PCMAP_GRAPHQL_URL,
  buildGetPlacesListFetchHeaders,
  buildGetPlacesListFetchHeadersForServer,
  buildGetPlacesListPagedBatch,
  pickBusinessesCoords,
  pickPlaceRankGeoRadiiKm,
  resolveBusinessesCoords,
} from "@/lib/naver-map-businesses-shared";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import {
  type AllSearchCheckPlaceFailureCode,
  type MapAllSearchPlaceRow,
} from "@/lib/naver-map-all-search";
import {
  mergePcmapGraphqlBatch,
  parseNaverReviewCountField,
} from "@/lib/merge-pcmap-businesses-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Playwright 토큰 갱신·리뷰 스냅샷 등 긴 I/O */
export const maxDuration = 120;

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
const RESTAURANT_DISPLAY = 30;
/** 서버·restaurant 폴백 등 (지도 배치 신뢰 없을 때) */
const LIST_CAP = 30;
/** map GraphQL 배치·allSearch 등 네이버가 한 페이지에 내려주는 건수에 맞춤 (display≈70) */
const LIST_CAP_CLIENT_TRUSTED = 70;

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

/**
 * 네이버 pcmap **restaurantList** 축(맛집/음식) — 이 키워드는 restaurant 우선.
 * 필라테스·헬스 등은 여기에 넣지 않음 → businesses 우선.
 */
function isRestaurantKeyword(keyword: string) {
  const n = normalizeText(keyword);
  const hints = [
    "맛집",
    "식당",
    "레스토랑",
    "카페",
    "술집",
    "치킨",
    "피자",
    "햄버거",
    "파스타",
    "국밥",
    "고기집",
    "횟집",
    "분식",
    "중식",
    "일식",
    "한식",
    "양식",
    "베이커리",
    "디저트",
    "브런치",
    "와인바",
    "숯불",
    "고깃집",
    "족발",
    "보쌈",
    "뷔페",
    "이자카야",
  ];
  return hints.some((h) => n.includes(normalizeText(h)));
}

/** 맛집 restaurantList 폴백 금지 — 필라테스 등이 PT·헬스 체인으로 잘못 채워지는 것 방지 */
function isSportsWellnessPlaceKeyword(keyword: string): boolean {
  const n = normalizeText(keyword);
  const hints = [
    "필라테스",
    "요가",
    "헬스",
    "크로스핏",
    "클라이밍",
    "수영",
    "골프",
    "테니스",
    "복싱",
    "킥복싱",
    "pt스튜디오",
    "피트니스",
    "gym",
    "다이어트",
    "스트레칭",
  ];
  return hints.some((h) => n.includes(normalizeText(h)));
}

function isSeoulDefaultMapCenter(coords: { x: string; y: string }): boolean {
  return (
    coords.x === BUSINESSES_SEOUL_DEFAULT_X &&
    coords.y === BUSINESSES_SEOUL_DEFAULT_Y
  );
}

/** 네이버 pcmap GraphQL x=경도, y=위도 (WGS84) */
function parseNaverPlaceLngLat(
  x: string | undefined,
  y: string | undefined
): { lng: number; lat: number } | null {
  const lng = parseFloat(String(x ?? ""));
  const lat = parseFloat(String(y ?? ""));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lng, lat };
}

function haversineKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 검색어 지도 중심 기준 maxKm 이내만 (좌표 없는 항목 제외) */
function filterItemsWithinKmOfKeywordCenter(
  items: GraphqlItem[],
  keyword: string,
  maxKm: number
): GraphqlItem[] {
  const center = pickBusinessesCoords(keyword);
  const cx = parseFloat(center.x);
  const cy = parseFloat(center.y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return [];

  const out: GraphqlItem[] = [];
  for (const it of items) {
    const ll = parseNaverPlaceLngLat(it.x, it.y);
    if (!ll) continue;
    if (haversineKm(cx, cy, ll.lng, ll.lat) <= maxKm) out.push(it);
  }
  return out;
}

/**
 * "필라테스" 등 업종 키워드일 때 restaurantList 오탐(주스·카페) 제거.
 * 한 건도 안 맞으면 원본 유지(API가 이상할 때 대비).
 */
function filterItemsByTradeKeyword(
  items: GraphqlItem[],
  keyword: string
): GraphqlItem[] {
  const k = normalizeText(keyword);
  if (!k.includes(normalizeText("필라테스"))) return items;

  const out = items.filter((item) => {
    if (item.isPromotedAd) return true;
    const blob = normalizeText(
      `${item.name} ${item.category ?? ""} ${item.businessCategory ?? ""}`
    );
    return (
      blob.includes(normalizeText("필라테스")) ||
      blob.includes("pilates") ||
      blob.includes(normalizeText("리포머")) ||
      blob.includes("reformer")
    );
  });

  return out.length > 0 ? out : items;
}

function filterItemsMatchingAddressHints(
  items: GraphqlItem[],
  hints: string[]
): GraphqlItem[] {
  if (hints.length === 0) return [];
  return items.filter((item) => {
    const addr = `${item.roadAddress || ""} ${item.address || ""}`;
    return hints.some((h) => addr.includes(h));
  });
}

const FINE_GANGNAM_HOOD_RE = /(압구정|청담|신사)/;

/**
 * 네이버 restaurantList는 쿼리만 "필라테스"일 때 x,y를 바꿔도 전국 혼합을 자주 돌려줌.
 * 압구정·청담·신사 의도일 때는 좌표로 강남 핵(마포·신촌·제주 제외)만 남김.
 */
function itemInFineGangnamSearchBBox(item: GraphqlItem): boolean {
  const ll = parseNaverPlaceLngLat(item.x, item.y);
  if (!ll) return false;
  return (
    ll.lng >= 126.998 &&
    ll.lng <= 127.092 &&
    ll.lat >= 37.488 &&
    ll.lat <= 37.548
  );
}

/** 강남·역삼 등 — 마포·신촌(서쪽) 제외, 전국 혼합 restaurantList 보정 */
function itemInGangnamClusterBBox(item: GraphqlItem): boolean {
  const ll = parseNaverPlaceLngLat(item.x, item.y);
  if (!ll) return false;
  return (
    ll.lng >= 126.993 &&
    ll.lng <= 127.115 &&
    ll.lat >= 37.468 &&
    ll.lat <= 37.548
  );
}

function isGangnamClusterBBoxKeyword(keyword: string): boolean {
  const c = String(keyword || "").replace(/\s+/g, "");
  return /(강남|역삼|논현|신논현|선릉|대치|삼성)/.test(c);
}

function buildPlaceRankCandidatePool(
  items: GraphqlItem[],
  keyword: string
): GraphqlItem[] {
  const afterTrade = filterItemsByTradeKeyword(items, keyword);
  const c = String(keyword || "").replace(/\s+/g, "");

  if (FINE_GANGNAM_HOOD_RE.test(c)) {
    const inFine = afterTrade.filter(itemInFineGangnamSearchBBox);
    if (inFine.length > 0) return inFine;
    const inCluster = afterTrade.filter(itemInGangnamClusterBBox);
    // 필라테스 등은 fine BBox 밖에 있어도 역삼·논현 쪽에 있는 경우가 많음 → 강남 클러스터로 한 번 더 완화
    if (inCluster.length > 0) return inCluster;
    const { inner, outer } = pickPlaceRankGeoRadiiKm(keyword);
    const ring = filterItemsWithinKmOfKeywordCenter(afterTrade, keyword, outer);
    if (ring.length > 0) return ring;
    const wideKm = Math.max(outer * 2.2, inner + outer);
    const wide = filterItemsWithinKmOfKeywordCenter(afterTrade, keyword, wideKm);
    if (wide.length > 0) return wide;
    // 마지막 수단: 전국 후보(제주 등) — 후단에서 거리순
    return afterTrade;
  }

  if (isGangnamClusterBBoxKeyword(keyword)) {
    const inBox = afterTrade.filter(itemInGangnamClusterBBox);
    return inBox.length > 0 ? inBox : afterTrade;
  }

  return afterTrade;
}

function keywordUsesPreBboxCandidatePool(keyword: string): boolean {
  const c = String(keyword || "").replace(/\s+/g, "");
  return FINE_GANGNAM_HOOD_RE.test(c) || isGangnamClusterBBoxKeyword(keyword);
}

/**
 * 지역이 검색어에 명시된 경우(맵 중심이 서울 기본이 아님)에만
 * 거리 필터 + 가까운 순 정렬. 좌표 없는 항목은 뒤에 둠.
 */
function filterAndSortItemsByRegionalCenter(
  items: GraphqlItem[],
  keyword: string,
  maxCount: number,
  opts?: { skipRadius?: boolean }
): GraphqlItem[] {
  if (items.length === 0) return items;

  const center = pickBusinessesCoords(keyword);
  if (isSeoulDefaultMapCenter(center)) {
    return items.slice(0, maxCount);
  }

  const cx = parseFloat(center.x);
  const cy = parseFloat(center.y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return items.slice(0, maxCount);
  }

  const { inner: RADIUS_KM, outer: RADIUS_LOOSE_KM } =
    pickPlaceRankGeoRadiiKm(keyword);

  type Row = { item: GraphqlItem; km: number | null };
  const rows: Row[] = items.map((item) => {
    const ll = parseNaverPlaceLngLat(item.x, item.y);
    if (!ll) return { item, km: null };
    return {
      item,
      km: haversineKm(cx, cy, ll.lng, ll.lat),
    };
  });

  const withKm = rows.filter((r): r is Row & { km: number } => r.km != null);
  const withoutKm = rows.filter((r) => r.km == null).map((r) => r.item);

  if (withKm.length === 0) {
    return items.slice(0, maxCount);
  }

  withKm.sort((a, b) => a.km - b.km);

  if (opts?.skipRadius) {
    const out = [...withKm.map((r) => r.item), ...withoutKm].slice(0, maxCount);
    console.log("[place-rank-analyze geo filter]", {
      keyword,
      mode: "distance-only",
      center,
      inputCount: items.length,
      outputCount: out.length,
      nearestKm: withKm[0]?.km ?? null,
    });
    return out;
  }

  let picked = withKm.filter((r) => r.km <= RADIUS_KM);
  if (picked.length < 4 && withKm.length >= 4) {
    picked = withKm.filter((r) => r.km <= RADIUS_LOOSE_KM);
  }
  /* 후보가 4건 미만이면 loose 확장이 안 돌아가 빈 배열이 되는 경우 방지(한남동 필라테스 등) */
  if (picked.length === 0 && withKm.length > 0) {
    picked = withKm.filter((r) => r.km <= RADIUS_LOOSE_KM);
  }
  if (picked.length === 0 && withKm.length > 0) {
    picked = withKm.slice(0, Math.min(maxCount, withKm.length));
  }

  const out = [...picked.map((r) => r.item), ...withoutKm].slice(0, maxCount);

  console.log("[place-rank-analyze geo filter]", {
    keyword,
    center,
    radiusKm: RADIUS_KM,
    looseRadiusKm: RADIUS_LOOSE_KM,
    inputCount: items.length,
    withCoords: withKm.length,
    outputCount: out.length,
    nearestKm: picked[0]?.km ?? null,
    inRadiusCount: picked.length,
  });

  return out;
}

function refineItemsForPlaceRankAnalyze(
  items: GraphqlItem[],
  keyword: string,
  maxCount: number,
  opts?: { trustNaverBusinessesOrder?: boolean }
): GraphqlItem[] {
  if (opts?.trustNaverBusinessesOrder && items.length > 0) {
    const pool = filterItemsByTradeKeyword(items, keyword);
    console.log(
      "[place-rank-analyze geo filter] client-businesses: 업종 필터만, 네이버 순서 유지",
      {
        keyword,
        inCount: items.length,
        outCount: Math.min(pool.length, maxCount),
      }
    );
    return pool.slice(0, maxCount);
  }

  const hintsFirst = expandLocationAddressHints(keyword);
  if (hintsFirst.length > 0) {
    const tradeAll = filterItemsByTradeKeyword(items, keyword);
    const hinted = filterItemsMatchingAddressHints(tradeAll, hintsFirst);
    if (hinted.length > 0) {
      let step = filterAndSortItemsByRegionalCenter(hinted, keyword, maxCount, {
        skipRadius: false,
      });
      if (step.length > 0) {
        console.log("[place-rank-analyze geo filter] addressHintsFirst", {
          keyword,
          count: step.length,
        });
        return step;
      }
      step = filterAndSortItemsByRegionalCenter(hinted, keyword, maxCount, {
        skipRadius: true,
      });
      if (step.length > 0) {
        console.log("[place-rank-analyze geo filter] addressHintsFirstLoose", {
          keyword,
          count: step.length,
        });
        return step;
      }
    }
  }

  const pool = buildPlaceRankCandidatePool(items, keyword);

  if (pool.length === 0) {
    if (keywordUsesPreBboxCandidatePool(keyword)) {
      return [];
    }
    return items.slice(0, maxCount);
  }

  let step = filterAndSortItemsByRegionalCenter(pool, keyword, maxCount, {
    skipRadius: keywordUsesPreBboxCandidatePool(keyword),
  });
  if (step.length > 0) return step;

  const hints = expandLocationAddressHints(keyword);
  if (hints.length > 0 && pool.length > 0) {
    const addrPool = filterItemsMatchingAddressHints(pool, hints);
    if (addrPool.length > 0) {
      step = filterAndSortItemsByRegionalCenter(addrPool, keyword, maxCount);
      if (step.length > 0) {
        console.log("[place-rank-analyze geo filter] addressTier", {
          keyword,
          hints,
          count: step.length,
        });
        return step;
      }
    }
  }

  if (pool.length > 0) {
    if (keywordUsesPreBboxCandidatePool(keyword)) {
      console.warn(
        "[place-rank-analyze geo filter] bbox-keyword: skip distance-only fallback",
        { keyword, poolSize: pool.length }
      );
      return [];
    }
    console.warn(
      "[place-rank-analyze geo filter] fallback distance-only (no in-radius hits)",
      { keyword }
    );
    return filterAndSortItemsByRegionalCenter(pool, keyword, maxCount, {
      skipRadius: true,
    });
  }

  return items.slice(0, maxCount);
}

const GET_RESTAURANTS_QUERY = `
query getRestaurants(
  $restaurantListInput: RestaurantListInput,
  $restaurantListFilterInput: RestaurantListFilterInput,
  $reverseGeocodingInput: ReverseGeocodingInput,
  $useReverseGeocode: Boolean = false
) {
  restaurants: restaurantList(input: $restaurantListInput) {
    items {
      id
      name
      category
      businessCategory
      imageUrl
      x
      y
      address
      roadAddress
      totalReviewCount
      visitorReviewCount
      blogCafeReviewCount
      saveCount
      __typename
    }
    total
    __typename
  }
  filters: restaurantListFilter(input: $restaurantListFilterInput) {
    filters {
      index
      name
      displayName
      value
      __typename
    }
    __typename
  }
  reverseGeocodingAddr(input: $reverseGeocodingInput) @include(if: $useReverseGeocode) {
    rcode
    region
    __typename
  }
}
`;

type GraphqlItem = {
  id?: string;
  name?: string;
  category?: string;
  businessCategory?: string;
  imageUrl?: string;
  /** 일부 pcmap 타입은 썸네일 필드명이 다름 */
  thumbnail?: string;
  thumUrl?: string;
  x?: string;
  y?: string;
  address?: string;
  roadAddress?: string;
  fullAddress?: string;
  visitorReviewCount?: string | number | null;
  blogCafeReviewCount?: string | number | null;
  totalReviewCount?: string | number | null;
  saveCount?: string | number;
  /** pcmap 배치의 PlaceAdSummary */
  isPromotedAd?: boolean;
  adId?: string;
};

function isMapAllSearchPlaceRow(v: unknown): v is MapAllSearchPlaceRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  return Boolean(id && name);
}

/** map.naver.com `allSearch` `place.list[]` → pcmap GraphQL item 형태 (기존 파이프라인 재사용) */
function graphqlItemsFromMapAllSearchPlaces(rows: unknown[]): GraphqlItem[] {
  const out: GraphqlItem[] = [];
  for (const r of rows) {
    if (!isMapAllSearchPlaceRow(r)) continue;
    const visitor = Number(r.placeReviewCount ?? 0);
    const blog = Number(r.reviewCount ?? 0);
    const vOk = Number.isFinite(visitor) ? visitor : 0;
    const bOk = Number.isFinite(blog) ? blog : 0;
    out.push({
      id: String(r.id).trim(),
      name: String(r.name).trim(),
      category: String(r.category ?? "").trim(),
      imageUrl: String(r.thumUrl ?? "").trim(),
      x: String(r.x ?? "").trim(),
      y: String(r.y ?? "").trim(),
      roadAddress: String(r.roadAddress ?? "").trim(),
      address: String(r.address ?? "").trim(),
      visitorReviewCount: vOk,
      blogCafeReviewCount: bOk,
      totalReviewCount: vOk + bOk,
    });
  }
  return out;
}

function mapAllSearchFailureToDiagnosticsCode(
  c: AllSearchCheckPlaceFailureCode
): string {
  switch (c) {
    case "CE_EMPTY_TOKEN":
      return "ALLSEARCH_CE_EMPTY_TOKEN";
    case "NCAPTCHA":
      return "ALLSEARCH_NCAPTCHA";
    case "HTTP_ERROR":
      return "ALLSEARCH_HTTP";
    case "FETCH_TIMEOUT":
      return "ALLSEARCH_FETCH_TIMEOUT";
    case "JSON_PARSE":
      return "ALLSEARCH_PARSE";
    case "EMPTY_LIST":
      return "ALLSEARCH_EMPTY_LIST";
    case "PARSE_ROWS_INVALID":
      return "ALLSEARCH_PARSE_ROWS";
    case "PLACE_BLOCK_MISSING":
    case "PLACE_LIST_NOT_ARRAY":
    case "UNEXPECTED_REJECT":
      return "ALLSEARCH_SHAPE";
    case "KEYWORD_EMPTY":
      return "ALLSEARCH_KEYWORD_EMPTY";
    default:
      return "ALLSEARCH_UNKNOWN";
  }
}

/** `/api/check-place-rank`와 동일한 무토큰 allSearch → GraphqlItem[] */
async function loadItemsFromCheckPlaceStyleAllSearch(
  keyword: string
): Promise<
  | { ok: true; items: GraphqlItem[]; total: number }
  | {
      ok: false;
      failureCode: AllSearchCheckPlaceFailureCode;
      userMessage: string;
    }
> {
  const r = await fetchAllSearchPlacesAutoDetailed(keyword);
  if (!r.ok) {
    return {
      ok: false,
      failureCode: r.failureCode,
      userMessage: r.userMessage,
    };
  }
  return {
    ok: true,
    items: graphqlItemsFromMapAllSearchPlaces(r.places as unknown[]),
    total: r.totalCount,
  };
}

function parseBatchedGraphqlBody(raw: string): any[] | null {
  const t = String(raw || "").trimStart();
  if (!t || t.startsWith("<")) return null;
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

function collectBatchErrors(batch: any[]): string[] {
  const out: string[] = [];
  for (const item of batch) {
    if (!Array.isArray(item?.errors)) continue;
    for (const err of item.errors) {
      const m = err?.message;
      if (typeof m === "string" && m.trim()) out.push(m.trim());
    }
  }
  return out;
}

type FetchBusinessesResult = {
  items: GraphqlItem[];
  total: number;
  graphqlErrors: string[];
};

function businessesResultFromBatch(batch: any[]): FetchBusinessesResult {
  const merged = mergePcmapGraphqlBatch(batch);
  const items = merged.items as GraphqlItem[];
  console.log("[place-rank-analyze batch merge]", {
    mergedCount: items.length,
    total: merged.total,
    gqlErrorCount: merged.graphqlErrors.length,
  });
  return {
    items,
    total: merged.total,
    graphqlErrors: merged.graphqlErrors,
  };
}

async function fetchPlacesListBusinessesOnce(
  keyword: string,
  coordAnchorKeyword?: string,
  opts?: { mapReferer?: boolean; pageCount?: number }
): Promise<FetchBusinessesResult> {
  const coords = resolveBusinessesCoords(keyword, coordAnchorKeyword);
  const mapReferer = Boolean(opts?.mapReferer);
  const pageCount = mapReferer
    ? 1
    : Math.max(1, opts?.pageCount ?? BUSINESSES_GRAPHQL_PAGE_COUNT);
  const batchBody = mapReferer
    ? buildGetPlacesListPagedBatch(keyword, coords, 1)
    : buildGetPlacesListPagedBatch(keyword, coords, pageCount);
  const bodyStr = JSON.stringify(batchBody);
  const headers = mapReferer
    ? buildGetPlacesListFetchHeaders(keyword)
    : buildGetPlacesListFetchHeadersForServer(keyword, coords);

  console.log("[place-rank-analyze businesses request]", {
    keyword,
    coordAnchorKeyword: coordAnchorKeyword ?? null,
    coords,
    url: NAVER_PCMAP_GRAPHQL_URL,
    headers: {
      Origin: headers.Origin,
      Referer: headers.Referer,
      "User-Agent": headers["User-Agent"],
      Accept: headers.Accept,
      "Accept-Language": headers["Accept-Language"],
      "Content-Type": headers["Content-Type"],
    },
    secFetch: {
      "Sec-Fetch-Dest": headers["Sec-Fetch-Dest"],
      "Sec-Fetch-Mode": headers["Sec-Fetch-Mode"],
      "Sec-Fetch-Site": headers["Sec-Fetch-Site"],
    },
    body: bodyStr,
    credentials: "include",
    serverLimitation:
      "Route Handler의 fetch는 사용자 브라우저 Naver 쿠키를 실어 보낼 수 없습니다. total=0이면 DevTools와 달리 세션/봇 정책일 수 있음.",
  });

  const res = await fetch(NAVER_PCMAP_GRAPHQL_URL, {
    method: "POST",
    headers,
    body: bodyStr,
    credentials: "include",
    cache: "no-store",
  });

  const raw = await res.text();
  const batch = parseBatchedGraphqlBody(raw);

  if (!batch) {
    console.warn("[place-rank-analyze] getPlacesList 비JSON/HTML", {
      keyword,
      status: res.status,
      rawPreview: raw.slice(0, 4000),
    });
    return { items: [], total: 0, graphqlErrors: [] };
  }

  const gqlErrors = collectBatchErrors(batch);
  if (gqlErrors.length) {
    console.warn("[place-rank-analyze] getPlacesList GraphQL errors", {
      keyword,
      gqlErrors,
    });
  }

  const json = batch;
  const rawPreview =
    raw.length > 6000 ? `${raw.slice(0, 6000)}…(truncated,len=${raw.length})` : raw;

  const d0 = json?.[0]?.data as Record<string, unknown> | undefined;
  const plRoot = d0?.places as { total?: number; items?: unknown[] } | undefined;
  const bizRoot = d0?.businesses as { total?: number; items?: unknown[] } | undefined;
  const organic = plRoot?.items?.length ? plRoot : bizRoot;
  console.log("[place-rank-analyze businesses raw]", {
    keyword,
    httpStatus: res.status,
    rawPreview,
    batchFirstStringified: JSON.stringify(json[0] ?? null).slice(0, 8000),
    dataKeys: Object.keys(json?.[0]?.data || {}),
    placesItems: Array.isArray(plRoot?.items) ? plRoot!.items!.length : -1,
    businessesItems: Array.isArray(bizRoot?.items) ? bizRoot!.items!.length : -1,
    total: organic?.total,
    itemsLength: Array.isArray(organic?.items) ? organic!.items!.length : -1,
    firstItem: organic?.items?.[0] ?? null,
    batchErrors: json?.[0]?.errors ?? null,
  });

  return businessesResultFromBatch(batch);
}

async function fetchPlacesListBusinesses(
  originalKeyword: string
): Promise<FetchBusinessesResult> {
  const tryMapReferer = async (
    keyword: string,
    coordAnchorKeyword?: string
  ): Promise<FetchBusinessesResult | null> => {
    await new Promise((r) => setTimeout(r, 420));
    const m = await fetchPlacesListBusinessesOnce(
      keyword,
      coordAnchorKeyword,
      { mapReferer: true }
    );
    return m.items.length > 0 ? m : null;
  };

  const fallback = buildLocationFallbackSearchKeyword(originalKeyword);

  /**
   * 지역+업종(서울역 필라테스 등)은 map.naver 검색과 맞추려면 **원문 쿼리**를 먼저 써야 한다.
   * 업종-only(필라테스)만 먼저 쓰면 인기 체인(마포·신촌 등)이 앞에 오는 등 순위가 달라진다.
   * 원문이 0건일 때만 업종-only + 앵커 좌표로 폴백.
   */
  if (fallback) {
    console.log("[place-rank-analyze fallback]", {
      original: originalKeyword,
      fallback,
      mode: "original-first",
    });

    const fromOriginal = await fetchPlacesListBusinessesOnce(originalKeyword);
    if (fromOriginal.items.length > 0) {
      return fromOriginal;
    }

    await new Promise((r) => setTimeout(r, 350));

    const fromFallback = await fetchPlacesListBusinessesOnce(
      fallback,
      originalKeyword
    );
    const mergedErrors = Array.from(
      new Set([...fromOriginal.graphqlErrors, ...fromFallback.graphqlErrors])
    );

    if (fromFallback.items.length > 0) {
      return {
        items: fromFallback.items,
        total: fromFallback.total,
        graphqlErrors: mergedErrors,
      };
    }

    const mapOr = await tryMapReferer(originalKeyword);
    if (mapOr) {
      return {
        items: mapOr.items,
        total: mapOr.total,
        graphqlErrors: Array.from(
          new Set([...mergedErrors, ...mapOr.graphqlErrors])
        ),
      };
    }
    const mapFb = await tryMapReferer(fallback, originalKeyword);
    if (mapFb) {
      return {
        items: mapFb.items,
        total: mapFb.total,
        graphqlErrors: Array.from(
          new Set([...mergedErrors, ...mapFb.graphqlErrors])
        ),
      };
    }

    console.warn("[place-rank-analyze businesses server empty]", {
      keyword: originalKeyword,
      triedFallbackKeyword: true,
      hint: "브라우저 세션으로 map.naver.com에서 받은 배열을 body.businessesGraphqlBatch로 넘기거나, 별도 프록시/자동화를 검토하세요.",
    });

    return {
      items: [],
      total: 0,
      graphqlErrors: mergedErrors,
    };
  }

  const only = await fetchPlacesListBusinessesOnce(originalKeyword);
  if (only.items.length > 0) {
    return only;
  }

  const mapOnly = await tryMapReferer(originalKeyword);
  if (mapOnly) {
    return {
      items: mapOnly.items,
      total: mapOnly.total,
      graphqlErrors: Array.from(
        new Set([...only.graphqlErrors, ...mapOnly.graphqlErrors])
      ),
    };
  }

  console.warn("[place-rank-analyze businesses server empty]", {
    keyword: originalKeyword,
    triedFallbackKeyword: false,
    hint: "브라우저 세션으로 map.naver.com에서 받은 배열을 body.businessesGraphqlBatch로 넘기거나, 별도 프록시/자동화를 검토하세요.",
  });
  return only;
}

function buildRestaurantListPayload(
  keyword: string,
  coords: { x: string; y: string },
  start: number = 1
) {
  return [
    {
      operationName: "getRestaurants",
      variables: {
        useReverseGeocode: true,
        restaurantListInput: {
          query: keyword,
          x: coords.x,
          y: coords.y,
          start,
          display: RESTAURANT_DISPLAY,
          deviceType: "pcmap",
          isPcmap: true,
        },
        restaurantListFilterInput: {
          x: coords.x,
          y: coords.y,
          display: RESTAURANT_DISPLAY,
          start,
          query: keyword,
        },
        reverseGeocodingInput: {
          x: coords.x,
          y: coords.y,
        },
      },
      query: GET_RESTAURANTS_QUERY,
    },
  ];
}

type FetchRestaurantsResult = {
  items: GraphqlItem[];
  total: number;
  graphqlErrors: string[];
};

async function fetchRestaurantListPage(
  keyword: string,
  coords: { x: string; y: string },
  start: number
): Promise<FetchRestaurantsResult> {
  const referer = `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(
    keyword
  )}&x=${coords.x}&y=${coords.y}`;

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: "https://pcmap.place.naver.com",
      Referer: referer,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    body: JSON.stringify(buildRestaurantListPayload(keyword, coords, start)),
    cache: "no-store",
  });

  const raw = await res.text();
  const batch = parseBatchedGraphqlBody(raw);

  if (!batch) {
    console.warn("[place-rank-analyze] restaurantList 비JSON/HTML", {
      keyword,
      start,
      status: res.status,
      head: raw.slice(0, 200),
    });
    return { items: [], total: 0, graphqlErrors: [] };
  }

  const gqlErrors = collectBatchErrors(batch);
  if (gqlErrors.length) {
    console.warn("[place-rank-analyze] restaurantList GraphQL errors", {
      keyword,
      start,
      gqlErrors,
    });
  }

  const root = batch[0]?.data?.restaurants;
  const items = Array.isArray(root?.items) ? root.items : [];
  const total = Number(root?.total || 0);

  return { items, total, graphqlErrors: gqlErrors };
}

/**
 * @param coordSourceKeyword — 검색어와 다른 좌표를 쓸 때(예: 쿼리는 "필라테스", 중심은 "압구정 필라테스")
 */
async function fetchRestaurantList(
  keyword: string,
  coordSourceKeyword?: string
): Promise<FetchRestaurantsResult> {
  const centerKw = String(coordSourceKeyword || keyword || "").trim() || keyword;
  const coords = pickBusinessesCoords(centerKw);

  const [a, b] = await Promise.all([
    fetchRestaurantListPage(keyword, coords, 1),
    fetchRestaurantListPage(keyword, coords, 1 + RESTAURANT_DISPLAY),
  ]);

  const mergedErrors = Array.from(
    new Set([...a.graphqlErrors, ...b.graphqlErrors])
  );
  const byId = new Map<string, GraphqlItem>();
  for (const it of a.items) {
    const id = String(it.id ?? "").trim();
    if (id) byId.set(id, it);
  }
  for (const it of b.items) {
    const id = String(it.id ?? "").trim();
    if (id && !byId.has(id)) byId.set(id, it);
  }
  const items = Array.from(byId.values());

  return {
    items,
    total: Math.max(a.total, b.total, items.length),
    graphqlErrors: mergedErrors,
  };
}

/**
 * "서울역 필라테스"처럼 지역+업종은 restaurantList가 0인 경우가 많고,
 * 업종만(필라테스)은 같은 API에서 건수가 나오는 경우가 있어 businesses와 동일하게 fallback-first.
 * 맛집 키워드 경로(food → restaurant 먼저)에는 사용하지 않음.
 */
async function fetchRestaurantListWithLocationFallback(
  originalKeyword: string
): Promise<FetchRestaurantsResult> {
  const fallback = buildLocationFallbackSearchKeyword(originalKeyword);
  if (!fallback) {
    return fetchRestaurantList(originalKeyword);
  }

  console.log("[place-rank-analyze restaurant merge-queries]", {
    original: originalKeyword,
    fallback,
  });

  const [fromOriginal, fromFallback] = await Promise.all([
    fetchRestaurantList(originalKeyword),
    fetchRestaurantList(fallback, originalKeyword),
  ]);

  const byId = new Map<string, GraphqlItem>();
  for (const it of fromOriginal.items) {
    const id = String(it.id ?? "").trim();
    if (id) byId.set(id, it);
  }
  for (const it of fromFallback.items) {
    const id = String(it.id ?? "").trim();
    if (id && !byId.has(id)) byId.set(id, it);
  }

  const merged = Array.from(byId.values());
  const mergedErrors = Array.from(
    new Set([...fromOriginal.graphqlErrors, ...fromFallback.graphqlErrors])
  );

  console.log("[place-rank-analyze restaurant merge]", {
    original: originalKeyword,
    nOriginal: fromOriginal.items.length,
    nFallback: fromFallback.items.length,
    nMerged: merged.length,
  });

  return {
    items: merged,
    total: Math.max(
      fromOriginal.total,
      fromFallback.total,
      merged.length
    ),
    graphqlErrors: mergedErrors,
  };
}

function pickGraphqlItemImageUrl(item: GraphqlItem): string {
  const r = item as Record<string, unknown>;
  const parts = [
    item.imageUrl,
    item.thumbnail,
    item.thumUrl,
    r["image"],
  ];
  for (const p of parts) {
    const s = String(p ?? "").trim();
    if (s) return s;
  }
  return "";
}

function mapItemToListRow(item: GraphqlItem, index: number) {
  const visitor = parseNaverReviewCountField(item.visitorReviewCount);
  const blog = parseNaverReviewCountField(item.blogCafeReviewCount);
  const totalFromApi = parseNaverReviewCountField(item.totalReviewCount);
  const total = totalFromApi || visitor + blog;

  return {
    rank: index + 1,
    placeId: String(item.id ?? ""),
    name: String(item.name ?? ""),
    category: String(item.category || item.businessCategory || "").trim(),
    address: String(
      item.roadAddress || item.address || item.fullAddress || ""
    ).trim(),
    imageUrl: pickGraphqlItemImageUrl(item),
    isPromotedAd: Boolean(item.isPromotedAd),
    review: {
      visitor,
      blog,
      total,
      save: item.saveCount ?? "0",
    },
    _coords: {
      x: item.x != null ? String(item.x) : "",
      y: item.y != null ? String(item.y) : "",
    },
  };
}

/** 클라이언트 표시용: 토큰 차단 시 한 문장·중복 힌트 제거 */
function buildPlaceRankDiagnosticsPayload(diagnostics: {
  failureCode?: string;
  dataSourceHint?: string;
  hints: string[];
}): {
  failureCode: string | null;
  dataSourceHint: string | null;
  hints: string[];
  compactSummary: string | null;
} {
  const fc = diagnostics.failureCode ?? null;
  const hints = diagnostics.hints ?? [];
  const tokenBlocked =
    fc === "ALLSEARCH_CE_EMPTY_TOKEN" ||
    hints.some((h) => h.includes("CE_EMPTY_TOKEN"));

  if (tokenBlocked) {
    const summary =
      "네이버 allSearch가 막힌 상태입니다. 서버가 headless 브라우저로 토큰을 자동 갱신했는데도 실패했을 수 있습니다. 잠시 후 재시도하거나, 배포 환경에서 Chromium(Playwright) 실행이 막혀 있으면 NAVER_MAP_PLAYWRIGHT_DISABLE=1을 해제하고 NAVER_MAP_ALL_SEARCH_TOKEN을 설정해 보세요.";
    return {
      failureCode: fc,
      dataSourceHint: null,
      hints: [summary],
      compactSummary: summary,
    };
  }

  const seen = new Set<string>();
  const deduped = hints.filter((h) => {
    const k =
      h.includes("allSearch 토큰") || h.includes("토큰 없")
        ? "__token_hint__"
        : h;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    failureCode: fc,
    dataSourceHint: diagnostics.dataSourceHint ?? null,
    hints: deduped,
    compactSummary: null,
  };
}

async function buildRelatedKeywords(keyword: string) {
  const candidates = [
    keyword,
    `${keyword} 추천`,
    `${keyword} 근처`,
    `${keyword} 데이트`,
    `${keyword} 아기랑`,
  ];

  const unique = Array.from(
    new Set(
      candidates
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 2);

  return Promise.all(
    unique.map(async (item) => {
      try {
        const volume = await getKeywordSearchVolume(item);
        const mobile = volume?.mobile ?? 0;
        const pc = volume?.pc ?? 0;

        return {
          keyword: item,
          total: mobile + pc,
          mobile,
          pc,
        };
      } catch (e) {
        console.warn(
          `[place-rank-analyze] buildRelatedKeywords 실패 keyword="${item}"`,
          e
        );

        return {
          keyword: item,
          total: 0,
          mobile: 0,
          pc: 0,
        };
      }
    })
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawKeyword = String(body.keyword || "").trim();
    const { normalized: keyword } = normalizePlaceSearchKeywordTypos(rawKeyword);

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 없음" },
        { status: 400 }
      );
    }

    let items: GraphqlItem[] = [];
    let apiTotal = 0;
    let source: "businesses" | "restaurant" | "mapAllSearch" = "businesses";
    let graphqlErrors: string[] = [];

    const diagnostics: {
      failureCode?: string;
      dataSourceHint?: string;
      hints: string[];
    } = { hints: [] };

    let serverPcmapGraphqlEmpty = false;
    let serverTokenlessAllSearchFailed = false;

    const mapAllRaw =
      Array.isArray(body.mapAllSearchPlaces) &&
      body.mapAllSearchPlaces.length > 0
        ? body.mapAllSearchPlaces
        : null;

    const clientBatch =
      Array.isArray(body.businessesGraphqlBatch) &&
      body.businessesGraphqlBatch.length > 0
        ? body.businessesGraphqlBatch
        : null;

    let usedMapAllSearchPlaces = false;
    let usedClientBusinessesBatch = false;

    /** pcmap GraphQL 배치가 지도 왼쪽 목록과 일치 — allSearch(별도 랭킹)보다 우선 */
    if (clientBatch) {
      console.log("[place-rank-analyze businesses client-batch]", {
        keyword,
        batchLength: clientBatch.length,
      });
      const bc = businessesResultFromBatch(clientBatch);
      graphqlErrors.push(...bc.graphqlErrors);
      if (bc.items.length > 0) {
        items = bc.items;
        apiTotal = bc.total;
        source = "businesses";
        usedClientBusinessesBatch = true;
      }
    }

    if (!usedClientBusinessesBatch && mapAllRaw) {
      const converted = graphqlItemsFromMapAllSearchPlaces(mapAllRaw);
      if (converted.length > 0) {
        items = converted;
        apiTotal = Number(body.mapAllSearchTotalCount ?? converted.length);
        source = "mapAllSearch";
        usedMapAllSearchPlaces = true;
        console.log("[place-rank-analyze mapAllSearch]", {
          keyword,
          rowCount: mapAllRaw.length,
          itemCount: converted.length,
        });
      }
    }

    if (items.length === 0) {
      const food = isRestaurantKeyword(keyword);

      if (food) {
        /** 맛집 축은 restaurant 우선이나, 동시에 businesses를 받아 두면 restaurant 공백·지연 시에도 목록 유지 */
        const [r, b] = await Promise.all([
          fetchRestaurantList(keyword),
          fetchPlacesListBusinesses(keyword),
        ]);
        graphqlErrors.push(...r.graphqlErrors, ...b.graphqlErrors);
        if (r.items.length > 0) {
          items = r.items;
          apiTotal = r.total;
          source = "restaurant";
        } else if (b.items.length > 0) {
          items = b.items;
          apiTotal = b.total;
          source = "businesses";
        } else {
          serverPcmapGraphqlEmpty = true;
          const fromAll = await loadItemsFromCheckPlaceStyleAllSearch(keyword);
          if (fromAll.ok) {
            items = fromAll.items;
            apiTotal = fromAll.total;
            source = "mapAllSearch";
            usedMapAllSearchPlaces = true;
          } else {
            serverTokenlessAllSearchFailed = true;
            if (!diagnostics.hints.some((h) => h.includes("PC맵"))) {
              diagnostics.hints.push(
                "서버·세션 없이는 PC맵 GraphQL 목록을 가져오지 못했을 수 있습니다. 같은 브라우저에서 map.naver.com에 로그인한 뒤 같은 키워드로 지도 검색을 한 다음 다시 분석해 주세요."
              );
            }
            diagnostics.failureCode = mapAllSearchFailureToDiagnosticsCode(
              fromAll.failureCode
            );
            diagnostics.hints.push(fromAll.userMessage);
            items = [];
            apiTotal = 0;
            source = "restaurant";
          }
        }
      } else {
        const b = await fetchPlacesListBusinesses(keyword);
        graphqlErrors.push(...b.graphqlErrors);
        if (b.items.length > 0) {
          items = b.items;
          apiTotal = b.total;
          source = "businesses";
        } else {
          serverPcmapGraphqlEmpty = true;
          const fromAll = await loadItemsFromCheckPlaceStyleAllSearch(keyword);
          if (fromAll.ok) {
            items = fromAll.items;
            apiTotal = fromAll.total;
            source = "mapAllSearch";
            usedMapAllSearchPlaces = true;
          } else {
            serverTokenlessAllSearchFailed = true;
            if (!diagnostics.hints.some((h) => h.includes("PC맵"))) {
              diagnostics.hints.push(
                "서버·세션 없이는 PC맵 GraphQL 목록을 가져오지 못했을 수 있습니다. 같은 브라우저에서 map.naver.com에 로그인한 뒤 같은 키워드로 지도 검색을 한 다음 다시 분석해 주세요."
              );
            }
            diagnostics.failureCode = mapAllSearchFailureToDiagnosticsCode(
              fromAll.failureCode
            );
            diagnostics.hints.push(fromAll.userMessage);
            if (isSportsWellnessPlaceKeyword(keyword)) {
              items = [];
              apiTotal = 0;
              source = "businesses";
              if (!diagnostics.hints.some((h) => h.includes("맛집 API"))) {
                diagnostics.hints.push(
                  "필라테스·요가 등 웰니스 키워드는 맛집(restaurantList) API로 채우지 않습니다. 지도 GraphQL·allSearch가 성공하면 목록이 표시됩니다."
                );
              }
            } else {
              const r = await fetchRestaurantListWithLocationFallback(keyword);
              graphqlErrors.push(...r.graphqlErrors);
              items = r.items;
              apiTotal = r.total;
              source = "restaurant";
            }
          }
        }
      }
    }

    const clientMapAllSearchMeta = body.clientMapAllSearch as
      | { tokenSent?: boolean; apiOk?: boolean; apiCode?: string }
      | undefined;
    if (
      clientMapAllSearchMeta &&
      clientMapAllSearchMeta.tokenSent === false &&
      !usedMapAllSearchPlaces &&
      !usedClientBusinessesBatch
    ) {
      const tok =
        "클라이언트에서 allSearch 토큰을 보내지 않았습니다. 서버가 자동으로 토큰을 받아오지만, 계속 비면 NAVER_MAP_ALL_SEARCH_TOKEN 환경 변수를 설정해 보세요.";
      if (!diagnostics.hints.some((h) => h.includes("allSearch 토큰"))) {
        diagnostics.hints.push(tok);
      }
    }

    if (
      source === "restaurant" &&
      (serverPcmapGraphqlEmpty || serverTokenlessAllSearchFailed)
    ) {
      diagnostics.dataSourceHint =
        "지도·/place 순위와 다를 수 있는 보정 결과입니다. 로그인·allSearch 토큰을 쓰면 더 일치합니다.";
      if (!diagnostics.failureCode && serverPcmapGraphqlEmpty) {
        diagnostics.failureCode = "RESTAURANT_FALLBACK";
      }
    }

    graphqlErrors = Array.from(new Set(graphqlErrors));

    const listCap =
      usedClientBusinessesBatch || usedMapAllSearchPlaces
        ? LIST_CAP_CLIENT_TRUSTED
        : LIST_CAP;

    const regionFiltered = refineItemsForPlaceRankAnalyze(
      items,
      keyword,
      listCap,
      {
        trustNaverBusinessesOrder:
          usedClientBusinessesBatch || usedMapAllSearchPlaces,
      }
    );
    const capped = regionFiltered;
    const baseRows = capped.map((item, index) => mapItemToListRow(item, index));

    const snapshotTryUrls = (placeId: string) => [
      `https://m.place.naver.com/place/${placeId}/home`,
      `https://m.place.naver.com/restaurant/${placeId}/home`,
    ];

    const list = await Promise.all(
      baseRows.map(async (row) => {
        const { _coords, ...rest } = row;
        const placeId = String(rest.placeId || "").trim();
        const placeName = String(rest.name || "").trim();

        let visitor = rest.review.visitor;
        let blog = rest.review.blog;
        let total = rest.review.total;
        let save = rest.review.save ?? "0";

        if (placeId && placeName) {
          let enriched = false;

          for (const tryUrl of snapshotTryUrls(placeId)) {
            try {
              const snapshot = await getNaverPlaceReviewSnapshot({
                placeUrl: tryUrl,
                placeName,
                x: _coords.x,
                y: _coords.y,
              });

              const snapshotVisitor = snapshot.visitorReviewCount ?? visitor;
              const snapshotBlog = snapshot.blogReviewCount ?? blog;

              visitor = snapshotVisitor;
              blog = snapshotBlog;
              total = snapshotVisitor + snapshotBlog;
              save = snapshot.saveCountText ?? save;
              enriched = true;
              break;
            } catch {
              // 다음 URL 시도
            }
          }

          if (!enriched) {
            console.log("[place-rank-analyze review fallback]", placeName);
          }
        }

        return {
          rank: rest.rank,
          placeId,
          name: placeName || "-",
          category: rest.category,
          address: rest.address,
          imageUrl: rest.imageUrl,
          isPromotedAd: rest.isPromotedAd,
          review: {
            visitor,
            blog,
            total,
            save,
          },
        };
      })
    );

    console.log("[place-rank-analyze graphql]", {
      keyword,
      totalCount: apiTotal,
      parsedCount: list.length,
      source,
      graphqlErrors,
    });

    const related = await buildRelatedKeywords(keyword);

    const diagOut = buildPlaceRankDiagnosticsPayload(diagnostics);

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list,
      diagnostics: {
        failureCode: diagOut.failureCode,
        dataSourceHint: diagOut.dataSourceHint,
        hints: diagOut.hints,
        compactSummary: diagOut.compactSummary,
        resolvedSource: source,
      },
    });
  } catch (error) {
    console.error("place-rank-analyze error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "분석 실패",
      },
      { status: 500 }
    );
  }
}
