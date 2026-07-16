type NsPortalProductUrl = {
  pcUrl?: string | null;
  mobileUrl?: string | null;
};

export type NsPortalSlotData = {
  rank?: number;
  productName?: string;
  channelProductId?: string | number;
  originalMallProductId?: string | number;
  productId?: string | number;
  nvMid?: string | number;
  productUrl?: NsPortalProductUrl | null;
  productClickUrl?: NsPortalProductUrl | null;
  cardType?: string | null;
  sourceType?: string | null;
  promotionTypes?: string[] | null;
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

export type NsPortalResponse = {
  data?: NsPortalPage[];
};

export class NaverShoppingNextDataHttpError extends Error {
  status: number;
  requestUrl: string;
  responsePreview: string;
  reason: "HTTP_FAILED" | "PARSE_FAILED" | "EMPTY_RESPONSE";

  constructor(
    message: string,
    status: number,
    requestUrl: string,
    responsePreview: string,
    reason: "HTTP_FAILED" | "PARSE_FAILED" | "EMPTY_RESPONSE" = "HTTP_FAILED"
  ) {
    super(message);
    this.status = status;
    this.requestUrl = requestUrl;
    this.responsePreview = responsePreview;
    this.reason = reason;
  }
}

export type PlusStoreRankDiagnostics = {
  keyword: string;
  productName: string | null;
  storedProductId: string;
  storedChannelProductId: string | null;
  storedMallProductId: string | null;
  matchedProductId: string | null;
  matchedChannelProductId: string | null;
  matchedMallProductId: string | null;
  productType: "plus-store";
  ranking: number | null;
  page: number | null;
  indexInPage: number | null;
  searchApiSource: "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";
  totalFetchedCount: number;
  dedupedCount: number;
  isMatched: boolean;
  reason:
    | "FOUND"
    | "OUT_OF_RANGE_100"
    | "OUT_OF_RANGE_200"
    | "NOT_FOUND_IN_FETCHED_RESULTS";
  debugReason: string | null;
};

export type PlusStoreRankResult = {
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
  diagnostics: PlusStoreRankDiagnostics;
};

type ParsedRow = {
  rank: number | null;
  ids: Set<string>;
  channelProductId: string | null;
  mallProductId: string | null;
  productId: string | null;
  nvMid: string | null;
  productName: string | null;
  responsePage: number;
  indexInPage: number;
};

const NS_PORTAL_URL = "https://ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";
const PARSER_SOURCE = "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot" as const;

export async function findProductRankViaNaverShoppingNextData({
  keyword,
  targetProductId,
  targetProductUrl = null,
  targetProductName = null,
  targetChannelProductId = null,
  targetMallProductId = null,
  pageSize = 40,
}: {
  keyword: string;
  targetProductId: string;
  targetProductUrl?: string | null;
  targetProductName?: string | null;
  targetChannelProductId?: string | null;
  targetMallProductId?: string | null;
  pageSize?: number;
}): Promise<PlusStoreRankResult> {
  const kw = String(keyword ?? "").trim();
  const storedProductId = String(targetProductId ?? "").trim();
  if (!kw) throw new Error("검색 키워드가 비어 있습니다.");
  if (!storedProductId) throw new Error("상품 ID가 비어 있습니다.");

  const size = Math.max(8, Math.min(40, Number(pageSize) || 40));
  const targetIdFromUrl = extractProductIdFromUrl(targetProductUrl);
  const storedChannelProductId = normalizeId(
    targetChannelProductId ?? targetIdFromUrl ?? storedProductId
  );
  const storedMallProductId = normalizeId(targetMallProductId);
  const targetIds = new Set(
    [storedProductId, storedChannelProductId, storedMallProductId, targetIdFromUrl]
      .map(normalizeId)
      .filter((value): value is string => Boolean(value))
  );

  const requestUrl = buildRequestUrl(kw, size);
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

  const res = await fetch(requestUrl, { headers, cache: "no-store" });
  const rawText = await res.text();
  const responsePreview = rawText.slice(0, 220);
  if (!res.ok) {
    throw new NaverShoppingNextDataHttpError(
      `Naver NS Portal Error: ${res.status}`,
      res.status,
      requestUrl,
      responsePreview,
      "HTTP_FAILED"
    );
  }

  let payload: NsPortalResponse;
  try {
    payload = JSON.parse(rawText) as NsPortalResponse;
  } catch {
    throw new NaverShoppingNextDataHttpError(
      "Naver NS Portal JSON parse failed",
      res.status,
      requestUrl,
      responsePreview,
      "PARSE_FAILED"
    );
  }

  const parsed = parseOrganicNsPortalRows(payload);
  if (parsed.totalFetchedCount === 0) {
    throw new NaverShoppingNextDataHttpError(
      "Naver NS Portal returned no product slots",
      res.status,
      requestUrl,
      responsePreview,
      "EMPTY_RESPONSE"
    );
  }

  const matchedRow = parsed.rows.find((row) => setsOverlap(row.ids, targetIds)) ?? null;
  const matchedRank = matchedRow
    ? matchedRow.rank ?? parsed.rows.indexOf(matchedRow) + 1
    : null;
  const notFoundReason = resolveNotFoundReason(parsed.rows.length);
  const diagnostics: PlusStoreRankDiagnostics = {
    keyword: kw,
    productName: targetProductName?.trim() || null,
    storedProductId,
    storedChannelProductId,
    storedMallProductId,
    matchedProductId: matchedRow ? preferredMatchedId(matchedRow, targetIds) : null,
    matchedChannelProductId: matchedRow?.channelProductId ?? null,
    matchedMallProductId: matchedRow?.mallProductId ?? null,
    productType: "plus-store",
    ranking: matchedRank,
    page: matchedRow?.responsePage ?? null,
    indexInPage: matchedRow?.indexInPage ?? null,
    searchApiSource: PARSER_SOURCE,
    totalFetchedCount: parsed.totalFetchedCount,
    dedupedCount: parsed.rows.length,
    isMatched: Boolean(matchedRow && matchedRank),
    reason: matchedRow ? "FOUND" : notFoundReason,
    debugReason: matchedRow
      ? null
      : `target identifiers not found in ${parsed.rows.length} organic results; deeper pagination unsupported by this endpoint`,
  };

  console.log("[plus-store-rank:diagnostic]", diagnostics);

  if (matchedRow && matchedRank) {
    return {
      source: "PLUS_STORE_ORGANIC_NS_PORTAL",
      rank: matchedRank,
      pageNum: matchedRow.responsePage,
      position: matchedRow.indexInPage,
      rankLabel: `${matchedRank}위`,
      notFound: false,
      requestUrl,
      responseStatus: res.status,
      responsePreview,
      parserSource: PARSER_SOURCE,
      totalProductCount: parsed.rows.length,
      matchedProductNo: preferredMatchedId(matchedRow, targetIds),
      matchedName: matchedRow.productName,
      diagnostics,
    };
  }

  return {
    source: "PLUS_STORE_ORGANIC_NS_PORTAL",
    rank: null,
    pageNum: null,
    position: null,
    rankLabel:
      notFoundReason === "OUT_OF_RANGE_200"
        ? "200위 밖"
        : notFoundReason === "OUT_OF_RANGE_100"
          ? "100위 밖"
          : `${parsed.rows.length}개 확인 / 미발견`,
    notFound: true,
    requestUrl,
    responseStatus: res.status,
    responsePreview,
    parserSource: PARSER_SOURCE,
    totalProductCount: parsed.rows.length,
    matchedProductNo: null,
    matchedName: null,
    diagnostics,
  };
}

export function parseOrganicNsPortalRows(payload: NsPortalResponse): {
  rows: ParsedRow[];
  totalFetchedCount: number;
} {
  const rawRows: ParsedRow[] = [];
  let totalFetchedCount = 0;

  for (const [pageIndex, page] of (payload.data ?? []).entries()) {
    let organicIndex = 0;
    for (const slot of page.slots ?? []) {
      const data = slot?.data;
      if (!data) continue;
      totalFetchedCount += 1;
      if (!isOrganicCard(data)) continue;

      const ids = collectCandidateIds(data);
      if (ids.size === 0) continue;
      organicIndex += 1;
      const rank = Number(data.rank);
      rawRows.push({
        rank: Number.isFinite(rank) && rank > 0 ? rank : null,
        ids,
        channelProductId: normalizeId(data.channelProductId),
        mallProductId: normalizeId(data.originalMallProductId),
        productId: normalizeId(data.productId),
        nvMid: normalizeId(data.nvMid),
        productName: sanitizeProductName(data.productName),
        responsePage:
          typeof page.page === "number" && page.page > 0 ? page.page : pageIndex + 1,
        indexInPage: organicIndex,
      });
    }
  }

  return { rows: dedupeRowsByAnyIdentifier(rawRows), totalFetchedCount };
}

function isOrganicCard(data: NsPortalSlotData): boolean {
  if (data.cardType) return data.cardType === "ORGANIC_CARD";
  if (data.sourceType) return data.sourceType === "SAS";
  return !(data.promotionTypes?.length);
}

function collectCandidateIds(data: NsPortalSlotData): Set<string> {
  const ids = new Set<string>();
  for (const candidate of [
    data.channelProductId,
    data.originalMallProductId,
    data.productId,
    data.nvMid,
  ]) {
    const id = normalizeId(candidate);
    if (id) ids.add(id);
  }
  for (const url of [
    data.productUrl?.pcUrl,
    data.productUrl?.mobileUrl,
    data.productClickUrl?.pcUrl,
    data.productClickUrl?.mobileUrl,
  ]) {
    const id = extractProductIdFromUrl(url ?? null);
    if (id) ids.add(id);
  }
  return ids;
}

function dedupeRowsByAnyIdentifier(rows: ParsedRow[]): ParsedRow[] {
  const deduped: ParsedRow[] = [];
  for (const row of rows) {
    const existing = deduped.find((candidate) => setsOverlap(candidate.ids, row.ids));
    if (!existing) {
      deduped.push(row);
      continue;
    }
    for (const id of row.ids) existing.ids.add(id);
  }
  return deduped;
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function preferredMatchedId(row: ParsedRow, targetIds: Set<string>): string | null {
  for (const id of row.ids) if (targetIds.has(id)) return id;
  return row.channelProductId ?? row.mallProductId ?? row.productId ?? row.nvMid;
}

function resolveNotFoundReason(
  checkedCount: number
): "OUT_OF_RANGE_100" | "OUT_OF_RANGE_200" | "NOT_FOUND_IN_FETCHED_RESULTS" {
  if (checkedCount >= 200) return "OUT_OF_RANGE_200";
  if (checkedCount >= 100) return "OUT_OF_RANGE_100";
  return "NOT_FOUND_IN_FETCHED_RESULTS";
}

function extractProductIdFromUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    const productPathMatch = url.pathname.match(/\/products\/(\d+)/);
    if (productPathMatch?.[1]) return productPathMatch[1];
    return normalizeId(url.searchParams.get("productId"));
  } catch {
    const productPathMatch = input.match(/\/products\/(\d+)/);
    if (productPathMatch?.[1]) return productPathMatch[1];
    return input.match(/[?&]productId=(\d+)/)?.[1] ?? null;
  }
}

function normalizeId(input: unknown): string | null {
  const value = String(input ?? "").trim();
  return value || null;
}

function sanitizeProductName(name?: string): string | null {
  if (!name) return null;
  const stripped = name.replace(/<[^>]+>/g, "").trim();
  return stripped || null;
}

function buildRequestUrl(keyword: string, pageSize: number): string {
  const url = new URL(NS_PORTAL_URL);
  url.searchParams.set("query", keyword);
  url.searchParams.set("source", "shp_gui");
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", String(pageSize));
  return url.toString();
}
