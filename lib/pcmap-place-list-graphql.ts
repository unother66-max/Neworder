import { parseNaverPlaceNewOpen } from "./naver-place-new-open";

const PCMAP_GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
const DEFAULT_DISPLAY = 70;
const MAX_PAGES = 4;

const GET_PLACES_LIST_QUERY = `
query getPlacesList($input: PlaceListInput) {
  placeList(input: $input) {
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
        newOpening
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

type JsonRecord = Record<string, unknown>;

export type PcmapPlaceListItem = {
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
  isNewOpen: boolean | null;
  newOpenLabel: "새로오픈" | null;
};

export type PcmapPlaceListStatus =
  | "FOUND"
  | "OUT_OF_RANGE_280"
  | "PARTIAL_FAILED"
  | "BLOCKED";

export type PcmapPlaceListPageDiagnostic = {
  start: number;
  status: number;
  contentType: string;
  parsedCount: number;
  total: number;
  hasGraphqlErrors: boolean;
  topLevelKeys: string[];
  dataKeys: string[];
  responsePathCandidates: string[];
  debugReason: string | null;
};

export type PcmapPlaceListResult = {
  ok: boolean;
  status: PcmapPlaceListStatus;
  source: "getPlacesList";
  operationName: "getPlacesList";
  queryName: "placeList";
  requestedStarts: number[];
  completedPages: number;
  parsedCount: number;
  total: number;
  rank: number | null;
  targetName: string | null;
  items: PcmapPlaceListItem[];
  pages: PcmapPlaceListPageDiagnostic[];
  debugReason: string | null;
};

export type PcmapPlaceListParams = {
  keyword: string;
  x?: string;
  y?: string;
  start?: number;
  display?: number;
  maxPages?: number;
  targetName?: string;
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

function mapItem(value: unknown): PcmapPlaceListItem | null {
  if (!isRecord(value)) return null;
  const name = stringField(value.name);
  if (!name) return null;
  const newOpen = parseNaverPlaceNewOpen(value);
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
    saveCount: 0,
    ...newOpen,
  };
}

function safeGraphqlError(errors: unknown[]): string {
  const first = errors.find(isRecord);
  if (!first) return "GRAPHQL_ERRORS";
  const type = stringField(first.extensions && isRecord(first.extensions)
    ? first.extensions.code
    : first.status).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  const message = stringField(first.message)
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[A-Za-z0-9._=-]{24,}/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
  return ["GRAPHQL_ERRORS", type, message].filter(Boolean).join(":");
}

function delayBetweenPages(): Promise<void> {
  const milliseconds = 1_000 + Math.floor(Math.random() * 1_001);
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchPcmapPlaceListGraphql(
  params: PcmapPlaceListParams
): Promise<PcmapPlaceListResult> {
  const keyword = stringField(params.keyword);
  if (!keyword) throw new Error("keyword가 필요합니다.");
  const x = stringField(params.x) || "126.969233";
  const y = stringField(params.y) || "37.528107";
  const display = Math.min(70, Math.max(1, Math.floor(params.display ?? DEFAULT_DISPLAY)));
  const firstStart = Math.max(1, Math.floor(params.start ?? 1));
  const maxPages = Math.min(MAX_PAGES, Math.max(1, Math.floor(params.maxPages ?? MAX_PAGES)));
  const requestedStarts = Array.from({ length: maxPages }, (_, index) => firstStart + index * display);
  const targetName = stringField(params.targetName);
  const normalizedTarget = normalizeName(targetName);
  const accumulated: PcmapPlaceListItem[] = [];
  const pages: PcmapPlaceListPageDiagnostic[] = [];
  const referer = new URL("https://pcmap.place.naver.com/place/list");
  referer.search = new URLSearchParams({ query: keyword, x, y }).toString();
  let total = 0;
  let naturalEnd = false;

  for (let pageIndex = 0; pageIndex < requestedStarts.length; pageIndex += 1) {
    const start = requestedStarts[pageIndex]!;
    const response = await fetch(PCMAP_GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        origin: "https://pcmap.place.naver.com",
        referer: referer.toString(),
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "x-wtm-ncaptcha-token": "NCAPTCHA_FALLBACK_NO_OBJECT",
      },
      body: JSON.stringify([{
        operationName: "getPlacesList",
        query: GET_PLACES_LIST_QUERY,
        variables: {
          input: {
            businessType: "place",
            deviceType: "pcmap",
            query: keyword,
            x,
            y,
            start,
            display,
            isPcmap: true,
          },
        },
      }]),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    let json: unknown = null;
    try {
      json = JSON.parse(raw);
    } catch {
      // 아래 진단에서 NON_JSON_RESPONSE로 처리한다.
    }
    const root = Array.isArray(json) ? json[0] : json;
    const rootRecord = isRecord(root) ? root : null;
    const errors = rootRecord && Array.isArray(rootRecord.errors) ? rootRecord.errors : [];
    const data = rootRecord && isRecord(rootRecord.data) ? rootRecord.data : null;
    const placeList = data && isRecord(data.placeList) ? data.placeList : null;
    const businesses = placeList && isRecord(placeList.businesses) ? placeList.businesses : null;
    const rawItems = businesses && Array.isArray(businesses.items) ? businesses.items : [];
    const items = rawItems.map(mapItem).filter((item): item is PcmapPlaceListItem => Boolean(item));
    const pageTotal = businesses ? countField(businesses.total) : 0;
    total = Math.max(total, pageTotal);
    const debugReason = !response.ok
      ? `HTTP_${response.status}`
      : errors.length > 0
        ? safeGraphqlError(errors)
        : !rootRecord
          ? "NON_JSON_RESPONSE"
          : !businesses
            ? "BUSINESSES_PATH_NOT_FOUND"
            : rawItems.length > 0 && items.length === 0
              ? "ITEMS_PARSE_FAILED"
              : null;
    const diagnostic: PcmapPlaceListPageDiagnostic = {
      start,
      status: response.status,
      contentType,
      parsedCount: items.length,
      total: pageTotal,
      hasGraphqlErrors: errors.length > 0,
      topLevelKeys: rootRecord ? Object.keys(rootRecord).slice(0, 20) : [],
      dataKeys: data ? Object.keys(data).slice(0, 20) : [],
      responsePathCandidates: [
        "data.placeList.businesses.items",
        "data.restaurants.businesses.items",
        "data.places.items",
      ],
      debugReason,
    };
    pages.push(diagnostic);
    if (items.length === 0 || debugReason) {
      console.warn("[pcmap placeList parsedCount 0]", diagnostic);
    }
    if (debugReason) break;

    accumulated.push(...items);
    const foundAt = normalizedTarget
      ? accumulated.findIndex((item) => normalizeName(item.name) === normalizedTarget)
      : -1;
    if (foundAt >= 0) {
      return buildResult("FOUND", requestedStarts, pages, accumulated, total, firstStart + foundAt, targetName, null);
    }
    if (items.length < display || (total > 0 && accumulated.length >= total)) {
      naturalEnd = true;
      break;
    }
    if (pageIndex < requestedStarts.length - 1) await delayBetweenPages();
  }

  const completed = naturalEnd || (
    pages.length === requestedStarts.length &&
    pages.every((page) => page.status === 200 && page.debugReason === null)
  );
  return buildResult(
    completed ? "OUT_OF_RANGE_280" : "PARTIAL_FAILED",
    requestedStarts,
    pages,
    accumulated,
    total,
    null,
    targetName,
    completed ? null : pages.at(-1)?.debugReason ?? "PAGE_FAILED"
  );
}

function buildResult(
  status: PcmapPlaceListStatus,
  requestedStarts: number[],
  pages: PcmapPlaceListPageDiagnostic[],
  items: PcmapPlaceListItem[],
  total: number,
  rank: number | null,
  targetName: string,
  debugReason: string | null
): PcmapPlaceListResult {
  const result: PcmapPlaceListResult = {
    ok: status === "FOUND" || status === "OUT_OF_RANGE_280",
    status,
    source: "getPlacesList",
    operationName: "getPlacesList",
    queryName: "placeList",
    requestedStarts,
    completedPages: pages.filter((page) => page.status === 200 && page.debugReason === null).length,
    parsedCount: items.length,
    total,
    rank,
    targetName: targetName || null,
    items,
    pages,
    debugReason,
  };
  console.log("[getPlacesList diagnostic result]", {
    status: result.status,
    requestedStarts,
    completedPages: result.completedPages,
    parsedCount: result.parsedCount,
    total,
    rank,
    debugReason,
  });
  return result;
}
