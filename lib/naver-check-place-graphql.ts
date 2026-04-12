export const GRAPHQL_URL = "https://pcmap-api.place.naver.com/graphql";
export const CHECK_PLACE_GRAPHQL_PAGE_SIZE = 70;

export const GET_CHECK_PLACE_RESTAURANTS_QUERY = `
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

export function buildCheckPlaceGraphqlPayload(
  keyword: string,
  x: string,
  y: string,
  start: number,
  pageSize: number = CHECK_PLACE_GRAPHQL_PAGE_SIZE
) {
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
          display: pageSize,
          deviceType: "pcmap",
          isPcmap: true,
        },
        restaurantListFilterInput: {
          x,
          y,
          display: pageSize,
          start,
          query: keyword,
        },
        reverseGeocodingInput: {
          x,
          y,
        },
      },
      query: GET_CHECK_PLACE_RESTAURANTS_QUERY,
    },
  ];
}
