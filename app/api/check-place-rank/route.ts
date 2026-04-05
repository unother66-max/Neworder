import { getKeywordSearchVolume } from "@/lib/searchad";
import { prisma } from "@/lib/prisma";

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";

type GraphqlRestaurantItem = {
  id: string;
  name: string;
};

type GraphqlResponseItem = {
  data?: {
    restaurants?: {
      items?: GraphqlRestaurantItem[];
      total?: number;
    };
  };
  errors?: Array<{
    message?: string;
  }>;
};

const GET_RESTAURANTS_QUERY = `
query getRestaurants(
  $restaurantListInput: RestaurantListInput,
  $restaurantListFilterInput: RestaurantListFilterInput,
  $reverseGeocodingInput: ReverseGeocodingInput,
  $useReverseGeocode: Boolean = false,
  $isNmap: Boolean = false
) {
  restaurants: restaurantList(input: $restaurantListInput) {
    items {
      apolloCacheId
      coupon {
        ...CouponItems
        __typename
      }
      ...CommonBusinessItems
      ...RestaurantBusinessItems
      __typename
    }
    ...RestaurantCommonFields
    optionsForMap {
      ...OptionsForMap
      __typename
    }
    nlu {
      ...NluFields
      __typename
    }
    searchGuide {
      ...SearchGuide
      __typename
    }
    __typename
  }
  filters: restaurantListFilter(input: $restaurantListFilterInput) {
    ...RestaurantFilter
    __typename
  }
  reverseGeocodingAddr(input: $reverseGeocodingInput) @include(if: $useReverseGeocode) {
    ...ReverseGeocodingAddr
    __typename
  }
}

fragment OptionsForMap on OptionsForMap {
  maxZoom
  minZoom
  includeMyLocation
  maxIncludePoiCount
  center
  spotId
  keepMapBounds
  __typename
}

fragment NluFields on Nlu {
  queryType
  user {
    gender
    __typename
  }
  queryResult {
    ptn0
    ptn1
    region
    spot
    tradeName
    service
    selectedRegion {
      name
      index
      x
      y
      __typename
    }
    selectedRegionIndex
    otherRegions {
      name
      index
      __typename
    }
    property
    keyword
    queryType
    nluQuery
    businessType
    cid
    branch
    franchise
    titleKeyword
    location {
      x
      y
      default
      longitude
      latitude
      dong
      si
      __typename
    }
    noRegionQuery
    priority
    showLocationBarFlag
    themeId
    filterBooking
    repRegion
    repSpot
    dbQuery {
      isDefault
      name
      type
      getType
      useFilter
      hasComponents
      __typename
    }
    type
    category
    menu
    context
    styles {
      id
      text
      __typename
    }
    gender
    themes
    __typename
  }
  __typename
}

fragment SearchGuide on SearchGuide {
  queryResults {
    regions {
      displayTitle
      query
      region {
        rcode
        __typename
      }
      __typename
    }
    isBusinessName
    __typename
  }
  queryIndex
  types
  __typename
}

fragment ReverseGeocodingAddr on ReverseGeocodingResult {
  rcode
  region
  __typename
}

fragment CouponItems on Coupon {
  total
  promotions {
    promotionSeq
    couponSeq
    conditionType
    image {
      url
      __typename
    }
    title
    description
    type
    couponUseType
    couponLandingUrl
    __typename
  }
  __typename
}

fragment CommonBusinessItems on BusinessSummary {
  id
  dbType
  name
  businessCategory
  category
  description
  hasBooking
  hasNPay
  x
  y
  distance
  imageUrl
  imageCount
  phone
  virtualPhone
  routeUrl
  streetPanorama {
    id
    pan
    tilt
    lat
    lon
    __typename
  }
  roadAddress
  address
  commonAddress
  blogCafeReviewCount
  bookingReviewCount
  totalReviewCount
  bookingUrl
  bookingBusinessId
  talktalkUrl
  detailCid {
    c0
    c1
    c2
    c3
    __typename
  }
  options
  promotionTitle
  agencyId
  businessHours
  newOpening
  hasWheelchairEntrance
  markerId @include(if: $isNmap)
  markerLabel @include(if: $isNmap) {
    text
    style
    __typename
  }
  imageMarker @include(if: $isNmap) {
    marker
    markerSelected
    __typename
  }
  __typename
}

fragment RestaurantFilter on RestaurantListFilterResult {
  filters {
    index
    name
    displayName
    value
    multiSelectable
    defaultParams {
      age
      gender
      day
      time
      __typename
    }
    items {
      index
      name
      value
      selected
      representative
      displayName
      clickCode
      laimCode
      type
      icon
      __typename
    }
    __typename
  }
  votingKeywordList {
    items {
      name
      displayName
      value
      icon
      clickCode
      __typename
    }
    menuItems {
      name
      value
      icon
      clickCode
      __typename
    }
    total
    __typename
  }
  optionKeywordList {
    items {
      name
      displayName
      value
      icon
      clickCode
      __typename
    }
    total
    __typename
  }
  __typename
}

fragment RestaurantCommonFields on RestaurantListResult {
  restaurantCategory
  queryString
  siteSort
  selectedFilter {
    order
    rank
    tvProgram
    brand
    menu
    food
    mood
    purpose
    sortingOrder
    takeout
    orderBenefit
    cafeFood
    gender
    cafeMenu
    cafeTheme
    theme
    voting
    filterOpening
    keywordFilter
    property
    realTimeBooking
    hours
    __typename
  }
  rcodes
  location {
    sasX
    sasY
    __typename
  }
  showMembershipBenefit
  total
  __typename
}

fragment RestaurantBusinessItems on RestaurantListSummary {
  fullAddress
  categoryCodeList
  visitorReviewCount
  visitorReviewScore
  imageUrls
  bookingHubUrl
  bookingHubButtonName
  visitorImages {
    id
    reviewId
    imageUrl
    profileImageUrl
    nickname
    __typename
  }
  visitorReviews {
    id
    review
    reviewId
    __typename
  }
  foryouLabel
  foryouTasteType
  microReview
  priceCategory
  broadcastInfo {
    program
    date
    menu
    __typename
  }
  michelinGuide {
    year
    star
    comment
    url
    hasGrade
    isBib
    alternateText
    hasExtraNew
    region
    __typename
  }
  broadcasts {
    program
    menu
    episode
    broadcast_date
    __typename
  }
  tvcastId
  naverBookingCategory
  saveCount
  uniqueBroadcasts
  naverOrder {
    items {
      id
      type
      __typename
    }
    isDelivery
    isTableOrder
    isPreOrder
    isPickup
    __typename
  }
  deliveryArea
  isCvsDelivery
  bookingDisplayName
  bookingVisitId
  bookingPickupId
  popularMenuImages {
    name
    price
    bookingCount
    menuUrl
    menuListUrl
    imageUrl
    isPopular
    usePanoramaImage
    __typename
  }
  newBusinessHours {
    status
    description
    __typename
  }
  baemin {
    businessHours {
      deliveryTime {
        start
        end
        __typename
      }
      closeDate {
        start
        end
        __typename
      }
      temporaryCloseDate {
        start
        end
        __typename
      }
      __typename
    }
    __typename
  }
  yogiyo {
    businessHours {
      actualDeliveryTime {
        start
        end
        __typename
      }
      bizHours {
        start
        end
        __typename
      }
      __typename
    }
    __typename
  }
  realTimeBookingInfo {
    description
    hasMultipleBookingItems
    bookingBusinessId
    bookingUrl
    itemId
    itemName
    timeSlots {
      date
      time
      timeRaw
      available
      __typename
    }
    __typename
  }
  posInfo {
    isPOS
    items {
      value
      title
      description
      __typename
    }
    __typename
  }
  nPayConnect {
    benefitText
    __typename
  }
  membershipBenefit {
    membershipSeq
    membershipName
    type
    representativeColor
    representativeImageUrl
    membershipBenefitLandingUrl
    benefitName
    totalCouponCount
    totalMembershipBenefitCount
    promotions {
      promotionSeq
      couponSeq
      conditionType
      image {
        url
        __typename
      }
      title
      type
      couponUseType
      __typename
    }
    __typename
  }
  __typename
}
`;

