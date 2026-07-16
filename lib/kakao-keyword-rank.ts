export type KakaoKeywordDocument = {
  id?: string | number;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  place_url?: string;
};

type KakaoKeywordResponse = {
  documents?: KakaoKeywordDocument[];
  meta?: {
    is_end?: boolean;
    pageable_count?: number;
    total_count?: number;
  };
};

export type KakaoKeywordRankStatus =
  | "FOUND"
  | "OUT_OF_RANGE_45"
  | "NOT_FOUND_IN_FETCHED_RESULTS";

export type KakaoKeywordRankResult = {
  source: "KAKAO_LOCAL_KEYWORD";
  keyword: string;
  targetPlaceName: string;
  targetAddress: string;
  storedKakaoPlaceId: string | null;
  storedPlaceUrl: string | null;
  matchedKakaoPlaceId: string | null;
  matchedPlaceName: string | null;
  matchedAddress: string | null;
  ranking: number | null;
  page: number | null;
  position: number | null;
  totalFetchedCount: number;
  dedupedCount: number;
  checkedCount: number;
  isMatched: boolean;
  reason: KakaoKeywordRankStatus;
  debugReason: string | null;
};

export type KakaoKeywordRankFailureReason =
  | "MISSING_API_KEY"
  | "HTTP_FAILED"
  | "NETWORK_FAILED"
  | "PARSE_FAILED"
  | "EMPTY_RESPONSE";

export class KakaoKeywordRankError extends Error {
  reason: KakaoKeywordRankFailureReason;
  httpStatus: number | null;
  page: number | null;

  constructor(
    reason: KakaoKeywordRankFailureReason,
    message: string,
    options?: { httpStatus?: number | null; page?: number | null }
  ) {
    super(message);
    this.reason = reason;
    this.httpStatus = options?.httpStatus ?? null;
    this.page = options?.page ?? null;
  }
}

type IndexedDocument = {
  document: KakaoKeywordDocument;
  id: string | null;
  page: number;
  position: number;
};

const KAKAO_KEYWORD_API =
  "https://dapi.kakao.com/v2/local/search/keyword.json";
const PAGE_SIZE = 15;
const MAX_PAGES = 3;
const MAX_CHECKED_COUNT = PAGE_SIZE * MAX_PAGES;

export function extractKakaoPlaceId(placeUrl: string | null | undefined): string | null {
  const match = String(placeUrl ?? "").match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export async function fetchKakaoKeywordRankDiagnostic(params: {
  keyword: string;
  targetPlaceName: string;
  targetAddress?: string | null;
  storedKakaoPlaceId?: string | null;
  storedPlaceUrl?: string | null;
  apiKey?: string | null;
}): Promise<KakaoKeywordRankResult> {
  const keyword = normalizeDisplayText(params.keyword);
  const targetPlaceName = normalizeDisplayText(params.targetPlaceName);
  const targetAddress = normalizeDisplayText(params.targetAddress ?? "");
  const storedPlaceUrl = normalizeDisplayText(params.storedPlaceUrl ?? "") || null;
  const storedKakaoPlaceId =
    normalizeId(params.storedKakaoPlaceId) ?? extractKakaoPlaceId(storedPlaceUrl);
  const apiKey = params.apiKey?.trim() || process.env.KAKAO_REST_API_KEY?.trim();

  if (!keyword) throw new Error("검색 키워드가 비어 있습니다.");
  if (!targetPlaceName) throw new Error("대상 매장명이 비어 있습니다.");
  if (!apiKey) {
    throw new KakaoKeywordRankError(
      "MISSING_API_KEY",
      "KAKAO_REST_API_KEY가 설정되지 않았습니다."
    );
  }

  const deduped = new Map<string, IndexedDocument>();
  let totalFetchedCount = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(KAKAO_KEYWORD_API);
    url.searchParams.set("query", keyword);
    url.searchParams.set("size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        cache: "no-store",
      });
    } catch (error) {
      throw new KakaoKeywordRankError(
        "NETWORK_FAILED",
        error instanceof Error ? error.message : "카카오 장소 검색 네트워크 오류",
        { page }
      );
    }

    const rawText = await response.text();
    if (!response.ok) {
      throw new KakaoKeywordRankError(
        "HTTP_FAILED",
        `카카오 장소 검색 API HTTP ${response.status}`,
        { httpStatus: response.status, page }
      );
    }

    let payload: KakaoKeywordResponse;
    try {
      payload = JSON.parse(rawText) as KakaoKeywordResponse;
    } catch {
      throw new KakaoKeywordRankError(
        "PARSE_FAILED",
        "카카오 장소 검색 응답 JSON 파싱 실패",
        { httpStatus: response.status, page }
      );
    }

    if (!Array.isArray(payload.documents)) {
      throw new KakaoKeywordRankError(
        "PARSE_FAILED",
        "카카오 장소 검색 응답에 documents 배열이 없습니다.",
        { httpStatus: response.status, page }
      );
    }
    if (payload.documents.length === 0) {
      throw new KakaoKeywordRankError(
        "EMPTY_RESPONSE",
        "카카오 장소 검색 결과가 비어 있습니다.",
        { httpStatus: response.status, page }
      );
    }

    totalFetchedCount += payload.documents.length;
    for (const [index, document] of payload.documents.entries()) {
      const id = normalizeId(document.id);
      const fallbackKey = buildNameAddressKey(document);
      const key = id ? `id:${id}` : fallbackKey ? `name-address:${fallbackKey}` : null;
      if (!key || deduped.has(key)) continue;
      deduped.set(key, { document, id, page, position: index + 1 });
    }

    const rows = Array.from(deduped.values());
    const matched = findMatchedKakaoDocument(rows, {
      storedKakaoPlaceId,
      targetPlaceName,
      targetAddress,
    });
    if (matched) {
      const result = buildResult({
        keyword,
        targetPlaceName,
        targetAddress,
        storedKakaoPlaceId,
        storedPlaceUrl,
        matched,
        rows,
        totalFetchedCount,
        reason: "FOUND",
      });
      console.log("[kakao-keyword-rank diagnostic]", result);
      return result;
    }

    if (payload.meta?.is_end === true || payload.documents.length < PAGE_SIZE) break;
  }

  const rows = Array.from(deduped.values());
  const reason: KakaoKeywordRankStatus =
    rows.length >= MAX_CHECKED_COUNT
      ? "OUT_OF_RANGE_45"
      : "NOT_FOUND_IN_FETCHED_RESULTS";
  const result = buildResult({
    keyword,
    targetPlaceName,
    targetAddress,
    storedKakaoPlaceId,
    storedPlaceUrl,
    matched: null,
    rows,
    totalFetchedCount,
    reason,
  });
  console.log("[kakao-keyword-rank diagnostic]", result);
  return result;
}

