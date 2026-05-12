/**
 * 블로그 레벨·등급·영향력 점수 계산 (임시 자체 기준).
 * 실제 서비스 지표와 무관한 데모용 가중치이며, 추후 DB 히스토리·실제 순위 기반으로 보정 예정입니다.
 */

import type { BlogAnalysisRecentPost } from "@/lib/blog-analysis-types";

export type BlogScoreGrade = "D" | "C" | "B" | "A" | "S";

export type BlogScoreInput = {
  visitorCount?: number | null;
  postCount?: number | null;
  postingFrequency?: number | null;
  subscriberCount?: number | null;
  recentPosts?: BlogAnalysisRecentPost[];
  /** 유효 키워드 수(검색량>0). null이면 0으로 간주하여 totalScore·키워드 영향력에 반영 */
  validKeywordCount?: number | null;
};

export type BlogScoreResult = {
  level: number;
  grade: BlogScoreGrade;
  totalScore: number;
  influenceScore: number;
  keywordInfluenceScore: number;
  contentInfluenceScore: number;
  nextLevelRemaining: number;
};

function finiteNum(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** 유효 키워드 수: null/undefined는 키워드 미집계로 보고 0점 처리(NaN 방지). */
function validKeywordCountForScore(validKeywordCount: number | null | undefined): number {
  return validKeywordCount == null ? 0 : finiteNum(validKeywordCount);
}

function clamp01(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

function round2(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function gradeFromTotal(score: number): BlogScoreGrade {
  const s = finiteNum(score);
  if (s < 20) return "D";
  if (s < 40) return "C";
  if (s < 60) return "B";
  if (s < 80) return "A";
  return "S";
}

function levelFromTotal(score: number): number {
  const s = finiteNum(score);
  const lvl = Math.floor(s / 10) + 1;
  return Math.min(10, Math.max(1, lvl));
}

function nextLevelRemainingPoints(totalScore: number, level: number): number {
  if (level >= 10) return 0;
  const nextThreshold = level * 10;
  const raw = nextThreshold - finiteNum(totalScore);
  return round2(Math.max(0, raw));
}

/**
 * 유효 키워드·방문자·이웃 기반 키워드 영향력 (0~100, 임시 가중치).
 * validKeywordCount 60%, visitorCount 25%, subscriberCount 15%.
 */
function computeKeywordInfluenceScore(input: BlogScoreInput): number {
  const vk = validKeywordCountForScore(input.validKeywordCount);
  const v = finiteNum(input.visitorCount);
  const s = finiteNum(input.subscriberCount);

  const partK = clamp01(vk / 100) * 60;
  const partV = clamp01(v / 1000) * 25;
  const partS = clamp01(s / 3000) * 15;
  return round2(partK + partV + partS);
}

/** 게시물 수·작성 빈도·최근 글 개수 기반 임시 콘텐츠 영향력 (0~100). */
function computeContentInfluenceScore(input: BlogScoreInput): number {
  const posts = finiteNum(input.postCount);
  const freq = finiteNum(input.postingFrequency);
  const recentLen = Array.isArray(input.recentPosts) ? input.recentPosts.length : 0;

  const partP = clamp01(posts / 1000) * 40;
  const partF = clamp01(freq / 1.0) * 35;
  const partR = clamp01(recentLen / 20) * 25;
  return round2(partP + partF + partR);
}

export function computeBlogScore(input: BlogScoreInput): BlogScoreResult {
  const v = finiteNum(input.visitorCount);
  const s = finiteNum(input.subscriberCount);
  const p = finiteNum(input.postCount);
  const f = finiteNum(input.postingFrequency);
  const vk = validKeywordCountForScore(input.validKeywordCount);

  const visitorPts = clamp01(v / 1000) * 30;
  const subscriberPts = clamp01(s / 3000) * 20;
  const postPts = clamp01(p / 1000) * 20;
  const freqPts = clamp01(f / 1.0) * 15;
  const validKwPts = clamp01(vk / 100) * 15;

  const totalScore = round2(visitorPts + subscriberPts + postPts + freqPts + validKwPts);
  const influenceScore = totalScore;

  const kw = computeKeywordInfluenceScore(input);
  const ct = computeContentInfluenceScore(input);

  const level = levelFromTotal(totalScore);
  const grade = gradeFromTotal(totalScore);
  const nextLevelRemaining = nextLevelRemainingPoints(totalScore, level);

  return {
    level,
    grade,
    totalScore,
    influenceScore,
    keywordInfluenceScore: kw,
    contentInfluenceScore: ct,
    nextLevelRemaining,
  };
}
