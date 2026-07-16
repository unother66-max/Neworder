export type PcmapPlaceListBusinessType = "restaurant" | "place";

const DEFAULT_X = "127.0005";
const DEFAULT_Y = "37.53455";
const DEFAULT_DISPLAY = 70;

export const PCMAP_PLACE_LIST_QUERY = `
query __OPERATION_NAME__($input: PlaceListInput) {
  __ALIAS__: placeList(input: $input) {
    businesses {
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
        visitorReviewCount
        blogCafeReviewCount
        saveCount
        __FEATURE_FIELDS__
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

export type PcmapPlaceListRequestParams = {
  businessType: PcmapPlaceListBusinessType;
  keyword: unknown;
  x?: unknown;
  y?: unknown;
  start?: unknown;
  display?: unknown;
};

export type PcmapPlaceListRequestPayload = {
  operationName: "getRestaurantsPcmap" | "getPlacesList";
  variables: {
    input: {
      businessType: PcmapPlaceListBusinessType;
      deviceType: "pcmap";
      query: string;
      x: string;
      y: string;
      start: number;
      display: number;
      isPcmap: true;
    };
  };
  query: string;
};

function requiredKeyword(value: unknown): string {
  const keyword = String(value ?? "").trim();
  if (!keyword || /^(?:undefined|null)$/i.test(keyword)) {
    throw new TypeError("pcmap placeList query가 필요합니다.");
  }
  return keyword;
}

function safeCoordinate(
  value: unknown,
  fallback: string,
  min: number,
  max: number
): string {
  const raw = String(value ?? "").trim();
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric) || numeric < min || numeric > max) {
    return fallback;
  }
  return raw;
}

function safeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

export function buildPcmapPlaceListRequestPayload(
  params: PcmapPlaceListRequestParams
): PcmapPlaceListRequestPayload {
  const businessType =
    params.businessType === "restaurant" ? "restaurant" : "place";
  const operationName =
    businessType === "restaurant" ? "getRestaurantsPcmap" : "getPlacesList";
  const alias = businessType === "restaurant" ? "restaurants" : "places";
  const query = PCMAP_PLACE_LIST_QUERY.replace(
    "__OPERATION_NAME__",
    operationName
  )
    .replace("__ALIAS__", alias)
    .replace(
      "__FEATURE_FIELDS__",
      businessType === "restaurant" ? "microReview" : ""
    );

  return {
    operationName,
    variables: {
      input: {
        businessType,
        deviceType: "pcmap",
        query: requiredKeyword(params.keyword),
        x: safeCoordinate(params.x, DEFAULT_X, -180, 180),
        y: safeCoordinate(params.y, DEFAULT_Y, -90, 90),
        start: safeInteger(params.start, 1, 1, 10_000),
        display: safeInteger(params.display, DEFAULT_DISPLAY, 1, 70),
        isPcmap: true,
      },
    },
    query,
  };
}

export function buildPcmapPlaceListRequestBatch(
  params: PcmapPlaceListRequestParams
): PcmapPlaceListRequestPayload[] {
  return [buildPcmapPlaceListRequestPayload(params)];
}
