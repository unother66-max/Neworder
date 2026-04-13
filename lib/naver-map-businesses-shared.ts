/**
 * map.naver.com → pcmap-api GraphQL(getPlacesList) 요청을
 * 서버 route와 클라이언트(브라우저)에서 동일하게 맞추기 위한 공유 정의.
 *
 * 서버 fetch만으로는 네이버 로그인/쿠키가 없어 businesses가 빈 배열일 수 있음.
 * 클라이언트에서 credentials:"include"로 호출해 배치 응답을 받은 뒤
 * API body.businessesGraphqlBatch로 넘기는 경로를 함께 사용한다.
 */

export const NAVER_PCMAP_GRAPHQL_URL =
  "https://pcmap-api.place.naver.com/graphql";

/** 강남권 (지역 키워드에만 사용) */
export const BUSINESSES_CENTER_X = "127.0276";
export const BUSINESSES_CENTER_Y = "37.4979";

/** 업종만 검색할 때 — restaurantList와 동일한 서울 기본 중심 (강남만 쓰면 필라테스 등 0건이 잦음) */
export const BUSINESSES_SEOUL_DEFAULT_X = "127.0005";
export const BUSINESSES_SEOUL_DEFAULT_Y = "37.53455";

export const BUSINESSES_SEOUL_STATION_X = "126.9707";
export const BUSINESSES_SEOUL_STATION_Y = "37.5547";

export const BUSINESSES_DISPLAY = 30;

/** 한 번의 GraphQL 배치에 넣을 목록 페이지 수(지도 페이지네이션과 유사하게 3페이지·최대 90건 후보) */
export const BUSINESSES_GRAPHQL_PAGE_COUNT = 3;

/**
 * place-rank-analyze 거리 필터 반경(km). 세부 동·상권은 좁게, 광역(강남·서울역)은 넓게.
 */
export function pickPlaceRankGeoRadiiKm(keyword: string): {
  inner: number;
  outer: number;
} {
  const c = String(keyword || "").replace(/\s+/g, "");

  // 로데오·가로수길 — 마포·신촌(~7.4km) 제외, 강남 내부 업장은 ~6km 안에 남는 경우가 많음
  if (/(압구정|청담|신사)/.test(c)) {
    return { inner: 2.8, outer: 6.2 };
  }
  if (/(논현|역삼|선릉|대치)/.test(c)) {
    return { inner: 4.2, outer: 7.5 };
  }
  if (c.includes("삼성")) {
    return { inner: 4.2, outer: 7.5 };
  }
  if (/(한남|이태원|한강진)/.test(c)) {
    return { inner: 3.6, outer: 6.5 };
  }
  if (/(홍대|마포|합정|상수|연남|망원)/.test(c)) {
    return { inner: 5.5, outer: 10 };
  }
  if (/(명동|을지로|종로|광화문)/.test(c)) {
    return { inner: 4, outer: 7 };
  }
  if (/(서울역|동대문)/.test(c)) {
    return { inner: 8, outer: 15 };
  }
  if (c.includes("강남")) {
    return { inner: 11, outer: 18 };
  }
  return { inner: 11, outer: 18 };
}

/** 키워드에 맞는 지도 중심 — businesses 빈 배열 완화 */
export function pickBusinessesCoords(keyword: string): { x: string; y: string } {
  const compact = String(keyword || "").replace(/\s+/g, "");

  if (/(서울역|명동|을지로|종로|동대문|광화문)/.test(compact)) {
    return { x: BUSINESSES_SEOUL_STATION_X, y: BUSINESSES_SEOUL_STATION_Y };
  }

  // 강남권: 압구정·청담 등은 강남역과 좌표 분리 (거리 필터 정확도)
  if (compact.includes("압구정")) {
    return { x: "127.02846", y: "37.52718" };
  }
  if (compact.includes("청담")) {
    return { x: "127.04665", y: "37.51954" };
  }
  if (compact.includes("신사")) {
    return { x: "127.0195", y: "37.5244" };
  }
  if (compact.includes("논현") || compact.includes("신논현")) {
    return { x: "127.0264", y: "37.5081" };
  }
  if (compact.includes("역삼")) {
    return { x: "127.0392", y: "37.5006" };
  }
  if (compact.includes("선릉")) {
    return { x: "127.0489", y: "37.5045" };
  }
  if (compact.includes("대치")) {
    return { x: "127.0634", y: "37.4946" };
  }
  if (compact.includes("삼성")) {
    return { x: "127.0630", y: "37.5133" };
  }
  if (compact.includes("강남")) {
    return { x: BUSINESSES_CENTER_X, y: BUSINESSES_CENTER_Y };
  }

  if (/(홍대|마포|합정|상수|연남|망원)/.test(compact)) {
    return { x: "126.9236", y: "37.5563" };
  }
  if (/(한남|이태원|한강진)/.test(compact)) {
    return { x: "127.0012", y: "37.5347" };
  }

  return { x: BUSINESSES_SEOUL_DEFAULT_X, y: BUSINESSES_SEOUL_DEFAULT_Y };
}

/**
 * 지역 토큰을 뺀 업종-only 쿼리는 pick()이 서울 기본 중심이 되는데,
 * 원문에 "서울역" 등이 있으면 그 지역 좌표를 유지해 0건을 줄인다.
 */
