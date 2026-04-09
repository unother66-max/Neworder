import { getKeywordSearchVolume } from "@/lib/searchad";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
const PAGE_SIZE = 70;
const MAX_PAGES = 5;

type GraphqlRestaurantItem = {
  id?: string;
  name?: string;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isRestaurantKeyword(keyword: string) {
  const normalized = normalizeText(keyword);

  const restaurantHints = [
    "맛집",
    "식당",
    "레스토랑",
    "카페",
    "술집",
    "치킨",
    "피자",
    "햄버거",
    "파스타",
    "국밥",
    "고기집",
    "횟집",
    "분식",
    "중식",
    "일식",
    "한식",
    "양식",
    "베이커리",
    "디저트",
    "브런치",
    "와인바",
  ];

  return restaurantHints.some((hint) => normalized.includes(normalizeText(hint)));
}

function buildGraphqlPayload(keyword: string, x: string, y: string, start: number) {
  return [
    {
      operationName: "getRestaurants",
      variables: {
        useReverseGeocode: true,
        isNmap: true,
        restaurantListInput: {
          query: keyword,
          x,
          y,
          start,
          display: PAGE_SIZE,
          deviceType: "pcmap",
          isPcmap: true,
        },
        restaurantListFilterInput: {
          x,
          y,
          display: PAGE_SIZE,
          start,
          query: keyword,
        },
        reverseGeocodingInput: {
          x,
          y,
        },
      },
      query: GET_RESTAURANTS_QUERY,
    },
  ];
}

async function fetchGraphqlPage(keyword: string, x: string, y: string, start: number) {
  const payload = buildGraphqlPayload(keyword, x, y, start);
  const referer = `https://pcmap.place.naver.com/restaurant/list?query=${encodeURIComponent(
    keyword
  )}&x=${x}&y=${y}`;

  const delays = [0, 1200, 2500];

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt]);
    }

    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://pcmap.place.naver.com",
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (res.ok) {
      const json = await res.json();
      return { ok: true as const, status: res.status, json };
    }

    if (res.status !== 429) {
      return { ok: false as const, status: res.status, json: null };
    }

    console.log("[graphql 429]", { keyword, start, attempt: attempt + 1 });
  }

  return { ok: false as const, status: 429, json: null };
}

function extractNamesFromPlaceHtml(html: string) {
  const decoded = decodeHtmlEntities(html);
  const names: string[] = [];

  const patterns = [
    /"name"\s*:\s*"([^"]+)"/g,
    /"title"\s*:\s*"([^"]+)"/g,
    /"businessName"\s*:\s*"([^"]+)"/g,
    /"placeName"\s*:\s*"([^"]+)"/g,
    /<strong[^>]*>([^<]+)<\/strong>/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(decoded)) !== null) {
      const raw = String(match[1] || "").trim();
      if (!raw) continue;
      if (raw.length > 80) continue;
      if (raw.includes("query")) continue;
      if (raw.includes("검색")) continue;
      names.push(raw);
    }
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const normalized = normalizeText(name);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(name);
  }

  return unique;
}

async function getRestaurantRank(keyword: string, targetName: string, x: string, y: string) {
  const normalizedTarget = normalizeText(targetName);
  const safeX = x || "127.0005";
  const safeY = y || "37.53455";
  const seenPageSignatures = new Set<string>();
  let had429 = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const start = 1 + (page - 1) * PAGE_SIZE;
    const result = await fetchGraphqlPage(keyword, safeX, safeY, start);

    if (!result.ok) {
      if (result.status === 429) {
        had429 = true;
        break;
      }

      console.log("[graphql 실패]", { keyword, page, status: result.status });
      continue;
    }

    const restaurantData = result.json.find(
      (item: any) => item?.data?.restaurants?.items
    );

    if (!restaurantData) {
      console.log("[graphql items 없음]", { keyword, page });
      continue;
    }

    const items = (restaurantData.data.restaurants.items || []) as GraphqlRestaurantItem[];

    if (!items.length) {
      console.log("[graphql 빈페이지]", { keyword, page });
      break;
    }

    console.log("[rank-debug]", {
      type: "restaurant",
      keyword,
      targetName,
      page,
      x: safeX,
      y: safeY,
      sample: items.slice(0, 10).map((i) => i?.name),
    });

    const pageSignature = items.map((i) => i?.name || "").join("|");
    if (seenPageSignatures.has(pageSignature)) {
      console.log("[중복 페이지 감지]", { keyword, page });
      break;
    }
    seenPageSignatures.add(pageSignature);

    const index = items.findIndex(
      (item) => normalizeText(item?.name || "") === normalizedTarget
    );

    if (index !== -1) {
      return start + index;
    }

    await sleep(250);
  }

  const fallbackRank = await getPlaceRankFallback(keyword, targetName, x, y);

  console.log("[fallback 결과]", {
    type: "restaurant",
    keyword,
    targetName,
    x: safeX,
    y: safeY,
    had429,
    fallbackRank,
  });

  return fallbackRank;
}

