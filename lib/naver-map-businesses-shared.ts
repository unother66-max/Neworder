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

/** 키워드에 맞는 지도 중심 — businesses 빈 배열 완화 */
export function pickBusinessesCoords(keyword: string): { x: string; y: string } {
  const compact = String(keyword || "").replace(/\s+/g, "");

  if (/(서울역|명동|을지로|종로|동대문|광화문)/.test(compact)) {
    return { x: BUSINESSES_SEOUL_STATION_X, y: BUSINESSES_SEOUL_STATION_Y };
  }
  if (/(강남|역삼|선릉|논현|신사|압구정|청담|대치|삼성)/.test(compact)) {
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

export const GET_PLACES_LIST_QUERY = `
query getPlacesList(
  $placeListInput: BusinessesInput,
  $reverseGeocodingInput: ReverseGeocodingInput,
  $useReverseGeocode: Boolean = true
) {
  businesses(input: $placeListInput) {
    total
    items {
      id
      name
      category
      businessCategory
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

export type GetPlacesListBatchPayload = {
  operationName: string;
  variables: {
    useReverseGeocode: boolean;
    placeListInput: {
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

export function buildGetPlacesListBatch(
  keyword: string,
  coords: { x: string; y: string } = pickBusinessesCoords(keyword)
): GetPlacesListBatchPayload[] {
  return [
    {
      operationName: "getPlacesList",
      variables: {
        useReverseGeocode: true,
        placeListInput: {
          query: keyword,
          x: coords.x,
          y: coords.y,
          display: BUSINESSES_DISPLAY,
          start: 1,
        },
        reverseGeocodingInput: {
          x: coords.x,
          y: coords.y,
        },
      },
      query: GET_PLACES_LIST_QUERY,
    },
  ];
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
