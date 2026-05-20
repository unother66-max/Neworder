import {
  getKeywordSearchVolume,
  keywordToolRowMonthlyTotal,
  normalizeVolumeKeywordInput,
  type KeywordToolItem,
} from "@/lib/getKeywordSearchVolume";

const SHOP_API = "https://openapi.naver.com/v1/search/shop.json";
const DETAIL_RELATED_LIMIT = 6;
export const SMARTSTORE_KEYWORD_ANALYZE_LIMIT = 20;
const DEFAULT_LIMIT = SMARTSTORE_KEYWORD_ANALYZE_LIMIT;
const MAX_LIMIT = SMARTSTORE_KEYWORD_ANALYZE_LIMIT;
const PRODUCT_COUNT_LOOKUP_LIMIT = 20;
const PRODUCT_COUNT_WARNING =
  "네이버 쇼핑 상품량 조회가 잠시 제한되어 검색량 중심으로 표시했습니다.";

export type RelatedKeywordAnalyzeItem = {
  keyword: string;
  monthlySearchVolume: number;
  productCount: number | null;
};

export type KeywordAnalyzeItem = {
  keyword: string;
  monthlySearchVolume: number;
  mobileSearchVolume: number;
  pcSearchVolume: number;
  productCount: number | null;
  competitionRate: number | null;
  category: string | null;
  relatedKeywords: RelatedKeywordAnalyzeItem[];
};

export type KeywordAnalyzeDetail = {
  keyword: string;
  summary: {
    monthlySearchVolume: number;
    mobileSearchVolume: number;
    pcSearchVolume: number;
    productCount: number | null;
    competitionRate: number | null;
  };
  relatedKeywords: RelatedKeywordAnalyzeItem[];
  warning?: string;
};

type KeywordAnalyzeResult = {
  keyword: string;
  summary: KeywordAnalyzeDetail["summary"];
  items: KeywordAnalyzeItem[];
  warning?: string;
};

type ProductCountLookupState = {
  stopped: boolean;
  warning: boolean;
  requestedCount: number;
  maxRequests: number;
};

type ShopJsonResponse = {
  total?: number;
  errorMessage?: string;
};

const productCountCache = new Map<string, number>();

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되어 있지 않습니다.");
  }
  return { clientId, clientSecret };
}

function parseQcCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (/^<\s*10$/i.test(cleaned)) return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

function normalizeRelatedKey(value: string): string {
  return normalizeVolumeKeywordInput(value).replace(/\s+/g, "").toLowerCase();
}

function competitionRate(
  productCount: number | null,
  monthlySearchVolume: number
): number | null {
  if (productCount == null || monthlySearchVolume <= 0) return null;
  return Number((productCount / monthlySearchVolume).toFixed(2));
}

function createProductCountLookupState(): ProductCountLookupState {
  return {
    stopped: false,
    warning: false,
    requestedCount: 0,
    maxRequests: PRODUCT_COUNT_LOOKUP_LIMIT,
  };
}

async function fetchShoppingProductTotal(
  keyword: string,
  state: ProductCountLookupState
): Promise<number | null> {
  const cacheKey = normalizeRelatedKey(keyword);
  if (!cacheKey || state.stopped || state.requestedCount >= state.maxRequests) {
    return null;
  }
  const cached = productCountCache.get(cacheKey);
  if (cached !== undefined) return cached;

  state.requestedCount += 1;
  const { clientId, clientSecret } = getClientCreds();
  const url = new URL(SHOP_API);
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", "1");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    console.warn("[smartstore-keyword-analyze] shopping product count 429", {
      keyword,
      requestedCount: state.requestedCount,
    });
    state.stopped = true;
    state.warning = true;
    return null;
  }

  const raw = await res.text();
  let data: ShopJsonResponse;
  try {
    data = JSON.parse(raw) as ShopJsonResponse;
  } catch {
    state.warning = true;
    return null;
  }

  if (!res.ok) {
    console.warn("[smartstore-keyword-analyze] shopping product count failed", {
      keyword,
      status: res.status,
      message: typeof data.errorMessage === "string" ? data.errorMessage : raw.slice(0, 120),
    });
    state.warning = true;
    return null;
  }

  const value = Math.max(0, Math.floor(Number(data.total ?? 0)));
  productCountCache.set(cacheKey, value);
  return value;
}

