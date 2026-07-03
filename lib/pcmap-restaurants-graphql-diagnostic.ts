import { fetchPcmapRestaurantListHtmlDiagnostic } from "@/lib/pcmap-restaurant-list-html-fetch";

const PCMAP_GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
const DEFAULT_DISPLAY = 70;
const MAX_PAGES = 4;

const GET_RESTAURANTS_PCMAP_QUERY = `
query getRestaurantsPcmap($input: PlaceListInput) {
  restaurants: placeList(input: $input) {
    businesses {
      total
      items {
        id
        name
        category
        businessCategory
        roadAddress
        address
        x
        y
        visitorReviewCount
        blogCafeReviewCount
        saveCount
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

type JsonRecord = Record<string, unknown>;

export type PcmapRestaurantGraphqlItem = {
  id: string;
  name: string;
  category: string;
  businessCategory: string;
  roadAddress: string;
  address: string;
  x: string;
  y: string;
  visitorReviewCount: number;
  blogCafeReviewCount: number;
  saveCount: number;
};

export type PcmapRestaurantsGraphqlStatus =
  | "FOUND"
  | "OUT_OF_RANGE_280"
  | "PARTIAL_FAILED"
  | "BLOCKED";

export type PcmapRestaurantsGraphqlDiagnosticParams = {
  keyword: string;
  x?: string;
  y?: string;
  start?: number;
  display?: number;
  targetName?: string;
  maxPages?: number;
  fallbackToHtml?: boolean;
};

export type PcmapRestaurantsGraphqlPageDiagnostic = {
  start: number;
  status: number;
  contentType: string;
  parsedCount: number;
  total: number;
  debugReason: string | null;
};

export type PcmapRestaurantsGraphqlDiagnosticResult = {
  ok: boolean;
  status: PcmapRestaurantsGraphqlStatus;
  source: "getRestaurantsPcmap" | "restaurant-list-html-fallback";
  operationName: "getRestaurantsPcmap";
  queryName: "placeList";
  requestedStarts: number[];
  completedPages: number;
  parsedCount: number;
  total: number;
  rank: number | null;
  targetName: string | null;
  top10: Array<PcmapRestaurantGraphqlItem & { rank: number }>;
  items: PcmapRestaurantGraphqlItem[];
  pages: PcmapRestaurantsGraphqlPageDiagnostic[];
  fallbackUsed: boolean;
  debugReason: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function countField(value: unknown): number {
  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeName(value: unknown): string {
  return stringField(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "");
}

function mapItem(value: unknown): PcmapRestaurantGraphqlItem | null {
  if (!isRecord(value)) return null;
  const name = stringField(value.name);
  if (!name) return null;
  return {
    id: stringField(value.id),
    name,
    category: stringField(value.category),
    businessCategory: stringField(value.businessCategory),
    roadAddress: stringField(value.roadAddress),
    address: stringField(value.address),
    x: stringField(value.x),
    y: stringField(value.y),
    visitorReviewCount: countField(value.visitorReviewCount),
    blogCafeReviewCount: countField(value.blogCafeReviewCount),
    saveCount: countField(value.saveCount),
  };
}

function buildPayload(params: {
  keyword: string;
  x: string;
  y: string;
  start: number;
  display: number;
}) {
  return {
    operationName: "getRestaurantsPcmap",
    query: GET_RESTAURANTS_PCMAP_QUERY,
    variables: {
      input: {
        businessType: "restaurant",
        deviceType: "pcmap",
        query: params.keyword,
        x: params.x,
        y: params.y,
        start: params.start,
        display: params.display,
        isPcmap: true,
      },
    },
  };
}

function parseResponse(json: unknown): {
  items: PcmapRestaurantGraphqlItem[];
  total: number;
  debugReason: string | null;
} {
  const root = Array.isArray(json) ? json[0] : json;
  if (!isRecord(root)) return { items: [], total: 0, debugReason: "INVALID_JSON_ROOT" };
  const errors = Array.isArray(root.errors) ? root.errors : [];
  const data = isRecord(root.data) ? root.data : null;
  const restaurants = data && isRecord(data.restaurants) ? data.restaurants : null;
  const businesses =
    restaurants && isRecord(restaurants.businesses)
      ? restaurants.businesses
      : null;
  if (!businesses) {
    return {
      items: [],
      total: 0,
      debugReason: errors.length > 0 ? "GRAPHQL_ERRORS" : "BUSINESSES_PATH_NOT_FOUND",
    };
  }
  const rawItems = Array.isArray(businesses.items) ? businesses.items : [];
  return {
    items: rawItems.map(mapItem).filter((item): item is PcmapRestaurantGraphqlItem => Boolean(item)),
    total: countField(businesses.total),
    debugReason: rawItems.length > 0 && rawItems.map(mapItem).every((item) => !item)
      ? "ITEMS_PARSE_FAILED"
      : null,
  };
}

function delayBetweenPages(): Promise<void> {
  const milliseconds = 1_000 + Math.floor(Math.random() * 1_001);
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function htmlFallback(params: {
  keyword: string;
  x: string;
  y: string;
  targetName?: string;
  requestedStarts: number[];
  pages: PcmapRestaurantsGraphqlPageDiagnostic[];
}): Promise<PcmapRestaurantsGraphqlDiagnosticResult> {
  const html = await fetchPcmapRestaurantListHtmlDiagnostic(params);
  const found = html.targetRank !== null;
  const result: PcmapRestaurantsGraphqlDiagnosticResult = {
    ok: found,
    status: found ? "FOUND" : html.ok ? "PARTIAL_FAILED" : "BLOCKED",
    source: "restaurant-list-html-fallback",
    operationName: "getRestaurantsPcmap",
    queryName: "placeList",
    requestedStarts: params.requestedStarts,
    completedPages: 0,
    parsedCount: html.parsedCount,
    total: html.parsedCount,
    rank: html.targetRank,
    targetName: stringField(params.targetName) || null,
    top10: html.top10.map((item) => ({
      rank: item.rank,
      id: item.id,
      name: item.name,
      category: "",
      businessCategory: "",
      roadAddress: "",
      address: "",
      x: "",
      y: "",
      visitorReviewCount: 0,
      blogCafeReviewCount: 0,
      saveCount: 0,
    })),
    items: [],
    pages: params.pages,
    fallbackUsed: true,
    debugReason: found
      ? null
      : html.ok
        ? "HTML_FALLBACK_ONLY_COVERS_FIRST_70"
        : html.debugReason ?? "HTML_FALLBACK_FAILED",
  };
  console.log("[getRestaurantsPcmap diagnostic result]", {
    status: result.status,
    source: result.source,
    completedPages: result.completedPages,
    parsedCount: result.parsedCount,
    rank: result.rank,
    top10: result.top10.map((item) => `${item.rank}위:${item.name}`),
    fallbackUsed: result.fallbackUsed,
    debugReason: result.debugReason,
  });
  return result;
}

export async function fetchPcmapRestaurantsGraphqlDiagnostic(
  params: PcmapRestaurantsGraphqlDiagnosticParams
): Promise<PcmapRestaurantsGraphqlDiagnosticResult> {
  const keyword = stringField(params.keyword);
  if (!keyword) throw new Error("keyword가 필요합니다.");
  const x = stringField(params.x) || "126.969233";
  const y = stringField(params.y) || "37.528107";
  const display = Math.min(70, Math.max(1, Math.floor(params.display ?? DEFAULT_DISPLAY)));
  const firstStart = Math.max(1, Math.floor(params.start ?? 1));
  const maxPages = Math.min(
    MAX_PAGES,
    Math.max(1, Math.floor(params.maxPages ?? MAX_PAGES))
  );
  const requestedStarts = Array.from(
    { length: maxPages },
    (_, index) => firstStart + index * display
  );
  const targetName = stringField(params.targetName);
  const normalizedTarget = normalizeName(targetName);
  const accumulated: PcmapRestaurantGraphqlItem[] = [];
  const pages: PcmapRestaurantsGraphqlPageDiagnostic[] = [];
  let total = 0;

  const restaurantListUrl = new URL("https://pcmap.place.naver.com/restaurant/list");
  restaurantListUrl.search = new URLSearchParams({ query: keyword, x, y }).toString();
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  for (let pageIndex = 0; pageIndex < requestedStarts.length; pageIndex += 1) {
    const start = requestedStarts[pageIndex]!;
    const response = await fetch(PCMAP_GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        origin: "https://pcmap.place.naver.com",
        referer: restaurantListUrl.toString(),
        "user-agent": userAgent,
        "x-wtm-ncaptcha-token": "NCAPTCHA_FALLBACK_NO_OBJECT",
      },
      body: JSON.stringify([
        buildPayload({ keyword, x, y, start, display }),
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (response.status === 405) {
      pages.push({
        start,
        status: response.status,
        contentType,
        parsedCount: 0,
        total,
        debugReason: "HTTP_405",
      });
      console.warn("[getRestaurantsPcmap diagnostic] HTTP 405", { start });
      if (params.fallbackToHtml !== false) {
        return htmlFallback({
          keyword,
          x,
          y,
          targetName,
          requestedStarts,
          pages,
        });
      }
      break;
    }

    const raw = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      pages.push({
        start,
        status: response.status,
        contentType,
        parsedCount: 0,
        total,
        debugReason: "NON_JSON_RESPONSE",
      });
      break;
    }
    const parsed = parseResponse(json);
    total = Math.max(total, parsed.total);
    pages.push({
      start,
      status: response.status,
      contentType,
      parsedCount: parsed.items.length,
      total: parsed.total,
      debugReason:
        response.ok && parsed.debugReason === null
          ? null
          : parsed.debugReason ?? `HTTP_${response.status}`,
    });
    if (!response.ok || parsed.debugReason) break;

    accumulated.push(...parsed.items);
    if (normalizedTarget) {
      const foundAt = accumulated.findIndex(
        (item) => normalizeName(item.name) === normalizedTarget
      );
      if (foundAt >= 0) {
        return diagnosticResult({
          status: "FOUND",
          requestedStarts,
          accumulated,
          total,
          rank: firstStart + foundAt,
          targetName,
          pages,
          debugReason: null,
        });
      }
    }
    if (parsed.items.length < display) break;
    if (pageIndex < requestedStarts.length - 1) await delayBetweenPages();
  }

  const allPagesCompleted = pages.length === requestedStarts.length &&
    pages.every((page) => page.status === 200 && page.debugReason === null);
  return diagnosticResult({
    status: allPagesCompleted ? "OUT_OF_RANGE_280" : "PARTIAL_FAILED",
    requestedStarts,
    accumulated,
    total,
    rank: null,
    targetName,
    pages,
    debugReason: allPagesCompleted ? null : pages.at(-1)?.debugReason ?? "PAGE_FAILED",
  });
}

function diagnosticResult(params: {
  status: PcmapRestaurantsGraphqlStatus;
  requestedStarts: number[];
  accumulated: PcmapRestaurantGraphqlItem[];
  total: number;
  rank: number | null;
  targetName: string;
  pages: PcmapRestaurantsGraphqlPageDiagnostic[];
  debugReason: string | null;
}): PcmapRestaurantsGraphqlDiagnosticResult {
  const result: PcmapRestaurantsGraphqlDiagnosticResult = {
    ok: params.status === "FOUND" || params.status === "OUT_OF_RANGE_280",
    status: params.status,
    source: "getRestaurantsPcmap",
    operationName: "getRestaurantsPcmap",
    queryName: "placeList",
    requestedStarts: params.requestedStarts,
    completedPages: params.pages.filter(
      (page) => page.status === 200 && page.debugReason === null
    ).length,
    parsedCount: params.accumulated.length,
    total: params.total,
    rank: params.rank,
    targetName: params.targetName || null,
    top10: params.accumulated.slice(0, 10).map((item, index) => ({
      rank: params.requestedStarts[0]! + index,
      ...item,
    })),
    items: params.accumulated,
    pages: params.pages,
    fallbackUsed: false,
    debugReason: params.debugReason,
  };
  console.log("[getRestaurantsPcmap diagnostic result]", {
    status: result.status,
    source: result.source,
    requestedStarts: result.requestedStarts,
    completedPages: result.completedPages,
    parsedCount: result.parsedCount,
    total: result.total,
    rank: result.rank,
    top10: result.top10.map((item) => `${item.rank}위:${item.name}`),
    fallbackUsed: result.fallbackUsed,
    debugReason: result.debugReason,
  });
  return result;
}