async function getGeneralPlaceRank(keyword: string, targetName: string, x: string, y: string) {
  const normalizedTarget = normalizeText(targetName);
  const safeX = x || "127.0005";
  const safeY = y || "37.53455";
  const seenPageSignatures = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://pcmap.place.naver.com/place/list?query=${encodeURIComponent(
      keyword
    )}&x=${safeX}&y=${safeY}&page=${page}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: "https://map.naver.com/",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.log("[place/list 실패]", { keyword, page, status: res.status });
      if (res.status === 429) {
        await sleep(1200);
      }
      continue;
    }

    const html = await res.text();
    const names = extractNamesFromPlaceHtml(html);

    if (!names.length) {
      console.log("[place/list 빈페이지]", { keyword, page });
      break;
    }

    console.log("[rank-debug]", {
      type: "place",
      keyword,
      targetName,
      page,
      x: safeX,
      y: safeY,
      sample: names.slice(0, 10),
    });

    const pageSignature = names.join("|");
    if (seenPageSignatures.has(pageSignature)) {
      console.log("[place/list 중복 페이지]", { keyword, page });
      break;
    }
    seenPageSignatures.add(pageSignature);

    const index = names.findIndex(
      (name) => normalizeText(name) === normalizedTarget
    );

    if (index !== -1) {
      return 1 + (page - 1) * PAGE_SIZE + index;
    }

    await sleep(300);
  }

  return -1;
}

async function getPlaceRankFallback(keyword: string, targetName: string, x: string, y: string) {
  const normalizedTarget = normalizeText(targetName);
  const safeX = x || "127.0005";
  const safeY = y || "37.53455";

  for (let page = 1; page <= 2; page++) {
    const url = `https://pcmap.place.naver.com/place/list?query=${encodeURIComponent(
      keyword
    )}&x=${safeX}&y=${safeY}&page=${page}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: "https://map.naver.com/",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.log("[fallback 실패]", { keyword, page, status: res.status });
      continue;
    }

    const html = await res.text();
    const names = extractNamesFromPlaceHtml(html);

    if (!names.length) break;

    const index = names.findIndex(
      (name) => normalizeText(name) === normalizedTarget
    );

    if (index !== -1) {
      return 1 + (page - 1) * PAGE_SIZE + index;
    }

    await sleep(250);
  }

  return -1;
}

async function getRank(keyword: string, targetName: string, x: string, y: string) {
  if (isRestaurantKeyword(keyword)) {
    return getRestaurantRank(keyword, targetName, x, y);
  }

  return getGeneralPlaceRank(keyword, targetName, x, y);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const keyword = String(body.keyword || "").trim();
    const targetName = String(body.targetName || "").trim();
    const x = String(body.x || "").trim();
    const y = String(body.y || "").trim();
    const placeKeywordId = String(body.placeKeywordId || "").trim();

    if (!keyword || !targetName) {
      return Response.json(
        { ok: false, error: "keyword, targetName가 필요합니다." },
        { status: 400 }
      );
    }

    const rank = await getRank(keyword, targetName, x, y);

    console.log("[check-place-rank 결과]", {
      keyword,
      targetName,
      x,
      y,
      rank,
    });

    const [volume, storeVolume] = await Promise.all([
      getKeywordSearchVolume(keyword),
      getKeywordSearchVolume(targetName),
    ]);
    const mobile = volume?.mobile ?? 0;
    const pc = volume?.pc ?? 0;
    const total = mobile + pc;

    const storeMobile = storeVolume?.mobile ?? 0;
    const storePc = storeVolume?.pc ?? 0;
    const storeTotal = storeMobile + storePc;

    if (placeKeywordId) {
      const kw = await prisma.placeKeyword.update({
        where: {
          id: placeKeywordId,
        },
        data: {
          mobileVolume: mobile,
          pcVolume: pc,
          totalVolume: total,
        },
        select: { placeId: true },
      });

      if (kw.placeId) {
        await prisma.place.update({
          where: { id: kw.placeId },
          data: {
            placeMobileVolume: storeMobile,
            placePcVolume: storePc,
            placeMonthlyVolume: storeTotal,
          },
        });
      }
    } else {
      await prisma.placeKeyword.updateMany({
        where: {
          keyword,
          place: {
            name: targetName,
          },
        },
        data: {
          mobileVolume: mobile,
          pcVolume: pc,
          totalVolume: total,
        },
      });

      await prisma.place.updateMany({
        where: { name: targetName, type: "rank" },
        data: {
          placeMobileVolume: storeMobile,
          placePcVolume: storePc,
          placeMonthlyVolume: storeTotal,
        },
      });
    }

    return Response.json({
      ok: true,
      rank,
      mobile,
      pc,
      monthly: total,
      storeMobile,
      storePc,
      storeMonthly: storeTotal,
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