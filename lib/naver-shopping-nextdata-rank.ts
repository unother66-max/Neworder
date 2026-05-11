type NsPortalProductUrl = {
  pcUrl?: string | null;
  mobileUrl?: string | null;
};

type NsPortalSlotData = {
  rank?: number;
  productName?: string;
  channelProductId?: string | number;
  originalMallProductId?: string | number;
  productId?: string | number;
  nvMid?: string | number;
  productUrl?: NsPortalProductUrl | null;
  productClickUrl?: NsPortalProductUrl | null;
};

type NsPortalSlot = {
  slotType?: string;
  data?: NsPortalSlotData;
};

type NsPortalPage = {
  page?: number;
  pageSize?: number;
  slots?: NsPortalSlot[];
};

type NsPortalResponse = {
  hasMore?: boolean;
  cursor?: string | null;
  nextCursor?: string | null;
  page?: number;
  pageSize?: number;
  total?: number;
  totalCount?: number;
  data?: NsPortalPage[];
};

export class NaverShoppingNextDataHttpError extends Error {
  status: number;
  requestUrl: string;
  responsePreview: string;

  constructor(message: string, status: number, requestUrl: string, responsePreview: string) {
    super(message);
    this.status = status;
    this.requestUrl = requestUrl;
    this.responsePreview = responsePreview;
  }
}

type RankResult = {
  source: "PLUS_STORE_ORGANIC_NS_PORTAL";
  rank: number | null;
  pageNum: number | null;
  position: number | null;
  rankLabel: string;
  notFound: boolean;
  requestUrl: string;
  responseStatus: number;
  responsePreview: string;
  parserSource: "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";
  totalProductCount: number;
  matchedProductNo: string | null;
  matchedName: string | null;
};

type ParsedRow = {
  rank: number | null;
  ids: Set<string>;
  productIdForLog: string | null;
  productName: string | null;
};

type RequestVariant = {
  page: number;
  cursor: string | null;
  params: Record<string, string>;
};

const NS_PORTAL_URL = "https://ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";
const PARSER_SOURCE = "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";

