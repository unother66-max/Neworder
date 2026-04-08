import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
const DEFAULT_X = "127.0005";
const DEFAULT_Y = "37.53455";
const DISPLAY = 15;

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
  totalReviewCount?: number;
  visitorReviewCount?: number;
  blogCafeReviewCount?: number;
  saveCount?: string | number;
};

function buildGraphqlPayload(keyword: string, x: string, y: string, start = 1) {
  return [
    {
      operationName: "getRestaurants",
      variables: {
        useReverseGeocode: true,
 
        restaurantListInput: {
          query: keyword,
          x,
          y,
          start,
          display: DISPLAY,
          deviceType: "pcmap",
          isPcmap: true,
        },
        restaurantListFilterInput: {
          x,
          y,
          display: DISPLAY,
          start,
          query: keyword,
        },
        reverseGeocodingInput: {
          x,
          y,
        },
      },
      query: GET_RESTAURANTS_QUERY,
    },
  ];
}

function parseGraphqlItems(json: any): GraphqlItem[] {
  if (!Array.isArray(json)) return [];

  const target = json.find((item) => item?.data?.restaurants?.items);
  const items = target?.data?.restaurants?.items;

  if (!Array.isArray(items)) return [];
  return items;
}

function buildMobilePlaceUrl(placeId: string) {
  if (!placeId) return "";
  return `https://m.place.naver.com/restaurant/${placeId}/home`;
}

async function fetchRankList(keyword: string) {
  const payload = buildGraphqlPayload(keyword, DEFAULT_X, DEFAULT_Y, 1);

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://pcmap.place.naver.com",
      Referer: `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(
        keyword
      )}&x=${DEFAULT_X}&y=${DEFAULT_Y}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await res.text();
  console.log("[place-rank-analyze raw]", raw.slice(0, 300));

  if (!res.ok) {
    throw new Error(`네이버 응답 실패 (${res.status})`);
  }

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error("네이버 응답이 JSON이 아닙니다.");
  }

  return parseGraphqlItems(json);
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
  ).slice(0, 5);

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

    const items = await fetchRankList(keyword);

    const list = await Promise.all(
      items.map(async (item, index) => {
        const placeId = String(item.id || "").trim();
        const placeName = String(item.name || "").trim();
        const placeUrl = buildMobilePlaceUrl(placeId);

        let visitor = item.visitorReviewCount ?? 0;
        let blog = item.blogCafeReviewCount ?? 0;
        let total = item.totalReviewCount ?? visitor + blog;
        let save = item.saveCount ?? "0";

        if (placeUrl && placeName) {
          try {
            const snapshot = await getNaverPlaceReviewSnapshot({
              placeUrl,
              placeName,
              x: item.x ? String(item.x) : "",
              y: item.y ? String(item.y) : "",
            });

            const snapshotVisitor = snapshot.visitorReviewCount ?? visitor;
            const snapshotBlog = snapshot.blogReviewCount ?? blog;

            visitor = snapshotVisitor;
            blog = snapshotBlog;
            total = snapshotVisitor + snapshotBlog;
            save = snapshot.saveCountText ?? save;
          } catch (e) {
            console.log("[place-rank-analyze review fallback]", placeName);
          }
        }

        return {
          rank: index + 1,
          placeId,
          name: placeName || "-",
          category: String(item.category || item.businessCategory || "").trim(),
          address: String(item.roadAddress || item.address || "").trim(),
          imageUrl: String(item.imageUrl || "").trim(),
          review: {
            total,
            visitor,
            blog,
            save,
          },
        };
      })
    );

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
        message:
          error instanceof Error ? error.message : "분석 실패",
      },
      { status: 500 }
    );
  }
}