function normalizeText(value: string) {
  return value.replace(/\s/g, "").trim();
}

async function getRank(keyword: string, targetName: string) {
  const normalizedTarget = normalizeText(targetName);

  for (let page = 1; page <= 10; page++) {
    const start = 1 + (page - 1) * 70;

    const payload = [
      {
        operationName: "getRestaurants",
        variables: {
          useReverseGeocode: true,
          isNmap: true,
          restaurantListInput: {
            query: keyword,
            x: "127.0005",
            y: "37.53455",
            start,
            display: 70,
            takeout: null,
            orderBenefit: null,
            isCurrentLocationSearch: null,
            filterOpening: null,
            deviceType: "pcmap",
            isPcmap: true,
          },
          restaurantListFilterInput: {
            x: "127.0005",
            y: "37.53455",
            display: 70,
            start,
            query: keyword,
            isCurrentLocationSearch: null,
          },
          reverseGeocodingInput: {
            x: "127.0005",
            y: "37.53455",
          },
        },
        query: GET_RESTAURANTS_QUERY,
      },
    ];

    const referer = `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(
      keyword
    )}&x=127.0005&y=37.53455&clientX=127.0005&clientY=37.53455&display=70&locale=ko`;

    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://pcmap.place.naver.com",
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("GraphQL 실패 상태코드:", res.status);
      console.error("GraphQL 실패 응답 일부:", text.slice(0, 500));
      throw new Error(`GraphQL 요청 실패: ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("JSON 아님:", text.slice(0, 500));
      throw new Error("GraphQL 응답이 JSON이 아닙니다.");
    }

    const json = (await res.json()) as GraphqlResponseItem[];

    if (!Array.isArray(json)) {
      continue;
    }

    const restaurantData = json.find((item) => item?.data?.restaurants?.items);

    if (!restaurantData) {
      const errorMessage = json
        .flatMap((item) => item?.errors || [])
        .map((e) => e?.message)
        .filter(Boolean)
        .join(" | ");

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      continue;
    }

    const items = restaurantData.data?.restaurants?.items ?? [];
    const index = items.findIndex(
      (item) => normalizeText(item.name) === normalizedTarget
    );

    if (index !== -1) {
      return start + index;
    }
  }

  return -1;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();
    const targetName = String(body.targetName || "").trim();

    if (!keyword || !targetName) {
      return Response.json(
        {
          ok: false,
          error: "keyword 또는 targetName이 없습니다.",
        },
        { status: 400 }
      );
    }

    const rank = await getRank(keyword, targetName);

// 🔥 검색량 가져오기
const volume = await getKeywordSearchVolume(keyword);

const mobile = volume?.mobile ?? 0;
const pc = volume?.pc ?? 0;
const total = mobile + pc;

// 🔥 DB 저장
await prisma.placeKeyword.updateMany({
  where: {
    keyword,
  },
  data: {
    mobileVolume: mobile,
    pcVolume: pc,
    totalVolume: total,
  },
});

return Response.json({
  ok: true,
  rank,
});
  } catch (error) {
    console.error("check-place-rank error:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "순위 조회 실패",
      },
      { status: 500 }
    );
  }
}