export async function findProductRankViaNaverShoppingNextData({
  keyword,
  targetProductId,
  targetProductUrl = null,
  pageSize = 40,
}: {
  keyword: string;
  targetProductId: string;
  targetProductUrl?: string | null;
  pageSize?: number;
}): Promise<RankResult> {
  const kw = String(keyword ?? "").trim();
  const normalizedTargetProductId = String(targetProductId ?? "").trim();
  if (!kw) throw new Error("검색 키워드가 비어 있습니다.");
  if (!normalizedTargetProductId) throw new Error("상품 ID가 비어 있습니다.");

  const size = Math.max(8, Math.min(40, Number(pageSize) || 40));
  const maxRankScan = 100;
  const maxPage = 8;
  const targetIdFromUrl = extractProductIdFromUrl(targetProductUrl);
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: `https://search.shopping.naver.com/ns/search?query=${encodeURIComponent(kw)}`,
    Origin: "https://search.shopping.naver.com",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  const dedupedRows: ParsedRow[] = [];
  const dedupedByProductId = new Map<string, ParsedRow>();
  const testedRequestUrls = new Set<string>();
  let successfulFetchCount = 0;
  let accumulatedCount = 0;
  let lastError:
    | {
        message: string;
        status: number;
        requestUrl: string;
        responsePreview: string;
      }
    | null = null;
  let lastResponseStatus = 0;
  let lastResponsePreview = "";
  let lastRequestUrl = `${NS_PORTAL_URL}?query=${encodeURIComponent(kw)}&source=shp_gui`;
  let lastPayloadMeta: {
    hasMore: boolean | null;
    cursor: string | null;
    nextCursor: string | null;
    page: number | null;
    pageSize: number | null;
    total: number | null;
    totalCount: number | null;
  } = {
    hasMore: null,
    cursor: null,
    nextCursor: null,
    page: null,
    pageSize: null,
    total: null,
    totalCount: null,
  };

  for (let page = 1; page <= maxPage; page++) {
    const requestVariants = buildRequestVariants(page, size, lastPayloadMeta.nextCursor);
    let newRowsInThisPage = 0;

    for (const variant of requestVariants) {
      const requestUrl = buildRequestUrl(kw, variant.params);
      if (testedRequestUrls.has(requestUrl)) continue;
      testedRequestUrls.add(requestUrl);

      const res = await fetch(requestUrl, { headers, cache: "no-store" });
      const rawText = await res.text();
      const responsePreview = rawText.slice(0, 220);
      lastResponseStatus = res.status;
      lastResponsePreview = responsePreview;
      lastRequestUrl = requestUrl;

      if (!res.ok) {
        lastError = {
          message: `Naver NS Portal Error: ${res.status}`,
          status: res.status,
          requestUrl,
          responsePreview,
        };
        console.warn("[plus-store-rank:request-failed]", {
          requestUrl,
          page: variant.page,
          cursor: variant.cursor,
          responseStatus: res.status,
        });
        continue;
      }

      let payload: NsPortalResponse;
      try {
        payload = JSON.parse(rawText) as NsPortalResponse;
      } catch {
        lastError = {
          message: "Naver NS Portal JSON parse failed",
          status: res.status,
          requestUrl,
          responsePreview,
        };
        console.warn("[plus-store-rank:parse-failed]", {
          requestUrl,
          page: variant.page,
          cursor: variant.cursor,
          responseStatus: res.status,
        });
        continue;
      }

      successfulFetchCount += 1;
      lastPayloadMeta = {
        hasMore: typeof payload.hasMore === "boolean" ? payload.hasMore : null,
        cursor: typeof payload.cursor === "string" ? payload.cursor : null,
        nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
        page: typeof payload.page === "number" ? payload.page : null,
        pageSize: typeof payload.pageSize === "number" ? payload.pageSize : null,
        total: typeof payload.total === "number" ? payload.total : null,
        totalCount: typeof payload.totalCount === "number" ? payload.totalCount : null,
      };

      const rows = extractRowsFromNsPortal(payload);
      const slotsCount = rows.length;
      accumulatedCount += rows.length;
      const addedCount = appendRowsWithDedupe(rows, dedupedRows, dedupedByProductId);
      newRowsInThisPage += addedCount;

      const matchedRow = findMatchedRow(
        dedupedRows,
        normalizedTargetProductId,
        targetIdFromUrl
      );
      const matchedRank = matchedRow ? resolveRowRank(matchedRow, dedupedRows) : null;

      console.log("[plus-store-rank:page-scan]", {
        requestUrl,
        page: variant.page,
        cursor: variant.cursor,
        responseStatus: res.status,
        slotsCount,
        accumulatedCount,
        dedupedCount: dedupedRows.length,
        matchedRank,
        matchedProductId: matchedRow?.productIdForLog ?? null,
        hasMore: lastPayloadMeta.hasMore,
        nextCursor: lastPayloadMeta.nextCursor,
        responsePage: lastPayloadMeta.page,
        responsePageSize: lastPayloadMeta.pageSize,
        responseTotal: lastPayloadMeta.total,
        responseTotalCount: lastPayloadMeta.totalCount,
      });

      if (matchedRank && matchedRank <= maxRankScan) {
        const pageNum = Math.floor((matchedRank - 1) / size) + 1;
        const position = ((matchedRank - 1) % size) + 1;
        return {
          source: "PLUS_STORE_ORGANIC_NS_PORTAL",
          rank: matchedRank,
          pageNum,
          position,
          rankLabel: `${matchedRank}위`,
          notFound: false,
          requestUrl,
          responseStatus: res.status,
          responsePreview,
          parserSource: PARSER_SOURCE,
          totalProductCount: dedupedRows.length,
          matchedProductNo: matchedRow?.productIdForLog ?? null,
          matchedName: matchedRow?.productName ?? null,
        };
      }
    }

    if (dedupedRows.length >= maxRankScan) break;
    if (newRowsInThisPage === 0) break;
  }

  if (successfulFetchCount === 0 && lastError) {
    throw new NaverShoppingNextDataHttpError(
      lastError.message,
      lastError.status,
      lastError.requestUrl,
      lastError.responsePreview
    );
  }

  return {
    source: "PLUS_STORE_ORGANIC_NS_PORTAL",
    rank: null,
    pageNum: null,
    position: null,
    rankLabel: "100위 밖",
    notFound: true,
    requestUrl: lastRequestUrl,
    responseStatus: lastResponseStatus,
    responsePreview: lastResponsePreview,
    parserSource: PARSER_SOURCE,
    totalProductCount: dedupedRows.length,
    matchedProductNo: null,
    matchedName: null,
  };
}

