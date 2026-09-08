export const KAKAO_TOP150_LIMIT = 150;
export const KAKAO_MAP_PAGE_SIZE = 15;
export const KAKAO_MAP_MAX_PAGES = Math.ceil(KAKAO_TOP150_LIMIT / KAKAO_MAP_PAGE_SIZE);

const KAKAO_MAP_SEARCH_URL = "https://search.map.kakao.com/mapsearch/map.daum";

type KakaoMapPlace = {
  confirmid?: string | number;
  name?: string;
  address?: string;
  new_address?: string;
  last_cate_name?: string;
  cate_name_depth1?: string;
  cate_name_depth2?: string;
  cate_name_depth3?: string;
  reviewCount?: string | number;
  rating_average?: string | number;
  img?: string;
};

type KakaoMapSearchPayload = {
  place?: KakaoMapPlace[];
  place_totalcount?: string | number;
};

export type KakaoTop150Place = {
  rank: number;
  placeId: string;
  name: string;
  category: string;
  address: string;
  imageUrl: string;
  review: {
    total: number;
    rating: number | null;
  };
};

export type KakaoTop150SearchResult = {
  list: KakaoTop150Place[];
  requestCount: number;
  duplicateCount: number;
  availableCount: number | null;
  partial: boolean;
  failedPage: number | null;
  durationMs: number;
};

export class KakaoTop150SearchError extends Error {
  page: number;
  status: number | null;

  constructor(message: string, page: number, status: number | null = null) {
    super(message);
    this.name = "KakaoTop150SearchError";
    this.page = page;
    this.status = status;
  }
}

type SearchOptions = {
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
};

function toFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/,/g, "").trim())
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function toHttpsUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  return url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
}

function buildCategory(place: KakaoMapPlace): string {
  return String(
    place.last_cate_name ||
      place.cate_name_depth3 ||
      place.cate_name_depth2 ||
      place.cate_name_depth1 ||
      ""
  ).trim();
}

function normalizePlace(place: KakaoMapPlace): Omit<KakaoTop150Place, "rank"> | null {
  const placeId = String(place.confirmid ?? "").trim();
  if (!placeId) return null;

  const total = toFiniteNumber(place.reviewCount);
  const rating = toFiniteNumber(place.rating_average);

  return {
    placeId,
    name: String(place.name || "-").trim() || "-",
    category: buildCategory(place),
    address: String(place.new_address || place.address || "").trim(),
    imageUrl: toHttpsUrl(place.img),
    review: {
      total: total === null ? 0 : Math.max(0, Math.floor(total)),
      rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
    },
  };
}

export async function fetchKakaoMapTop150(
  keyword: string,
  options: SearchOptions = {}
): Promise<KakaoTop150SearchResult> {
  const fetcher = options.fetcher ?? fetch;
  const startedAt = Date.now();
  const places: Omit<KakaoTop150Place, "rank">[] = [];
  const seen = new Set<string>();
  let requestCount = 0;
  let duplicateCount = 0;
  let availableCount: number | null = null;
  let partial = false;
  let failedPage: number | null = null;

  for (let page = 1; page <= KAKAO_MAP_MAX_PAGES; page += 1) {
    const url = new URL(KAKAO_MAP_SEARCH_URL);
    url.searchParams.set("q", keyword);
    url.searchParams.set("page", String(page));
    url.searchParams.set("msFlag", "A");
    url.searchParams.set("sort", "0");

    let response: Response;
    try {
      response = await fetcher(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "ko-KR,ko;q=0.9",
          Referer: "https://map.kakao.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      });
      requestCount += 1;
    } catch (error) {
      if (page === 1) {
        throw new KakaoTop150SearchError(
          error instanceof Error ? error.message : "카카오맵 검색 네트워크 오류",
          page
        );
      }
      partial = true;
      failedPage = page;
      break;
    }

    if (!response.ok) {
      if (page === 1) {
        throw new KakaoTop150SearchError(
          `카카오맵 검색 HTTP ${response.status}`,
          page,
          response.status
        );
      }
      partial = true;
      failedPage = page;
      break;
    }

    let payload: KakaoMapSearchPayload;
    try {
      payload = (await response.json()) as KakaoMapSearchPayload;
    } catch {
      if (page === 1) {
        throw new KakaoTop150SearchError("카카오맵 검색 응답 JSON 파싱 실패", page, response.status);
      }
      partial = true;
      failedPage = page;
      break;
    }

    if (!Array.isArray(payload.place)) {
      if (page === 1) {
        throw new KakaoTop150SearchError("카카오맵 검색 응답에 장소 목록이 없습니다.", page);
      }
      partial = true;
      failedPage = page;
      break;
    }

    const reportedCount = toFiniteNumber(payload.place_totalcount);
    if (reportedCount !== null) availableCount = Math.max(0, Math.floor(reportedCount));

    for (const rawPlace of payload.place) {
      const place = normalizePlace(rawPlace);
      if (!place) continue;
      if (seen.has(place.placeId)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(place.placeId);
      places.push(place);
      if (places.length >= KAKAO_TOP150_LIMIT) break;
    }

    if (
      places.length >= KAKAO_TOP150_LIMIT ||
      payload.place.length < KAKAO_MAP_PAGE_SIZE ||
      (availableCount !== null && page * KAKAO_MAP_PAGE_SIZE >= availableCount)
    ) {
      break;
    }
  }

  return {
    list: places.map((place, index) => ({ ...place, rank: index + 1 })),
    requestCount,
    duplicateCount,
    availableCount,
    partial,
    failedPage,
    durationMs: Date.now() - startedAt,
  };
}
