import { after, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { prisma } from "@/lib/prisma";
import {
  hasFreshRegisteredKeywordCache,
  isRegisteredKeywordBlockReason,
  isRegisteredKeywordCooldownActive,
  loadRegisteredKeywordCacheState,
  mapWithConcurrency,
  type RegisteredKeywordCacheEntry,
} from "@/lib/place-registered-keyword-cache";
import {
  enqueueRegisteredKeywordCollectionTargets,
  processRegisteredKeywordQueue,
  type RegisteredKeywordQueueTarget,
} from "@/lib/place-registered-keyword-queue";
import {
  extractReviewFeatureKeywordsFromObject,
  getNaverPlaceReviewSnapshot,
  type KeywordCollectionStatus,
} from "@/lib/getNaverPlaceReviewSnapshot";
import {
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
  pickBusinessesCoords,
  pickPlaceRankGeoRadiiKm,
} from "@/lib/naver-map-businesses-shared";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import {
  type AllSearchCheckPlaceFailureCode,
  type MapAllSearchPlaceRow,
} from "@/lib/naver-map-all-search";
import {
  mergePcmapGraphqlBatch,
  parseNullableNaverReviewCountField,
} from "@/lib/merge-pcmap-businesses-batch";
import {
  PLACE_ANALYSIS_BATCH_SCHEMA_VERSION,
  parseNaverPlaceNewOpen,
  pcmapBatchHasNewOpeningField,
} from "@/lib/naver-place-new-open";
import { buildPcmapPlaceListRequestPayload } from "@/lib/pcmap-place-list-request";

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
const PLACE_ANALYSIS_REVIEW_CONCURRENCY = 2;

type PlaceAnalysisCollectionSource =
  | "pcmap-graphql"
  | "apollo-state"
  | "allsearch"
  | "cache";

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

  // 의도형 키워드는 restaurant 강제 사용 금지
  const intentHints = [
    "데이트",
    "핫플",
    "가볼만한",
    "놀거리",
    "분위기",
    "코스",
  ];

  const isIntentKeyword = intentHints.some((h) =>
    n.includes(normalizeText(h))
  );

  if (isIntentKeyword) {
    return false;
  }

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

function isIntentMixedKeyword(keyword: string): boolean {
  const n = normalizeText(keyword);

  const hints = [
    "데이트",
    "핫플",
    "가볼만한",
    "놀거리",
    "분위기",
    "코스",
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
  saveCount?: string | number | null;
  /** pcmap PlaceListBusinessesItem.newOpening */
  newOpening?: boolean | null;
  microReview?: unknown;
  /** pcmap 배치의 PlaceAdSummary */
  isPromotedAd?: boolean;
  adId?: string;
};

function extractNaverPlaceId(value: unknown): string {
  const raw = String(value ?? "");
  return (
    raw.match(/\/(?:restaurant|place)\/(\d+)/i)?.[1] ??
    raw.match(/\/entry\/place\/(\d+)/i)?.[1] ??
    ""
  );
}

type RegisteredKeywordHistoryFallback = {
  keywords: string[];
  collectedAt: Date;
};

async function loadPlaceAnalysisUserId(): Promise<string> {
  try {
    const session = (await getServerSession(authOptions)) as
      | { user?: { id?: string | null } }
      | null;
    return String(session?.user?.id ?? "").trim();
  } catch (error) {
    // 분석 자체는 공개/비로그인 상태에서도 기존처럼 동작한다. 세션을 읽지
    // 못하면 브라우저 캐시 저장 티켓과 사용자 전용 history만 비활성화한다.
    console.warn("[place-rank-analyze session]", {
      reason: error instanceof Error ? error.name : "UNKNOWN",
    });
    return "";
  }
}

async function loadRegisteredKeywordHistoryByPlaceId(userId: string) {
  const byPlaceId = new Map<string, RegisteredKeywordHistoryFallback>();
  if (!userId) return byPlaceId;
  try {
    const places = await prisma.place.findMany({
      where: { userId, type: "review" },
      select: {
        placeUrl: true,
        reviewHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { keywords: true, updatedAt: true },
        },
      },
    });
    for (const place of places) {
      const placeId = extractNaverPlaceId(place.placeUrl);
      const latest = place.reviewHistory[0];
      if (!placeId || !latest) continue;
      // 과거 PlaceReviewHistory는 미수집 실패도 []로 남을 수 있어 빈 배열의
      // AVAILABLE 여부를 판별할 수 없다. 비어 있지 않은 성공 이력만 seed하고,
      // 실제 빈 값은 새 캐시의 hasSuccessfulValue=true + []로만 보존한다.
      const keywords = latest.keywords
        .map((keyword) => String(keyword).trim())
        .filter(Boolean);
      if (keywords.length === 0) continue;
      byPlaceId.set(placeId, {
        keywords,
        collectedAt: latest.updatedAt,
      });
    }
  } catch (error) {
    console.warn("[place-rank-analyze registered keyword history]", {
      reason: error instanceof Error ? error.name : "UNKNOWN",
    });
  }
  return byPlaceId;
}

async function tryRegisteredKeywordCache<T>(
  action: string,
  work: () => Promise<T>
): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.warn("[place-rank-analyze registered keyword cache]", {
      action,
      reason: error instanceof Error ? error.name : "UNKNOWN",
    });
    return null;
  }
}

