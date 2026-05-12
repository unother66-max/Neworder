/**
 * 최근 제목·유효 키워드 기반 블로그 주제 추정 (로컬 사전 매칭, 외부 호출 없음).
 */

import type { BlogAnalysisRecentPost, BlogValidKeyword } from "@/lib/blog-analysis-types";

export const BLOG_TOPIC_LABELS = [
  "패션·미용",
  "맛집",
  "여행",
  "IT·컴퓨터",
  "육아",
  "건강",
  "운동",
  "인테리어",
  "자동차",
  "금융",
  "교육",
  "일상",
  "기타",
] as const;

export type BlogTopicLabel = (typeof BLOG_TOPIC_LABELS)[number];

/** 기타 제외 카테고리별 대표어 (예시 기반). 매칭 횟수 합산으로 점수 산출. */
const TOPIC_TERMS: Record<string, readonly string[]> = {
  "패션·미용": [
    "패션",
    "옷",
    "코디",
    "데일리룩",
    "뷰티",
    "화장품",
    "피부",
    "메이크업",
    "헤어",
    "네일",
    "향수",
  ],
  맛집: ["맛집", "카페", "음식", "점심", "저녁", "디저트", "고기", "술집", "레스토랑", "메뉴", "먹방"],
  여행: ["여행", "숙소", "호텔", "제주", "부산", "해외", "항공", "공항", "일정", "코스", "투어"],
  "IT·컴퓨터": [
    "컴퓨터",
    "노트북",
    "개발",
    "코딩",
    "앱",
    "프로그램",
    "AI",
    "스마트폰",
    "아이폰",
    "갤럭시",
    "리뷰",
  ],
  육아: ["육아", "아기", "아이", "엄마", "키즈", "어린이", "유치원", "장난감", "이유식"],
  건강: ["건강", "병원", "영양제", "다이어트", "피부과", "치료", "증상", "관리"],
  운동: ["운동", "헬스", "필라테스", "요가", "골프", "러닝", "PT", "발레", "스트레칭"],
  인테리어: ["인테리어", "집꾸미기", "가구", "침대", "소파", "주방", "리모델링", "조명"],
  자동차: ["자동차", "차량", "중고차", "전기차", "보험", "정비", "세차"],
  금융: ["주식", "코인", "투자", "부동산", "대출", "카드", "적금", "재테크"],
  교육: ["공부", "영어", "학원", "수능", "강의", "시험", "자격증", "독서"],
  일상: ["일상", "기록", "생각", "하루", "주말", "산책"],
};

const SPECIFIC_TOPIC_ORDER = [
  "패션·미용",
  "맛집",
  "여행",
  "IT·컴퓨터",
  "육아",
  "건강",
  "운동",
  "인테리어",
  "자동차",
  "금융",
  "교육",
] as const;

function normalizeCorpus(s: string): string {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

function countSubstringOccurrences(haystack: string, needle: string): number {
  if (!needle.length) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    count += 1;
    from = i + Math.max(1, needle.length);
  }
  return count;
}

function scoreCategory(corpusNorm: string, terms: readonly string[]): number {
  let sum = 0;
  for (const raw of terms) {
    const t = normalizeCorpus(raw);
    if (!t) continue;
    sum += countSubstringOccurrences(corpusNorm, t);
  }
  return sum;
}

/**
 * 최근 포스트 제목과 유효 키워드를 합친 텍스트로 주제 후보 점수를 매깁니다.
 * - 다른 특정 카테고리 점수가 있으면 그중 최고만 채택
 * - 모두 0일 때만 `일상` 사전 매칭을 적용하고, 일상도 0이면 `기타`
 * - 분석 텍스트가 비어 있으면 `null`
 */
export function inferBlogTopic(
  recentPosts?: BlogAnalysisRecentPost[] | null,
  validKeywords?: BlogValidKeyword[] | null
): string | null {
  const titles = (recentPosts ?? []).map((p) => String(p?.title ?? "")).filter(Boolean);
  const kw = (validKeywords ?? []).map((k) => String(k?.keyword ?? "")).filter(Boolean);
  const combined = [...titles, ...kw].join(" ").trim();

  if (!combined) return null;

  const corpusNorm = normalizeCorpus(combined);

  const scores = new Map<string, number>();
  for (const [label, terms] of Object.entries(TOPIC_TERMS)) {
    scores.set(label, scoreCategory(corpusNorm, terms));
  }

  let bestSpecific: string | null = null;
  let bestSpecificScore = 0;

  for (const label of SPECIFIC_TOPIC_ORDER) {
    const sc = scores.get(label) ?? 0;
    if (sc > bestSpecificScore) {
      bestSpecificScore = sc;
      bestSpecific = label;
    }
  }

  const dailyScore = scores.get("일상") ?? 0;

  if (bestSpecificScore > 0 && bestSpecific) {
    return bestSpecific;
  }
  if (dailyScore > 0) {
    return "일상";
  }
  return "기타";
}
