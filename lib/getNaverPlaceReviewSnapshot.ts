import { fetchAllSearchPlacesCheckPlaceRankStyleDetailed } from "./naver-map-all-search";

type ReviewSnapshot = {
  totalReviewCount: number | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCountText: string | null;
  keywordList: string[]; // ✅ 추가
};

type GetReviewSnapshotInput = {
  placeUrl: string;
  placeName?: string | null;
  x?: string | null;
  y?: string | null;
};

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";

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

  // 404/차단 등의 경우에도 바디 일부를 남겨 디버깅/파싱 폴백에 활용
  return res.text();
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
    ]),
    blogReviewCount: extract([
      /"blogReviewCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?\+?)"?/i,
      /"blogCafeReviewCount"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?(?:만|천)?\+?)"?/i,
    ]),
  };
}

type ParsedTypeResult = {
  type: "restaurant" | "place";
  pageMetricCount: number;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: number | null;
  keywordList: string[];
};

export function chooseBestPlaceTypeResult<T extends ParsedTypeResult>(
  results: T[]
) {
  const score = (result: T) =>
    result.pageMetricCount * 10 +
    Number(result.visitorReviewCount !== null) * 4 +
    Number(result.blogReviewCount !== null) * 4 +
    Number(result.saveCount !== null) * 2 +
    Number(result.keywordList.length > 0);

  return [...results].sort((a, b) => score(b) - score(a))[0] ?? null;
}

const GET_SAVECOUNT_QUERY = `
query getRestaurants(
  $restaurantListInput: RestaurantListInput,
  $restaurantListFilterInput: RestaurantListFilterInput,
  $reverseGeocodingInput: ReverseGeocodingInput,
  $useReverseGeocode: Boolean = false
) {
  restaurants: restaurantList(input: $restaurantListInput) {
    items {
      ...CommonBusinessItems
      ...RestaurantBusinessItems
      __typename
    }
    ...RestaurantCommonFields
    __typename
  }
  filters: restaurantListFilter(input: $restaurantListFilterInput) {
    __typename
  }
  reverseGeocodingAddr(input: $reverseGeocodingInput) @include(if: $useReverseGeocode) {
    __typename
  }
}

fragment CommonBusinessItems on BusinessSummary {
  id
  name
  x
  y
  roadAddress
  address
  __typename
}

fragment RestaurantCommonFields on RestaurantListResult {
  total
  __typename
}

fragment RestaurantBusinessItems on RestaurantListSummary {
  visitorReviewCount
  blogCafeReviewCount
  totalReviewCount
  saveCount
  __typename
}
`;