function relatedRowsFromVolume(
  keyword: string,
  rows: KeywordToolItem[] | undefined,
  limit: number
): KeywordToolItem[] {
  const targetKey = normalizeRelatedKey(keyword);
  const seen = new Set<string>();
  const out: KeywordToolItem[] = [];

  for (const row of rows ?? []) {
    const rel = normalizeVolumeKeywordInput(row.relKeyword ?? "");
    const key = normalizeRelatedKey(rel);
    if (!rel || !key || key === targetKey || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out
    .sort((a, b) => keywordToolRowMonthlyTotal(b) - keywordToolRowMonthlyTotal(a))
    .slice(0, limit);
}

async function buildRelatedKeywords(
  keyword: string,
  rows: KeywordToolItem[] | undefined,
  state: ProductCountLookupState,
  options: { fetchProductCounts?: boolean } = {}
): Promise<RelatedKeywordAnalyzeItem[]> {
  const relatedRows = relatedRowsFromVolume(keyword, rows, DETAIL_RELATED_LIMIT);
  const out: RelatedKeywordAnalyzeItem[] = [];
  const shouldFetchProductCounts = options.fetchProductCounts !== false;

  for (const row of relatedRows) {
    const relKeyword = normalizeVolumeKeywordInput(row.relKeyword ?? "");
    if (!relKeyword) continue;
    const monthlySearchVolume = keywordToolRowMonthlyTotal(row);
    const productCount = shouldFetchProductCounts
      ? await fetchShoppingProductTotal(relKeyword, state)
      : null;
    out.push({ keyword: relKeyword, monthlySearchVolume, productCount });
  }

  return out;
}

async function itemFromKeywordToolRow(
  row: KeywordToolItem,
  state: ProductCountLookupState
): Promise<KeywordAnalyzeItem | null> {
  const keyword = normalizeVolumeKeywordInput(row.relKeyword ?? "");
  if (!keyword) return null;
  const pcSearchVolume = parseQcCount(row.monthlyPcQcCnt);
  const mobileSearchVolume = parseQcCount(row.monthlyMobileQcCnt);
  let monthlySearchVolume = pcSearchVolume + mobileSearchVolume;
  if (monthlySearchVolume <= 0 && keywordToolRowMonthlyTotal(row) > 0) {
    monthlySearchVolume = keywordToolRowMonthlyTotal(row);
  }
  const productCount = await fetchShoppingProductTotal(keyword, state);
  return {
    keyword,
    monthlySearchVolume,
    mobileSearchVolume,
    pcSearchVolume,
    productCount,
    competitionRate: competitionRate(productCount, monthlySearchVolume),
    category: null,
    relatedKeywords: [],
  };
}

async function analyzeOneKeyword(
  keyword: string,
  state: ProductCountLookupState,
  options: { fetchRelatedProductCounts?: boolean } = {}
): Promise<KeywordAnalyzeItem> {
  const volume = await getKeywordSearchVolume(keyword);
  const productCount = await fetchShoppingProductTotal(keyword, state);
  const relatedKeywords = await buildRelatedKeywords(keyword, volume.keywordList, state, {
    fetchProductCounts: options.fetchRelatedProductCounts !== false,
  });

  return {
    keyword,
    monthlySearchVolume: volume.total,
    mobileSearchVolume: volume.mobile,
    pcSearchVolume: volume.pc,
    productCount,
    competitionRate: competitionRate(productCount, volume.total),
    category: null,
    relatedKeywords,
  };
}

export async function analyzeSmartstoreKeyword(input: {
  keyword: string;
  limit?: number;
}): Promise<KeywordAnalyzeResult> {
  const keyword = normalizeVolumeKeywordInput(input.keyword);
  if (!keyword) throw new Error("분석할 상품 키워드를 입력해 주세요.");
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);

  const state = createProductCountLookupState();
  const main = await analyzeOneKeyword(keyword, state, { fetchRelatedProductCounts: true });
  const items: KeywordAnalyzeItem[] = [main];

  const relatedRows = relatedRowsFromVolume(keyword, (await getKeywordSearchVolume(keyword)).keywordList, limit - 1);
  for (const row of relatedRows) {
    const item = await itemFromKeywordToolRow(row, state);
    if (item) items.push(item);
    if (items.length >= limit) break;
  }

  return {
    keyword,
    summary: {
      monthlySearchVolume: main.monthlySearchVolume,
      mobileSearchVolume: main.mobileSearchVolume,
      pcSearchVolume: main.pcSearchVolume,
      productCount: main.productCount,
      competitionRate: main.competitionRate,
    },
    items,
    warning: state.warning ? PRODUCT_COUNT_WARNING : undefined,
  };
}

export async function analyzeSmartstoreKeywordDetail(input: {
  keyword: string;
}): Promise<KeywordAnalyzeDetail> {
  const keyword = normalizeVolumeKeywordInput(input.keyword);
  if (!keyword) throw new Error("분석할 상품 키워드를 입력해 주세요.");

  const state = createProductCountLookupState();
  const item = await analyzeOneKeyword(keyword, state, { fetchRelatedProductCounts: true });
  return {
    keyword,
    summary: {
      monthlySearchVolume: item.monthlySearchVolume,
      mobileSearchVolume: item.mobileSearchVolume,
      pcSearchVolume: item.pcSearchVolume,
      productCount: item.productCount,
      competitionRate: item.competitionRate,
    },
    relatedKeywords: item.relatedKeywords,
    warning: state.warning ? PRODUCT_COUNT_WARNING : undefined,
  };
}