function extractRowsFromNsPortal(payload: NsPortalResponse): ParsedRow[] {
  const slots = (payload.data ?? []).flatMap((page) => page.slots ?? []);
  const rows: ParsedRow[] = [];

  for (const slot of slots) {
    const data = slot?.data;
    if (!data) continue;

    const rank = Number(data.rank);
    const normalizedRank = Number.isFinite(rank) && rank > 0 ? rank : null;

    const ids = collectCandidateIds(data);
    if (ids.size === 0) continue;

    rows.push({
      rank: normalizedRank,
      ids,
      productIdForLog: firstSetValue(ids),
      productName: sanitizeProductName(data.productName),
    });
  }

  return rows;
}

function collectCandidateIds(data: NsPortalSlotData): Set<string> {
  const ids = new Set<string>();
  const directCandidates = [
    data.channelProductId,
    data.originalMallProductId,
    data.productId,
    data.nvMid,
  ];
  for (const candidate of directCandidates) {
    const v = String(candidate ?? "").trim();
    if (v) ids.add(v);
  }

  const urlCandidates = [
    data.productUrl?.pcUrl,
    data.productUrl?.mobileUrl,
    data.productClickUrl?.pcUrl,
    data.productClickUrl?.mobileUrl,
  ];
  for (const url of urlCandidates) {
    const extracted = extractProductIdFromUrl(url ?? null);
    if (extracted) ids.add(extracted);
  }
  return ids;
}

function extractProductIdFromUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    const productPathMatch = url.pathname.match(/\/products\/(\d+)/);
    if (productPathMatch?.[1]) return productPathMatch[1];
    const qProductId = url.searchParams.get("productId");
    if (qProductId?.trim()) return qProductId.trim();
    return null;
  } catch {
    const productPathMatch = input.match(/\/products\/(\d+)/);
    if (productPathMatch?.[1]) return productPathMatch[1];
    const qProductId = input.match(/[?&]productId=(\d+)/);
    if (qProductId?.[1]) return qProductId[1];
    return null;
  }
}

function sanitizeProductName(name?: string): string | null {
  if (!name) return null;
  const stripped = name.replace(/<[^>]+>/g, "").trim();
  return stripped || null;
}

function firstSetValue(values: Set<string>): string | null {
  for (const value of values) return value;
  return null;
}

function buildRequestVariants(
  page: number,
  pageSize: number,
  nextCursor: string | null
): RequestVariant[] {
  const variants: RequestVariant[] = [];
  const offset = (page - 1) * pageSize;
  const start = offset + 1;

  variants.push({
    page,
    cursor: null,
    params: { source: "shp_gui", page: String(page), pageSize: String(pageSize) },
  });
  variants.push({
    page,
    cursor: null,
    params: { source: "shp_gui", page: String(page), limit: String(pageSize) },
  });
  variants.push({
    page,
    cursor: null,
    params: {
      source: "shp_gui",
      pagingIndex: String(page),
      pagingSize: String(pageSize),
    },
  });
  variants.push({
    page,
    cursor: null,
    params: { source: "shp_gui", offset: String(offset), limit: String(pageSize) },
  });
  variants.push({
    page,
    cursor: null,
    params: { source: "shp_gui", start: String(start), display: String(pageSize) },
  });

  if (nextCursor) {
    variants.push({
      page,
      cursor: nextCursor,
      params: { source: "shp_gui", cursor: nextCursor, pageSize: String(pageSize) },
    });
  }
  return variants;
}

function buildRequestUrl(keyword: string, params: Record<string, string>): string {
  const url = new URL(NS_PORTAL_URL);
  url.searchParams.set("query", keyword);
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    url.searchParams.set(k, v);
  }
  return url.toString();
}

function appendRowsWithDedupe(
  rows: ParsedRow[],
  dedupedRows: ParsedRow[],
  dedupedByProductId: Map<string, ParsedRow>
): number {
  let added = 0;
  for (const row of rows) {
    const productId = row.productIdForLog;
    if (!productId) continue;
    if (dedupedByProductId.has(productId)) continue;
    dedupedByProductId.set(productId, row);
    dedupedRows.push(row);
    added += 1;
  }
  return added;
}

function findMatchedRow(
  rows: ParsedRow[],
  targetProductId: string,
  targetIdFromUrl: string | null
): ParsedRow | null {
  for (const row of rows) {
    if (row.ids.has(targetProductId)) return row;
    if (targetIdFromUrl && row.ids.has(targetIdFromUrl)) return row;
  }
  return null;
}

function resolveRowRank(row: ParsedRow, rows: ParsedRow[]): number | null {
  if (row.rank && Number.isFinite(row.rank) && row.rank > 0) return row.rank;
  const index = rows.indexOf(row);
  if (index < 0) return null;
  return index + 1;
}