async function fetchCountsFromGraphql(
  keyword: string,
  targetName: string,
  publicPlaceId: string,
  x?: string | null,
  y?: string | null
) {
  try {
    const safeX = String(x || "127.0005");
    const safeY = String(y || "37.53455");

    const payload = [
  {
    operationName: "getRestaurants",
    variables: {
      useReverseGeocode: true,
      restaurantListInput: {
        query: keyword,
        x: safeX,
        y: safeY,
        start: 1,
        display: 30,
        deviceType: "pcmap",
        isPcmap: true,
      },
      restaurantListFilterInput: {
        x: safeX,
        y: safeY,
        display: 30,
        start: 1,
        query: keyword,
      },
      reverseGeocodingInput: {
        x: safeX,
        y: safeY,
      },
    },
    query: GET_SAVECOUNT_QUERY,
  },
];

    const referer = `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(
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
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      console.log("[save graphql status]", res.status);
      const text = await res.text();
      console.log("[save graphql error body]", text.slice(0, 500));
      return null;
    }

    const json = (await res.json()) as Array<{
      data?: {
        restaurants?: {
          items?: Array<{
            id?: unknown;
            name?: unknown;
            visitorReviewCount?: unknown;
            blogCafeReviewCount?: unknown;
            saveCount?: unknown;
          }>;
        };
      };
    }>;
    const items = json?.[0]?.data?.restaurants?.items || [];
    const normalizedTarget = normalizeText(targetName);

    const found =
      items.find((item) => String(item?.id || "") === publicPlaceId) ||
      items.find((item) => normalizeText(String(item?.name || "")) === normalizedTarget) ||
      items.find((item) => normalizeText(String(item?.name || "")).includes(normalizedTarget)) ||
      items.find((item) => normalizedTarget.includes(normalizeText(String(item?.name || ""))));

    if (!found) {
      console.log("[save graphql not found]", {
        keyword,
        targetName,
        sample: items.slice(0, 10).map((item) => ({
          id: item?.id,
          name: item?.name,
          saveCount: item?.saveCount,
        })),
      });
      return null;
    }

    return {
      visitorReviewCount: parseKoreanNumber(found?.visitorReviewCount),
      blogReviewCount: parseKoreanNumber(found?.blogCafeReviewCount),
      saveCount: parseKoreanNumber(found?.saveCount),
    };
  } catch (error) {
    console.log("[save graphql error]", error);
    return null;
  }
}

async function fetchCountsFromAllSearch(
  keyword: string,
  publicPlaceId: string,
  x?: string | null,
  y?: string | null
) {
  if (!keyword) return null;

  try {
    const result = await fetchAllSearchPlacesCheckPlaceRankStyleDetailed(
      keyword,
      { x: x || undefined, y: y || undefined }
    );
    if (!result.ok) return null;

    const found = result.places.find(
      (place) => String(place.id) === publicPlaceId
    );
    if (!found) return null;

    return {
      visitorReviewCount: parseKoreanNumber(found.placeReviewCount),
      blogReviewCount: parseKoreanNumber(found.reviewCount),
    };
  } catch (error) {
    console.warn("[review allSearch fallback failed]", {
      keyword,
      publicPlaceId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getNaverPlaceReviewSnapshot(
  input: string | GetReviewSnapshotInput
): Promise<ReviewSnapshot> {
  try {
    const placeUrl = typeof input === "string" ? input : input.placeUrl;
    const placeName = typeof input === "string" ? "" : String(input.placeName || "");
    const x = typeof input === "string" ? "" : String(input.x || "");
    const y = typeof input === "string" ? "" : String(input.y || "");

    const publicPlaceId = extractPublicPlaceId(placeUrl);

    if (!publicPlaceId) {
  return {
    totalReviewCount: null,
    visitorReviewCount: null,
    blogReviewCount: null,
    saveCountText: null,
    keywordList: [],
  };
}

    const hintType: "restaurant" | "place" =
      /\/restaurant\//.test(placeUrl) ? "restaurant" : "place";
    const tryTypes: Array<"restaurant" | "place"> =
      hintType === "restaurant" ? ["restaurant", "place"] : ["place", "restaurant"];
    const [graphqlCounts, allSearchCounts] = await Promise.all([
      placeName
        ? fetchCountsFromGraphql(
            placeName,
            placeName,
            publicPlaceId,
            x,
            y
          )
        : null,
      placeName
        ? fetchCountsFromAllSearch(placeName, publicPlaceId, x, y)
        : null,
    ]);

    const parseForType = async (type: "restaurant" | "place") => {
      const mobileHomeUrl = `https://m.place.naver.com/${type}/${publicPlaceId}/home`;
      const mobileVisitorReviewUrl = `https://m.place.naver.com/${type}/${publicPlaceId}/review/visitor?entry=ple&reviewSort=recent`;
      const pcEntryUrl = `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`;
      const infoUrl = `https://pcmap.place.naver.com/${type}/${publicPlaceId}/information`;

      const [infoHtml, homeHtml, visitorHtml, pcHtml] = await Promise.all([
        fetchHtml(infoUrl),
        fetchHtml(mobileHomeUrl),
        fetchHtml(mobileVisitorReviewUrl),
        fetchHtml(pcEntryUrl),
      ]);

      const keywordMatch = infoHtml.match(/"keywordList":\[(.*?)\]/);
      const keywordList = keywordMatch
        ? keywordMatch[1]
            .split(",")
            .map((k) => k.replace(/"/g, "").trim())
            .filter(Boolean)
        : [];

      const homeJson = findNextDataJson(homeHtml);
      const visitorJson = findNextDataJson(visitorHtml);
      const pcJson = findNextDataJson(pcHtml);

      const homeJsonParsed = extractCountsFromJsonObject(homeJson);
      const visitorJsonParsed = extractCountsFromJsonObject(visitorJson);
      const pcJsonParsed = extractCountsFromJsonObject(pcJson);
      const homeRawParsed = extractReviewCountsFromRawHtml(homeHtml);
      const visitorRawParsed = extractReviewCountsFromRawHtml(visitorHtml);
      const pcRawParsed = extractReviewCountsFromRawHtml(pcHtml);

      const visitorReviewCountFromPage =
        homeJsonParsed.visitorReviewCount ??
        visitorJsonParsed.visitorReviewCount ??
        pcJsonParsed.visitorReviewCount ??
        homeRawParsed.visitorReviewCount ??
        visitorRawParsed.visitorReviewCount ??
        pcRawParsed.visitorReviewCount ??
        extractCountByLabel(visitorHtml, ["방문자 리뷰", "방문자리뷰"]) ??
        extractCountByLabel(homeHtml, ["방문자 리뷰", "방문자리뷰"]) ??
        extractCountByLabel(pcHtml, ["방문자 리뷰", "방문자리뷰"]) ??
        null;
      const visitorReviewCount =
        visitorReviewCountFromPage ??
        graphqlCounts?.visitorReviewCount ??
        allSearchCounts?.visitorReviewCount ??
        null;

      const blogReviewCountFromPage =
        homeJsonParsed.blogReviewCount ??
        visitorJsonParsed.blogReviewCount ??
        pcJsonParsed.blogReviewCount ??
        homeRawParsed.blogReviewCount ??
        visitorRawParsed.blogReviewCount ??
        pcRawParsed.blogReviewCount ??
        extractCountByLabel(visitorHtml, ["블로그 리뷰", "블로그리뷰"]) ??
        extractCountByLabel(homeHtml, ["블로그 리뷰", "블로그리뷰"]) ??
        extractCountByLabel(pcHtml, ["블로그 리뷰", "블로그리뷰"]) ??
        null;
      const blogReviewCount =
        blogReviewCountFromPage ??
        graphqlCounts?.blogReviewCount ??
        allSearchCounts?.blogReviewCount ??
        null;

      const saveCount =
        graphqlCounts?.saveCount ??
        homeJsonParsed.saveCount ??
        visitorJsonParsed.saveCount ??
        pcJsonParsed.saveCount ??
        extractSaveCountFromRawHtml(homeHtml) ??
        extractSaveCountFromRawHtml(visitorHtml) ??
        extractSaveCountFromRawHtml(pcHtml) ??
        extractCountByLabel(homeHtml, ["저장", "저장수"]) ??
        extractCountByLabel(visitorHtml, ["저장", "저장수"]) ??
        extractCountByLabel(pcHtml, ["저장", "저장수"]) ??
        null;

      const totalReviewCount =
        visitorReviewCount !== null || blogReviewCount !== null
          ? (visitorReviewCount ?? 0) + (blogReviewCount ?? 0)
          : null;

      return {
        type,
        keywordList,
        pageMetricCount:
          Number(visitorReviewCountFromPage !== null) +
          Number(blogReviewCountFromPage !== null),
        totalReviewCount,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
      };
    };

    const parsedResults = await Promise.all(tryTypes.map(parseForType));
    const parsed = chooseBestPlaceTypeResult(parsedResults);

    console.log("[snapshot raw input]", input);
    console.log("[review snapshot parsed]", {
      publicPlaceId,
      placeName,
      x,
      y,
      hintType,
      chosenType: parsed?.type,
      triedTypes: parsedResults.map((result) => ({
        type: result.type,
        visitorReviewCount: result.visitorReviewCount,
        blogReviewCount: result.blogReviewCount,
        saveCount: result.saveCount,
      })),
      visitorReviewCount: parsed?.visitorReviewCount ?? null,
      blogReviewCount: parsed?.blogReviewCount ?? null,
      saveCount: parsed?.saveCount ?? null,
    });

    return {
      totalReviewCount: parsed?.totalReviewCount ?? null,
      visitorReviewCount: parsed?.visitorReviewCount ?? null,
      blogReviewCount: parsed?.blogReviewCount ?? null,
      saveCountText: parsed?.saveCount != null ? String(parsed.saveCount) : null,
      keywordList: parsed?.keywordList ?? [],
    };

    } catch (error) {
  console.error("[getNaverPlaceReviewSnapshot error]", error);

  return {
    totalReviewCount: null,
    visitorReviewCount: null,
    blogReviewCount: null,
    saveCountText: null,
    keywordList: [],
  };
}
}
