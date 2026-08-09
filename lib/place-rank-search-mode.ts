export type PlaceRankSearchMode = "restaurant" | "place";

function normalizeSearchHint(value: unknown): string {
  if (value == null || typeof value === "object") return "";

  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

/**
 * `placeList(businessType: "place")`로 조회해야 하는 검색 의도.
 *
 * 키즈카페처럼 이름에 음식 업종 단어(`카페`)가 들어가지만 실제 네이버
 * 검색 결과는 일반 장소 축에 속하는 업종을 음식점 힌트보다 먼저 판별한다.
 */
const GENERAL_PLACE_OVERRIDE_HINTS = [
  "필라테스",
  "바레",
  "발레",
  "헬스",
  "피트니스",
  "퍼스널트레이닝",
  "요가",
  "학원",
  "아카데미",
  "교습",
  "학교",
  "미용",
  "뷰티",
  "네일",
  "병원",
  "의원",
  "약국",
  "치과",
  "한의원",
  "마사지",
  "재활",
  "체형교정",
  "스포츠",
  "동물체험",
  "동물원",
  "동물농장",
  "키즈카페",
  "베이비카페",
  "고양이카페",
  "애견카페",
  "동물카페",
  "실내놀이터",
  "놀이터",
  "체험관",
  "체험학습",
  "테마파크",
  "놀이공원",
  "아쿠아리움",
  "박물관",
  "미술관",
  "공방",
  "목장",
  "fitness",
  "pilates",
  "barre",
  "academy",
  "beauty",
  "hospital",
] as const;

/** 음식점 힌트가 함께 있으면 음식점 의도를 우선하는 보조 힌트. */
const GENERAL_PLACE_FALLBACK_HINTS = [
  "체험",
  "관람",
  "데이트",
  "모임",
  "핫플",
  "가볼만한",
  "놀거리",
  "분위기",
  "코스",
] as const;

const RESTAURANT_HINTS = [
  "맛집",
  "음식",
  "음식점",
  "식당",
  "레스토랑",
  "카페",
  "커피",
  "베이커리",
  "디저트",
  "술집",
  "주점",
  "와인바",
  "이자카야",
  "피자",
  "치킨",
  "햄버거",
  "파스타",
  "국밥",
  "고기집",
  "고깃집",
  "횟집",
  "분식",
  "중식",
  "일식",
  "한식",
  "양식",
  "브런치",
  "숯불",
  "족발",
  "보쌈",
  "뷔페",
  "restaurant",
  "cafe",
  "coffee",
  "food",
] as const;

function includesAnyHint(value: unknown, hints: readonly string[]): boolean {
  const normalized = normalizeSearchHint(value);
  return Boolean(normalized) && hints.some((hint) => normalized.includes(hint));
}

function isGeneralPlaceOverrideIntent(value: unknown): boolean {
  const text = String(value ?? "");
  return (
    includesAnyHint(text, GENERAL_PLACE_OVERRIDE_HINTS) ||
    /(^|[^a-z])pt([^a-z]|$)/i.test(text)
  );
}

/**
 * 네이버 pcmap 검색축을 고른다.
 *
 * 실제 검색 결과의 종류는 검색어 의도가 결정하므로 keyword를 먼저 보고,
 * 검색어가 모호할 때만 등록 업체 category를 보조 힌트로 사용한다.
 */
export function resolvePlaceRankSearchMode(params: {
  keyword: unknown;
  category?: unknown;
}): PlaceRankSearchMode {
  if (isGeneralPlaceOverrideIntent(params.keyword)) return "place";
  if (includesAnyHint(params.keyword, RESTAURANT_HINTS)) return "restaurant";
  if (includesAnyHint(params.keyword, GENERAL_PLACE_FALLBACK_HINTS)) {
    return "place";
  }

  if (isGeneralPlaceOverrideIntent(params.category)) return "place";
  if (includesAnyHint(params.category, RESTAURANT_HINTS)) return "restaurant";
  if (includesAnyHint(params.category, GENERAL_PLACE_FALLBACK_HINTS)) {
    return "place";
  }

  return "place";
}
