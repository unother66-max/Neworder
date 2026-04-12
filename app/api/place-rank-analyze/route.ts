import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import {
  NAVER_PCMAP_GRAPHQL_URL,
  buildGetPlacesListBatch,
  buildGetPlacesListFetchHeadersForServer,
  resolveBusinessesCoords,
} from "@/lib/naver-map-businesses-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
const DISPLAY = 15;
/** 최종 list 상한 (businesses가 최대 30건까지 가져올 수 있음) */
const LIST_CAP = 30;

const DEFAULT_X = "127.0005";
const DEFAULT_Y = "37.53455";

/** 띄어쓰기 기준 토큰 제거 시 "지역 + 업종" 검색을 업종만으로 넓힘 */
const LOCATION_QUERY_TOKENS = new Set([
  "서울역",
  "강남",
  "강남역",
  "역삼",
  "역삼역",
  "선릉",
  "논현",
  "신논현",
  "홍대",
  "홍대입구",
  "합정",
  "마포",
  "여의도",
  "잠실",
  "송파",
  "종로",
  "광화문",
  "명동",
  "을지로",
  "동대문",
  "신촌",
  "건대",
  "성수",
  "판교",
  "분당",
  "수원",
  "신림",
  "이태원",
  "한남",
  "압구정",
  "청담",
]);

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

function buildFallbackSearchKeyword(keyword: string): string | null {
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const filtered = parts.filter((p) => {
    if (LOCATION_QUERY_TOKENS.has(p)) return false;
    if (p.endsWith("역") && p.length >= 2 && p.length <= 10) return false;
    return true;
  });

  const next = filtered.join(" ").trim();
  if (!next || next === trimmed) return null;
  return next;
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
  x?: string;
  y?: string;
  address?: string;
  roadAddress?: string;
  fullAddress?: string;
  visitorReviewCount?: number;
  blogCafeReviewCount?: number;
  totalReviewCount?: number;
  saveCount?: string | number;
};

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
  const gqlErrors = collectBatchErrors(batch);
  const root = batch[0]?.data?.businesses;
  const items = Array.isArray(root?.items) ? root.items : [];
  const total = Number(root?.total || 0);
  return { items, total, graphqlErrors: gqlErrors };
}

async function fetchPlacesListBusinessesOnce(
  keyword: string,
  coordAnchorKeyword?: string
): Promise<FetchBusinessesResult> {
  const coords = resolveBusinessesCoords(keyword, coordAnchorKeyword);
  const batchBody = buildGetPlacesListBatch(keyword, coords);
  const bodyStr = JSON.stringify(batchBody);
  const headers = buildGetPlacesListFetchHeadersForServer(keyword, coords);

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

  console.log("[place-rank-analyze businesses raw]", {
    keyword,
    httpStatus: res.status,
    rawPreview,
    batchFirstStringified: JSON.stringify(json[0] ?? null).slice(0, 8000),
    dataKeys: Object.keys(json?.[0]?.data || {}),
    businessesKeys: Object.keys(json?.[0]?.data?.businesses || {}),
    total: json?.[0]?.data?.businesses?.total,
    itemsLength: Array.isArray(json?.[0]?.data?.businesses?.items)
      ? json[0].data.businesses.items.length
      : -1,
    firstItem: json?.[0]?.data?.businesses?.items?.[0] ?? null,
    batchErrors: json?.[0]?.errors ?? null,
  });

  return businessesResultFromBatch(batch);
}