function shouldOpenReviewSnapshotCircuit(params: {
  reason: string;
  requestUrls?: string[];
  collectedRegisteredKeywords: boolean;
}) {
  const lastUrl = params.requestUrls?.at(-1) ?? "";
  const informationOnlyBlock =
    params.collectedRegisteredKeywords &&
    /HTML_(?:NCAPTCHA|COOLDOWN|BLOCKED_HTTP_403|HTTP_429)/i.test(
      params.reason
    ) &&
    /\/information(?:[/?#]|$)/i.test(lastUrl);
  return !informationOnlyBlock;
}

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
      businessCategory: String(r.businessCategory ?? "").trim(),
      imageUrl: String(r.thumUrl ?? "").trim(),
      x: String(r.x ?? "").trim(),
      y: String(r.y ?? "").trim(),
      roadAddress: String(r.roadAddress ?? "").trim(),
      address: String(r.address ?? "").trim(),
      visitorReviewCount: vOk,
      blogCafeReviewCount: bOk,
      totalReviewCount: vOk + bOk,
      // 현재 allSearch place.list 원본에는 새로오픈 상태 필드가 확인되지 않았다.
      // 리뷰 수/개업 시점으로 추정하지 않고 unknown으로 유지한다.
      newOpening: null,
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

function parseBatchedGraphqlBody(raw: string): unknown[] | null {
  const t = String(raw || "").trimStart();
  if (!t || t.startsWith("<")) return null;
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

function collectBatchErrors(batch: unknown[]): string[] {
  const out: string[] = [];
  for (const item of batch) {
    if (!item || typeof item !== "object") continue;
    const errors = (item as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) continue;
    for (const err of errors) {
      const m =
        err && typeof err === "object"
          ? (err as { message?: unknown }).message
          : null;
      if (typeof m === "string" && m.trim()) out.push(m.trim());
    }
  }
  return out;
}

function safeGraphqlError(value: unknown): string | null {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  const message = (/^[A-Z0-9_]+(?::[^\s]*)?$/.test(raw)
    ? raw
    : raw
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[A-Za-z0-9._=-]{24,}/g, "[REDACTED]")
  ).slice(0, 240);
  return message || null;
}

type FetchBusinessesResult = {
  items: GraphqlItem[];
  total: number;
  graphqlErrors: string[];
  fallbackUsed: boolean;
  primaryError: string | null;
  queryUsed: string;
};

function businessesResultFromBatch(
  batch: unknown[],
  queryUsed: string
): FetchBusinessesResult {
  const merged = mergePcmapGraphqlBatch(batch);
  const items = merged.items as GraphqlItem[];
  const graphqlErrors = Array.from(
    new Set([...collectBatchErrors(batch), ...merged.graphqlErrors])
  );
  console.log("[place-rank-analyze batch merge]", {
    mergedCount: items.length,
    total: merged.total,
    gqlErrorCount: graphqlErrors.length,
  });
  return {
    items,
    total: merged.total,
    graphqlErrors,
    fallbackUsed: false,
    primaryError: safeGraphqlError(graphqlErrors[0]),
    queryUsed,
  };
}

async function fetchPlacesListBusinessesOnce(
  keyword: string,
  opts?: { mapReferer?: boolean; pageCount?: number }
): Promise<FetchBusinessesResult> {
  const coords = pickBusinessesCoords(keyword);
  const mapReferer = Boolean(opts?.mapReferer);
  const pageCount = mapReferer
    ? 1
    : Math.max(1, opts?.pageCount ?? BUSINESSES_GRAPHQL_PAGE_COUNT);
  const batchBody = Array.from({ length: pageCount }, (_, index) =>
    buildPcmapPlaceListRequestPayload({
      businessType: "place",
      keyword,
      x: coords.x,
      y: coords.y,
      start: 1 + index * LIST_CAP,
      display: LIST_CAP,
    })
  );
  const bodyStr = JSON.stringify(batchBody);
  const headers = mapReferer
    ? buildGetPlacesListFetchHeaders(keyword)
    : buildGetPlacesListFetchHeadersForServer(keyword, coords);

  console.log("[place-rank-analyze businesses request]", {
    keyword,
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
    return {
      items: [],
      total: 0,
      graphqlErrors: [`HTTP_${res.status}_NON_JSON`],
      fallbackUsed: false,
      primaryError: `HTTP_${res.status}_NON_JSON`,
      queryUsed: keyword,
    };
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

  const firstPart = (json[0] ?? null) as
    | { data?: Record<string, unknown>; errors?: unknown }
    | null;
  const d0 = firstPart?.data;
  const placesContainer = d0?.places as
    | { businesses?: { total?: number; items?: unknown[] } }
    | undefined;
  const plRoot = placesContainer?.businesses;
  const bizRoot = d0?.businesses as { total?: number; items?: unknown[] } | undefined;
  const organic = plRoot?.items?.length ? plRoot : bizRoot;
  console.log("[place-rank-analyze businesses raw]", {
    keyword,
    httpStatus: res.status,
    rawPreview,
    batchFirstStringified: JSON.stringify(json[0] ?? null).slice(0, 8000),
    dataKeys: Object.keys(d0 || {}),
    placesItems: Array.isArray(plRoot?.items) ? plRoot!.items!.length : -1,
    businessesItems: Array.isArray(bizRoot?.items) ? bizRoot!.items!.length : -1,
    total: organic?.total,
    itemsLength: Array.isArray(organic?.items) ? organic!.items!.length : -1,
    firstItem: organic?.items?.[0] ?? null,
    batchErrors: firstPart?.errors ?? null,
  });

  return businessesResultFromBatch(batch, keyword);
}

async function fetchPlacesListBusinesses(
  originalKeyword: string
): Promise<FetchBusinessesResult> {
  const tryMapReferer = async (): Promise<FetchBusinessesResult | null> => {
    await new Promise((r) => setTimeout(r, 420));
    const m = await fetchPlacesListBusinessesOnce(originalKeyword, {
      mapReferer: true,
    });
    return m.items.length > 0 ? m : null;
  };

  const only = await fetchPlacesListBusinessesOnce(originalKeyword);
  if (only.items.length > 0) {
    return only;
  }

  const mapOnly = await tryMapReferer();
  if (mapOnly) {
    const errors = Array.from(
      new Set([...only.graphqlErrors, ...mapOnly.graphqlErrors])
    );
    return {
      items: mapOnly.items,
      total: mapOnly.total,
      graphqlErrors: errors,
      fallbackUsed: true,
      primaryError:
        only.primaryError ?? safeGraphqlError(errors[0]) ?? "PRIMARY_EMPTY",
      queryUsed: originalKeyword,
    };
  }

  console.warn("[place-rank-analyze businesses server empty]", {
    keyword: originalKeyword,
    triedFallbackKeyword: false,
    originalKeywordPreserved: true,
    hint: "브라우저 세션으로 map.naver.com에서 받은 배열을 body.businessesGraphqlBatch로 넘기거나, 별도 프록시/자동화를 검토하세요.",
  });
  return only;
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
      "X-Wtm-NCaptcha-Token": "NCAPTCHA_FALLBACK_NO_OBJECT",
    },
    body: JSON.stringify([
      buildPcmapPlaceListRequestPayload({
        businessType: "restaurant",
        keyword,
        x: coords.x,
        y: coords.y,
        start,
        display: RESTAURANT_DISPLAY,
      }),
    ]),
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

  const firstPart = (batch[0] ?? null) as
    | {
        data?: {
          restaurants?: {
            businesses?: { total?: unknown; items?: unknown[] };
          };
        };
      }
    | null;
  const root = firstPart?.data?.restaurants?.businesses;
  const items = Array.isArray(root?.items)
    ? (root.items as GraphqlItem[])
    : [];
  const total = Number(root?.total || 0);

  return { items, total, graphqlErrors: gqlErrors };
}

async function fetchRestaurantList(
  keyword: string
): Promise<FetchRestaurantsResult> {
  const coords = pickBusinessesCoords(keyword);

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
  const visitor = parseNullableNaverReviewCountField(item.visitorReviewCount);
  const blog = parseNullableNaverReviewCountField(item.blogCafeReviewCount);
  const totalFromApi = parseNullableNaverReviewCountField(
    item.totalReviewCount
  );
  const save = parseNullableNaverReviewCountField(item.saveCount);
  const total =
    totalFromApi ??
    (visitor !== null && blog !== null ? visitor + blog : null);
  const category = String(item.category ?? "").trim();
  const businessCategory = String(item.businessCategory ?? "").trim();
  const reviewFeatureKeywords =
    extractReviewFeatureKeywordsFromObject(item);
  const newOpen = parseNaverPlaceNewOpen(item);

  return {
    rank: index + 1,
    placeId: String(item.id ?? ""),
    name: String(item.name ?? ""),
    category: category || businessCategory,
    businessCategory,
    address: String(
      item.roadAddress || item.address || item.fullAddress || ""
    ).trim(),
    imageUrl: pickGraphqlItemImageUrl(item),
    isPromotedAd: Boolean(item.isPromotedAd),
    ...newOpen,
    registeredKeywords: null as string[] | null,
    registeredKeywordsStatus: "UNAVAILABLE" as KeywordCollectionStatus,
    reviewFeatureKeywords: reviewFeatureKeywords.keywords,
    reviewFeatureKeywordsStatus: reviewFeatureKeywords.status,
    review: {
      visitor,
      blog,
      total,
      save,
      visitorStatus: visitor === null ? "UNAVAILABLE" : "AVAILABLE",
      blogStatus: blog === null ? "UNAVAILABLE" : "AVAILABLE",
      saveStatus: save === null ? "UNAVAILABLE" : "AVAILABLE",
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

    const analysisUserId = await loadPlaceAnalysisUserId();

    let items: GraphqlItem[] = [];
    let apiTotal = 0;
    let source: "businesses" | "restaurant" | "mapAllSearch" = "businesses";
    let graphqlErrors: string[] = [];
    let fallbackUsed = false;
    let primaryError: string | null = null;
    let earlierAttemptFailed = false;
    const noteFailedAttempt = (reason: unknown) => {
      earlierAttemptFailed = true;
      primaryError ??= safeGraphqlError(reason) ?? "PRIMARY_EMPTY";
    };
    const noteSelectedResult = () => {
      if (earlierAttemptFailed) fallbackUsed = true;
    };

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
    const clientBatchKeyword = String(
      body.businessesGraphqlKeyword ?? ""
    ).trim();
    const clientBatchSchemaVersion = Number(
      body.businessesGraphqlSchemaVersion ?? 0
    );
    const clientBatchHasNewOpening = pcmapBatchHasNewOpeningField(clientBatch);

    let usedMapAllSearchPlaces = false;
    let usedClientBusinessesBatch = false;

    /** pcmap GraphQL 배치가 지도 왼쪽 목록과 일치 — allSearch(별도 랭킹)보다 우선 */
    if (
      clientBatch &&
      !isIntentMixedKeyword(keyword) &&
      clientBatchKeyword === keyword &&
      clientBatchSchemaVersion === PLACE_ANALYSIS_BATCH_SCHEMA_VERSION &&
      clientBatchHasNewOpening
    ) {
      console.log("[place-rank-analyze businesses client-batch]", {
        keyword,
        batchLength: clientBatch.length,
      });
      const bc = businessesResultFromBatch(clientBatch, clientBatchKeyword);
      graphqlErrors.push(...bc.graphqlErrors);
      if (bc.items.length > 0) {
        items = bc.items;
        apiTotal = bc.total;
        source = "businesses";
        usedClientBusinessesBatch = true;
        primaryError ??= bc.primaryError;
        noteSelectedResult();
      } else {
        noteFailedAttempt(bc.primaryError ?? "CLIENT_BATCH_EMPTY");
      }
    } else if (clientBatch && !isIntentMixedKeyword(keyword)) {
      noteFailedAttempt(
        clientBatchKeyword !== keyword
          ? clientBatchKeyword
            ? `CLIENT_BATCH_QUERY_MISMATCH:${clientBatchKeyword}`
            : "CLIENT_BATCH_QUERY_UNVERIFIED"
          : clientBatchSchemaVersion !== PLACE_ANALYSIS_BATCH_SCHEMA_VERSION
            ? `CLIENT_BATCH_SCHEMA_STALE:${clientBatchSchemaVersion}`
            : "CLIENT_BATCH_NEW_OPENING_FIELD_MISSING"
      );
      diagnostics.hints.push(
        clientBatchKeyword !== keyword
          ? "브라우저 GraphQL 응답의 검색어가 원문과 일치하는지 확인할 수 없어 해당 batch를 사용하지 않았습니다."
          : "새로오픈 필드가 없는 구버전 GraphQL batch를 사용하지 않고 다시 수집했습니다."
      );
      console.warn("[place-rank-analyze client batch rejected]", {
        requestedKeyword: keyword,
        clientBatchKeyword: clientBatchKeyword || null,
        clientBatchSchemaVersion,
        expectedSchemaVersion: PLACE_ANALYSIS_BATCH_SCHEMA_VERSION,
        clientBatchHasNewOpening,
      });
    }

    if ((!usedClientBusinessesBatch || isIntentMixedKeyword(keyword)) && mapAllRaw) {
      const converted = graphqlItemsFromMapAllSearchPlaces(mapAllRaw);
      if (converted.length > 0) {
        items = converted;
        apiTotal = Number(body.mapAllSearchTotalCount ?? converted.length);
        source = "mapAllSearch";
        usedMapAllSearchPlaces = true;
        noteSelectedResult();
        console.log("[place-rank-analyze mapAllSearch]", {
          keyword,
          rowCount: mapAllRaw.length,
          itemCount: converted.length,
        });
      }
    }

    if (items.length === 0) {
      const intentMixed = isIntentMixedKeyword(keyword);
      const food = isRestaurantKeyword(keyword);
    
      if (intentMixed) {
        const fromAll = await loadItemsFromCheckPlaceStyleAllSearch(keyword);
    
        if (fromAll.ok) {
          items = fromAll.items;
          apiTotal = fromAll.total;
          source = "mapAllSearch";
          usedMapAllSearchPlaces = true;
          noteSelectedResult();
    
          console.log("[place-rank-analyze intentMixed allSearch first]", {
            keyword,
            count: items.length,
            total: apiTotal,
          });
        } else {
          serverTokenlessAllSearchFailed = true;
          noteFailedAttempt(
            `ALLSEARCH_${fromAll.failureCode}`
          );
          diagnostics.failureCode = mapAllSearchFailureToDiagnosticsCode(
            fromAll.failureCode
          );
          diagnostics.hints.push(fromAll.userMessage);
    
          const b = await fetchPlacesListBusinesses(keyword);
          graphqlErrors.push(...b.graphqlErrors);
    
          if (b.items.length > 0) {
            items = b.items;
            apiTotal = b.total;
            source = "businesses";
            if (b.fallbackUsed) {
              fallbackUsed = true;
              primaryError ??= b.primaryError;
            }
            noteSelectedResult();
          } else {
            noteFailedAttempt(b.primaryError ?? "GET_PLACES_LIST_EMPTY");
          }
        }
      } else if (food) {
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
          noteSelectedResult();
        } else if (b.items.length > 0) {
          noteFailedAttempt(
            safeGraphqlError(r.graphqlErrors[0]) ?? "GET_RESTAURANTS_PCMAP_EMPTY"
          );
          items = b.items;
          apiTotal = b.total;
          source = "businesses";
          if (b.fallbackUsed) {
            primaryError ??= b.primaryError;
          }
          noteSelectedResult();
        } else {
          noteFailedAttempt(
            safeGraphqlError(r.graphqlErrors[0]) ??
              b.primaryError ??
              "PCMAP_PRIMARY_EMPTY"
          );
          serverPcmapGraphqlEmpty = true;
          const fromAll = await loadItemsFromCheckPlaceStyleAllSearch(keyword);
          if (fromAll.ok) {
            items = fromAll.items;
            apiTotal = fromAll.total;
            source = "mapAllSearch";
            usedMapAllSearchPlaces = true;
            noteSelectedResult();
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
          if (b.fallbackUsed) {
            fallbackUsed = true;
            primaryError ??= b.primaryError;
          }
          noteSelectedResult();
        } else {
          noteFailedAttempt(b.primaryError ?? "GET_PLACES_LIST_EMPTY");
          serverPcmapGraphqlEmpty = true;
          const fromAll = await loadItemsFromCheckPlaceStyleAllSearch(keyword);
          if (fromAll.ok) {
            items = fromAll.items;
            apiTotal = fromAll.total;
            source = "mapAllSearch";
            usedMapAllSearchPlaces = true;
            noteSelectedResult();
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
              const r = await fetchRestaurantList(keyword);
              graphqlErrors.push(...r.graphqlErrors);
              items = r.items;
              apiTotal = r.total;
              source = "restaurant";
              if (r.items.length > 0) noteSelectedResult();
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
    const collectionSource: PlaceAnalysisCollectionSource =
      source === "mapAllSearch" ? "allsearch" : "pcmap-graphql";
    const rawGallant = items.find(
      (item) => normalizeText(String(item.name ?? "")) === normalizeText("갈란트")
    );
    const mappedGallant = baseRows.find(
      (item) => normalizeText(item.name) === normalizeText("갈란트")
    );
    if (rawGallant || mappedGallant) {
      console.log("[place-rank-analyze new-open trace]", {
        stage: "raw-to-common-mapper",
        source: collectionSource,
        placeId: String(rawGallant?.id ?? mappedGallant?.placeId ?? ""),
        rawHasNewOpening: rawGallant
          ? Object.prototype.hasOwnProperty.call(rawGallant, "newOpening")
          : false,
        rawNewOpening: rawGallant?.newOpening ?? null,
        mappedIsNewOpen: mappedGallant?.isNewOpen ?? null,
        mappedNewOpenLabel: mappedGallant?.newOpenLabel ?? null,
      });
    }
    const cacheLoadAt = new Date();
    const publicPlaceIds = baseRows
      .map((row) => String(row.placeId || "").trim())
      .filter(Boolean);
    const [registeredKeywordHistoryByPlaceId, loadedCacheState] =
      await Promise.all([
        loadRegisteredKeywordHistoryByPlaceId(analysisUserId),
        tryRegisteredKeywordCache("load", () =>
          loadRegisteredKeywordCacheState(publicPlaceIds, cacheLoadAt)
        ),
      ]);
    const registeredKeywordCacheByPlaceId =
      loadedCacheState?.byPlaceId ??
      new Map<string, RegisteredKeywordCacheEntry>();
    const registeredKeywordGlobalCooldown = Boolean(
      loadedCacheState?.globalBlockUntil &&
        loadedCacheState.globalBlockUntil.getTime() > cacheLoadAt.getTime()
    );
    let reviewSnapshotCircuitOpen = false;
    let reviewSnapshotCircuitReason: string | null = null;
    const registeredKeywordQueueTargets: RegisteredKeywordQueueTarget[] = [];

    const list = await mapWithConcurrency(
      baseRows,
      PLACE_ANALYSIS_REVIEW_CONCURRENCY,
      async (row) => {
        const { _coords, ...rest } = row;
        const placeId = String(rest.placeId || "").trim();
        const placeName = String(rest.name || "").trim();
        const attemptAt = new Date();
        const cacheEntry = registeredKeywordCacheByPlaceId.get(placeId);
        const historyFallback =
          registeredKeywordHistoryByPlaceId.get(placeId);
        const freshCache = hasFreshRegisteredKeywordCache(
          cacheEntry,
          attemptAt
        );
        const cooldownActive = isRegisteredKeywordCooldownActive(
          cacheEntry,
          attemptAt
        );
        const snapshotCircuitOpenAtStart = reviewSnapshotCircuitOpen;
        const queueStatus = cacheEntry?.queueStatus ?? "IDLE";
        const collectionDelayed =
          registeredKeywordGlobalCooldown || cooldownActive;
        let keywordDebugReason: string | null =
          (registeredKeywordGlobalCooldown
            ? loadedCacheState?.globalBlockReason
            : cacheEntry?.lastFailureCode) ?? null;
        let keywordCacheStatus = freshCache
          ? "HIT_FRESH"
          : collectionDelayed
            ? "COLLECTION_DELAYED"
            : queueStatus === "PROCESSING"
              ? "PROCESSING"
              : queueStatus === "QUEUED"
                ? "QUEUED"
                : "QUEUE_PENDING";

        let visitor = rest.review.visitor;
        let blog = rest.review.blog;
        let total = rest.review.total;
        let save: string | number | null = rest.review.save;
        let chosenType: "restaurant" | "place" | null = null;
        let reviewDebugReason: string | null = null;
        let registeredKeywords = rest.registeredKeywords;
        let registeredKeywordsStatus: KeywordCollectionStatus =
          rest.registeredKeywordsStatus;
        let registeredKeywordsSource:
          | "NAVER_INFORMATION"
          | "REGISTERED_KEYWORD_CACHE"
          | "PLACE_REVIEW_HISTORY"
          | null = null;
        let registeredKeywordsCollectedAt: Date | null = null;
        let reviewFeatureKeywords = rest.reviewFeatureKeywords;
        let reviewFeatureKeywordsStatus: KeywordCollectionStatus =
          rest.reviewFeatureKeywordsStatus;

        if (
          placeId &&
          placeName &&
          !freshCache &&
          rest.registeredKeywordsStatus !== "AVAILABLE"
        ) {
          registeredKeywordQueueTargets.push({
            publicPlaceId: placeId,
            placeName,
            category: rest.category,
            businessType: rest.businessCategory,
            x: _coords.x,
            y: _coords.y,
          });
        }

        // 리뷰/저장 수는 기존 경로를 유지하되, 등록 키워드 /information 요청은
        // 이 웹 응답과 분리된 durable queue에서만 수행한다.
        if (placeId && placeName && !snapshotCircuitOpenAtStart) {
          try {
            const restaurantHint = /^(?:restaurant|food|cafe)$/i.test(
              rest.businessCategory
            );
            const placeUrl = `https://m.place.naver.com/${
              restaurantHint ? "restaurant" : "place"
            }/${placeId}/home`;
            const snapshot = await getNaverPlaceReviewSnapshot({
              placeUrl,
              placeName,
              placeId,
              category: rest.category,
              businessType: rest.businessCategory,
              pcmapUrl: `https://pcmap.place.naver.com/${
                restaurantHint ? "restaurant" : "place"
              }/${placeId}/home`,
              x: _coords.x,
              y: _coords.y,
              collectRegisteredKeywords: false,
            });

            visitor = snapshot.visitorReviewCount ?? visitor;
            blog = snapshot.blogReviewCount ?? blog;
            total =
              visitor !== null && blog !== null ? visitor + blog : total;
            save = snapshot.saveCountText ?? save;
            chosenType = snapshot.chosenType;
            reviewDebugReason = snapshot.debugReason;
            const explicitBlockReason = [
              snapshot.debugReason,
              snapshot.reason,
            ].find((reason): reason is string =>
              isRegisteredKeywordBlockReason(reason)
            );
            if (explicitBlockReason) {
              if (
                shouldOpenReviewSnapshotCircuit({
                  reason: explicitBlockReason,
                  requestUrls: snapshot.requestUrls,
                  collectedRegisteredKeywords: false,
                })
              ) {
                reviewSnapshotCircuitOpen = true;
                reviewSnapshotCircuitReason = explicitBlockReason;
              }
            }
            if (snapshot.reviewFeatureKeywordsStatus === "AVAILABLE") {
              reviewFeatureKeywords = snapshot.reviewFeatureKeywords;
              reviewFeatureKeywordsStatus = "AVAILABLE";
            }
          } catch (error) {
            reviewDebugReason =
              error instanceof Error
                ? `SNAPSHOT_ERROR:${error.name}`
                : "SNAPSHOT_ERROR";
            console.log("[place-rank-analyze review fallback]", placeName);
          }
        } else if (snapshotCircuitOpenAtStart) {
          reviewDebugReason = `SNAPSHOT_CIRCUIT_OPEN:${
            reviewSnapshotCircuitReason ?? "NAVER_BLOCKED"
          }`;
        }

        if (
          registeredKeywordsStatus === "UNAVAILABLE" &&
          cacheEntry?.hasSuccessfulValue
        ) {
          registeredKeywords = cacheEntry.keywords;
          registeredKeywordsStatus = "AVAILABLE";
          registeredKeywordsSource = "REGISTERED_KEYWORD_CACHE";
          registeredKeywordsCollectedAt = cacheEntry.collectedAt;
          keywordCacheStatus =
            freshCache
              ? "HIT_FRESH"
              : collectionDelayed
                ? "HIT_STALE_DELAYED"
                : queueStatus === "PROCESSING"
                  ? "HIT_STALE_PROCESSING"
                  : "HIT_STALE_QUEUE_PENDING";
        } else if (
          registeredKeywordsStatus === "UNAVAILABLE" &&
          historyFallback
        ) {
          registeredKeywords = historyFallback.keywords;
          registeredKeywordsStatus = "AVAILABLE";
          registeredKeywordsSource = "PLACE_REVIEW_HISTORY";
          registeredKeywordsCollectedAt = historyFallback.collectedAt;
          keywordCacheStatus = collectionDelayed
            ? "LEGACY_HISTORY_DELAYED"
            : "LEGACY_HISTORY_QUEUE_PENDING";
        } else if (registeredKeywordsStatus === "AVAILABLE") {
          registeredKeywordsSource = "NAVER_INFORMATION";
          registeredKeywordsCollectedAt = attemptAt;
          keywordCacheStatus = "LIVE_AVAILABLE";
          keywordDebugReason = null;
        }

        return {
          rank: rest.rank,
          placeId,
          name: placeName || "-",
          category: rest.category,
          businessCategory: rest.businessCategory || null,
          address: rest.address,
          imageUrl: rest.imageUrl,
          isPromotedAd: rest.isPromotedAd,
          isNewOpen: rest.isNewOpen,
          newOpenLabel: rest.newOpenLabel,
          source: collectionSource,
          registeredKeywords: registeredKeywords?.slice(0, 5) ?? null,
          registeredKeywordsStatus,
          registeredKeywordsSource,
          registeredKeywordsCollectedAt:
            registeredKeywordsCollectedAt?.toISOString() ?? null,
          registeredKeywordsCacheSource: cacheEntry?.source ?? null,
          registeredKeywordsCacheStatus: keywordCacheStatus,
          registeredKeywordsLastAttemptAt:
            cacheEntry?.lastAttemptAt?.toISOString() ?? null,
          registeredKeywordsCooldownUntil:
            (registeredKeywordGlobalCooldown
              ? loadedCacheState?.globalBlockUntil
              : cacheEntry?.cooldownUntil
            )?.toISOString() ?? null,
          registeredKeywordsLastFailureCode:
            cacheEntry?.lastFailureCode ?? null,
          registeredKeywordsLiveAttempted: false,
          registeredKeywordsDebugReason: keywordDebugReason,
          // 기존 UI/API 호환 필드. 의미는 업체 등록 키워드로만 제한한다.
          keywords: registeredKeywords?.slice(0, 5) ?? null,
          reviewFeatureKeywords:
            reviewFeatureKeywords?.slice(0, 5) ?? null,
          reviewFeatureKeywordsStatus,
          review: {
            visitor,
            blog,
            total,
            save,
            visitorStatus: visitor === null ? "UNAVAILABLE" : "AVAILABLE",
            blogStatus: blog === null ? "UNAVAILABLE" : "AVAILABLE",
            saveStatus: save === null ? "UNAVAILABLE" : "AVAILABLE",
            chosenType,
            debugReason: reviewDebugReason,
          },
        };
      }
    );
    const saveCountUnavailableCount = list.filter(
      (row) => row.review.save === null
    ).length;
    const finalGallant = list.find(
      (item) => normalizeText(item.name) === normalizeText("갈란트")
    );
    if (fallbackUsed && !primaryError) {
      primaryError = safeGraphqlError(graphqlErrors[0]) ?? "PRIMARY_EMPTY";
    }
    const debug = {
      originalKeyword: rawKeyword,
      requestedKeyword: keyword,
      graphqlKeyword: keyword,
      totalCount: apiTotal,
      resultCount: list.length,
      fallbackUsed,
      saveCountUnavailableCount,
      primaryError,
      queryUsed: keyword,
      source: collectionSource,
      responseCache: "none" as const,
      batchSchemaVersion: PLACE_ANALYSIS_BATCH_SCHEMA_VERSION,
      gallantNewOpenTrace: rawGallant || mappedGallant || finalGallant
        ? {
            placeId: String(
              rawGallant?.id ?? mappedGallant?.placeId ?? finalGallant?.placeId ?? ""
            ),
            rawHasNewOpening: rawGallant
              ? Object.prototype.hasOwnProperty.call(rawGallant, "newOpening")
              : false,
            rawNewOpening: rawGallant?.newOpening ?? null,
            mappedIsNewOpen: mappedGallant?.isNewOpen ?? null,
            finalIsNewOpen: finalGallant?.isNewOpen ?? null,
            finalNewOpenLabel: finalGallant?.newOpenLabel ?? null,
          }
        : null,
    };

    console.log("[place-rank-analyze graphql]", {
      ...debug,
      source,
      graphqlErrors,
    });

    const related = await buildRelatedKeywords(keyword);

    if (registeredKeywordQueueTargets.length > 0) {
      // 응답 전송 뒤 DB enqueue와 한 건의 순차 수집만 수행한다.
      // 남은 항목은 durable queue를 cron이 이어서 처리한다.
      after(async () => {
        try {
          await enqueueRegisteredKeywordCollectionTargets(
            registeredKeywordQueueTargets
          );
          await processRegisteredKeywordQueue({ maxItems: 1 });
        } catch (queueError) {
          console.warn("[place-analysis registered keyword queue] after", {
            reason:
              queueError instanceof Error ? queueError.name : "UNKNOWN_ERROR",
          });
        }
      });
    }

    const diagOut = buildPlaceRankDiagnosticsPayload(diagnostics);

    return NextResponse.json(
      {
        ok: true,
        keyword,
        related,
        list,
        source: collectionSource,
        originalKeyword: debug.originalKeyword,
        requestedKeyword: debug.requestedKeyword,
        graphqlKeyword: debug.graphqlKeyword,
        totalCount: debug.totalCount,
        resultCount: debug.resultCount,
        fallbackUsed: debug.fallbackUsed,
        saveCountUnavailableCount: debug.saveCountUnavailableCount,
        debug,
        diagnostics: {
          failureCode: diagOut.failureCode,
          dataSourceHint: diagOut.dataSourceHint,
          hints: diagOut.hints,
          compactSummary: diagOut.compactSummary,
          resolvedSource: source,
          collectionSource,
          fallbackUsed,
          primaryError,
          queryUsed: keyword,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
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