export function resolveBusinessesCoords(
  queryKeyword: string,
  coordAnchorKeyword?: string
): { x: string; y: string } {
  const q = pickBusinessesCoords(queryKeyword);
  const anchorRaw = String(coordAnchorKeyword || "").trim();
  if (!anchorRaw || anchorRaw === String(queryKeyword || "").trim()) {
    return q;
  }
  const anchor = pickBusinessesCoords(anchorRaw);
  const isSeoulDefault = (c: { x: string; y: string }) =>
    c.x === BUSINESSES_SEOUL_DEFAULT_X && c.y === BUSINESSES_SEOUL_DEFAULT_Y;
  if (isSeoulDefault(q) && !isSeoulDefault(anchor)) {
    return anchor;
  }
  return q;
}

export const NAVER_MAP_GRAPHQL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** `places`는 BusinessesInput이 아니라 PlacesInput — DevTools 배치와 동일 */
export const GET_PLACES_LIST_QUERY = `
query getPlacesList(
  $placesInput: PlacesInput,
  $reverseGeocodingInput: ReverseGeocodingInput,
  $useReverseGeocode: Boolean = true
) {
  places(input: $placesInput) {
    total
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

/**
 * AdBusinessesResult는 유니온 — 구체 타입별 inline fragment 필요.
 * (서버 오류 메시지에 나온 타입 + 레스토랑/스포츠 광고 추정 타입)
 */
export const GET_AD_BUSINESSES_QUERY = `
query getAdBusinesses($adBusinessesInput: AdBusinessesInput) {
  adBusinesses(input: $adBusinessesInput) {
    __typename
    ... on BeautyAdsResult {
      total
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
        __typename
      }
    }
    ... on HospitalAdsResult {
      total
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
        __typename
      }
    }
    ... on AccommodationAdsResult {
      total
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
        __typename
      }
    }
    ... on AttractionAdsResult {
      total
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
        __typename
      }
    }
    ... on PetAdsResult {
      total
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
        __typename
      }
    }
  }
}
`;

export type GetPlacesListBatchPayload = {
  operationName: string;
  variables: {
    useReverseGeocode: boolean;
    placesInput: {
      query: string;
      x: string;
      y: string;
      display: number;
      start: number;
    };
    reverseGeocodingInput: {
      x: string;
      y: string;
    };
  };
  query: string;
};

export type AdBusinessesBatchPayload = {
  operationName: string;
  variables: {
    /** pcmap 스키마: query·x·y만 허용(display/start는 AdBusinessesInput에 없음) */
    adBusinessesInput: {
      query: string;
      x: string;
      y: string;
    };
  };
  query: string;
};

export type PcmapGraphqlBatchPayload =
  | GetPlacesListBatchPayload
  | AdBusinessesBatchPayload;

export function buildAdBusinessesBatchPayload(
  keyword: string,
  coords: { x: string; y: string }
): AdBusinessesBatchPayload {
  return {
    operationName: "getAdBusinesses",
    variables: {
      adBusinessesInput: {
        query: keyword,
        x: coords.x,
        y: coords.y,
      },
    },
    query: GET_AD_BUSINESSES_QUERY,
  };
}

export function buildGetPlacesListBatch(
  keyword: string,
  coords: { x: string; y: string } = pickBusinessesCoords(keyword),
  opts?: { display?: number; start?: number }
): PcmapGraphqlBatchPayload[] {
  const display = opts?.display ?? BUSINESSES_DISPLAY;
  const start = opts?.start ?? 1;
  return [
    {
      operationName: "getPlacesList",
      variables: {
        useReverseGeocode: true,
        placesInput: {
          query: keyword,
          x: coords.x,
          y: coords.y,
          display,
          start,
        },
        reverseGeocodingInput: {
          x: coords.x,
          y: coords.y,
        },
      },
      query: GET_PLACES_LIST_QUERY,
    },
    buildAdBusinessesBatchPayload(keyword, coords),
  ];
}

/** 동일 키워드·좌표로 start만 바꿔 여러 페이지를 한 번의 POST 배치로 요청 */
export function buildGetPlacesListPagedBatch(
  keyword: string,
  coords: { x: string; y: string },
  pageCount: number = BUSINESSES_GRAPHQL_PAGE_COUNT,
  display: number = BUSINESSES_DISPLAY
): PcmapGraphqlBatchPayload[] {
  const n = Math.max(1, Math.min(3, Math.floor(pageCount)));
  const out: PcmapGraphqlBatchPayload[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      operationName: "getPlacesList",
      variables: {
        useReverseGeocode: i === 0,
        placesInput: {
          query: keyword,
          x: coords.x,
          y: coords.y,
          display,
          start: 1 + i * display,
        },
        reverseGeocodingInput: {
          x: coords.x,
          y: coords.y,
        },
      },
      query: GET_PLACES_LIST_QUERY,
    });
  }
  out.push(buildAdBusinessesBatchPayload(keyword, coords));
  return out;
}

/** 브라우저가 map.naver.com 컨텍스트일 때 (클라이언트 시도용) */
export function buildGetPlacesListFetchHeaders(
  keyword: string
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "*/*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Origin: "https://map.naver.com",
    Referer: `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`,
    "User-Agent": NAVER_MAP_GRAPHQL_UA,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };
}

/**
 * 일반 업종(businesses)은 pcmap **place/list** 흐름과 맞춤.
 * 서버 fetch에서 map 검색 Referer보다 빈 결과가 덜 나오는 경우가 많음.
 */
export function buildGetPlacesListFetchHeadersForServer(
  keyword: string,
  coords: { x: string; y: string } = pickBusinessesCoords(keyword)
): Record<string, string> {
  const q = encodeURIComponent(keyword);
  return {
    "Content-Type": "application/json",
    Accept: "*/*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Origin: "https://pcmap.place.naver.com",
    Referer: `https://pcmap.place.naver.com/place/list?query=${q}&x=${coords.x}&y=${coords.y}`,
    "User-Agent": NAVER_MAP_GRAPHQL_UA,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };
}