async function fetchPlacesListBusinesses(
  originalKeyword: string
): Promise<FetchBusinessesResult> {
  const fallback = buildFallbackSearchKeyword(originalKeyword);

  /** 지역+업종(예: 서울역 필라테스)은 원문이 0건인 경우가 많아, 업종-only를 먼저 시도 */
  if (fallback) {
    console.log("[place-rank-analyze fallback]", {
      original: originalKeyword,
      fallback,
      mode: "fallback-first",
    });

    const fromFallback = await fetchPlacesListBusinessesOnce(
      fallback,
      originalKeyword
    );
    if (fromFallback.items.length > 0) {
      return fromFallback;
    }

    await new Promise((r) => setTimeout(r, 350));

    const fromOriginal = await fetchPlacesListBusinessesOnce(originalKeyword);
    const mergedErrors = Array.from(
      new Set([...fromFallback.graphqlErrors, ...fromOriginal.graphqlErrors])
    );

    if (fromOriginal.items.length > 0) {
      return {
        items: fromOriginal.items,
        total: fromOriginal.total,
        graphqlErrors: mergedErrors,
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
  if (only.items.length === 0) {
    console.warn("[place-rank-analyze businesses server empty]", {
      keyword: originalKeyword,
      triedFallbackKeyword: false,
      hint: "브라우저 세션으로 map.naver.com에서 받은 배열을 body.businessesGraphqlBatch로 넘기거나, 별도 프록시/자동화를 검토하세요.",
    });
  }
  return only;
}

function buildRestaurantListPayload(keyword: string) {
  return [
    {
      operationName: "getRestaurants",
      variables: {
        useReverseGeocode: true,
        restaurantListInput: {
          query: keyword,
          x: DEFAULT_X,
          y: DEFAULT_Y,
          start: 1,
          display: DISPLAY,
          deviceType: "pcmap",
          isPcmap: true,
        },
        restaurantListFilterInput: {
          x: DEFAULT_X,
          y: DEFAULT_Y,
          display: DISPLAY,
          start: 1,
          query: keyword,
        },
        reverseGeocodingInput: {
          x: DEFAULT_X,
          y: DEFAULT_Y,
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

async function fetchRestaurantList(keyword: string): Promise<FetchRestaurantsResult> {
  const referer = `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(
    keyword
  )}&x=${DEFAULT_X}&y=${DEFAULT_Y}`;

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
    body: JSON.stringify(buildRestaurantListPayload(keyword)),
    cache: "no-store",
  });

  const raw = await res.text();
  const batch = parseBatchedGraphqlBody(raw);

  if (!batch) {
    console.warn("[place-rank-analyze] restaurantList 비JSON/HTML", {
      keyword,
      status: res.status,
      head: raw.slice(0, 200),
    });
    return { items: [], total: 0, graphqlErrors: [] };
  }

  const gqlErrors = collectBatchErrors(batch);
  if (gqlErrors.length) {
    console.warn("[place-rank-analyze] restaurantList GraphQL errors", {
      keyword,
      gqlErrors,
    });
  }

  const root = batch[0]?.data?.restaurants;
  const items = Array.isArray(root?.items) ? root.items : [];
  const total = Number(root?.total || 0);

  return { items, total, graphqlErrors: gqlErrors };
}

/**
 * "서울역 필라테스"처럼 지역+업종은 restaurantList가 0인 경우가 많고,
 * 업종만(필라테스)은 같은 API에서 건수가 나오는 경우가 있어 businesses와 동일하게 fallback-first.
 * 맛집 키워드 경로(food → restaurant 먼저)에는 사용하지 않음.
 */
async function fetchRestaurantListWithLocationFallback(
  originalKeyword: string
): Promise<FetchRestaurantsResult> {
  const fallback = buildFallbackSearchKeyword(originalKeyword);
  if (!fallback) {
    return fetchRestaurantList(originalKeyword);
  }

  console.log("[place-rank-analyze restaurant fallback-key]", {
    original: originalKeyword,
    fallback,
    mode: "fallback-first",
  });

  const fromFallback = await fetchRestaurantList(fallback);
  if (fromFallback.items.length > 0) {
    return fromFallback;
  }

  await new Promise((r) => setTimeout(r, 350));

  const fromOriginal = await fetchRestaurantList(originalKeyword);
  const mergedErrors = Array.from(
    new Set([...fromFallback.graphqlErrors, ...fromOriginal.graphqlErrors])
  );

  return {
    items: fromOriginal.items,
    total: fromOriginal.total,
    graphqlErrors: mergedErrors,
  };
}

function mapItemToListRow(item: GraphqlItem, index: number) {
  const visitor = Number(item.visitorReviewCount || 0);
  const blog = Number(item.blogCafeReviewCount || 0);
  const totalFromApi = Number(item.totalReviewCount || 0);
  const total = totalFromApi || visitor + blog;

  return {
    rank: index + 1,
    placeId: String(item.id ?? ""),
    name: String(item.name ?? ""),
    category: String(item.category || item.businessCategory || "").trim(),
    address: String(
      item.roadAddress || item.address || item.fullAddress || ""
    ).trim(),
    imageUrl: String(item.imageUrl || "").trim(),
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
    const keyword = String(body.keyword || "").trim();

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 없음" },
        { status: 400 }
      );
    }

    let items: GraphqlItem[] = [];
    let apiTotal = 0;
    let source: "businesses" | "restaurant" = "businesses";
    let graphqlErrors: string[] = [];

    const clientBatch =
      Array.isArray(body.businessesGraphqlBatch) &&
      body.businessesGraphqlBatch.length > 0
        ? body.businessesGraphqlBatch
        : null;

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
      }
    }

    if (items.length === 0) {
      const food = isRestaurantKeyword(keyword);

      if (food) {
        const r = await fetchRestaurantList(keyword);
        graphqlErrors.push(...r.graphqlErrors);
        if (r.items.length > 0) {
          items = r.items;
          apiTotal = r.total;
          source = "restaurant";
        } else {
          const b = await fetchPlacesListBusinesses(keyword);
          graphqlErrors.push(...b.graphqlErrors);
          if (b.items.length > 0) {
            items = b.items;
            apiTotal = b.total;
            source = "businesses";
          } else {
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
          const r = await fetchRestaurantListWithLocationFallback(keyword);
          graphqlErrors.push(...r.graphqlErrors);
          items = r.items;
          apiTotal = r.total;
          source = "restaurant";
        }
      }
    }

    graphqlErrors = Array.from(new Set(graphqlErrors));

    const capped = items.slice(0, LIST_CAP);
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

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list,
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