function findMatchedKakaoDocument(
  rows: IndexedDocument[],
  target: {
    storedKakaoPlaceId: string | null;
    targetPlaceName: string;
    targetAddress: string;
  }
): IndexedDocument | null {
  if (target.storedKakaoPlaceId) {
    return rows.find((row) => row.id === target.storedKakaoPlaceId) ?? null;
  }

  const targetName = normalizeComparable(target.targetPlaceName);
  const targetAddress = normalizeComparable(target.targetAddress);
  if (!targetName || !targetAddress) return null;
  return (
    rows.find((row) => {
      const name = normalizeComparable(row.document.place_name ?? "");
      const addresses = [
        row.document.road_address_name,
        row.document.address_name,
      ].map((value) => normalizeComparable(value ?? ""));
      return name === targetName && addresses.includes(targetAddress);
    }) ?? null
  );
}

function buildResult(params: {
  keyword: string;
  targetPlaceName: string;
  targetAddress: string;
  storedKakaoPlaceId: string | null;
  storedPlaceUrl: string | null;
  matched: IndexedDocument | null;
  rows: IndexedDocument[];
  totalFetchedCount: number;
  reason: KakaoKeywordRankStatus;
}): KakaoKeywordRankResult {
  const ranking = params.matched ? params.rows.indexOf(params.matched) + 1 : null;
  const checkedCount = params.rows.length;
  return {
    source: "KAKAO_LOCAL_KEYWORD",
    keyword: params.keyword,
    targetPlaceName: params.targetPlaceName,
    targetAddress: params.targetAddress,
    storedKakaoPlaceId: params.storedKakaoPlaceId,
    storedPlaceUrl: params.storedPlaceUrl,
    matchedKakaoPlaceId: params.matched?.id ?? null,
    matchedPlaceName: params.matched?.document.place_name?.trim() || null,
    matchedAddress:
      params.matched?.document.road_address_name?.trim() ||
      params.matched?.document.address_name?.trim() ||
      null,
    ranking,
    page: params.matched?.page ?? null,
    position: params.matched?.position ?? null,
    totalFetchedCount: params.totalFetchedCount,
    dedupedCount: checkedCount,
    checkedCount,
    isMatched: Boolean(params.matched),
    reason: params.reason,
    debugReason:
      params.reason === "FOUND"
        ? null
        : params.reason === "OUT_OF_RANGE_45"
          ? "target not found after checking 45 unique Kakao Local keyword results"
          : `target not found in ${checkedCount} unique results; Kakao API ended before 45`,
  };
}

function buildNameAddressKey(document: KakaoKeywordDocument): string | null {
  const name = normalizeComparable(document.place_name ?? "");
  const address = normalizeComparable(
    document.road_address_name ?? document.address_name ?? ""
  );
  return name && address ? `${name}|${address}` : null;
}

function normalizeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeDisplayText(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim();
}

function normalizeComparable(value: string): string {
  return normalizeDisplayText(value)
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z가-힣]/gi, "")
    .toLowerCase();
}
