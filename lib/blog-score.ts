/**
 * 블로그 레벨·등급·영향력 점수 계산 (임시 자체 기준).
 * 실제 서비스 지표와 무관한 데모용 가중치이며, 추후 DB 히스토리·실제 순위 기반으로 보정 예정입니다.
 */

import type {
  BlogAnalysisRecentPost,
  BlogKeywordInsight,
  BlogPostPatternAnalysis,
  BlogValidKeyword,
  BlogVisitorChartPoint,
} from "@/lib/blog-analysis-types";

export type BlogScoreGrade = "D" | "C" | "B" | "A" | "S";

export type BlogScoreInput = {
  blogId?: string | null;
  visitorCount?: number | null;
  totalVisitCount?: number | null;
  visitorChartData?: BlogVisitorChartPoint[] | null;
  postCount?: number | null;
  postingFrequency?: number | null;
  subscriberCount?: number | null;
  recentPosts?: BlogAnalysisRecentPost[];
  patternAnalysis?: BlogPostPatternAnalysis | null;
  validKeywords?: BlogValidKeyword[] | null;
  keywordInsights?: BlogKeywordInsight[] | null;
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

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function logScore(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clampScore((Math.log1p(value) / Math.log1p(maxValue)) * 100);
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function recentPostDateMs(posts: BlogAnalysisRecentPost[] | null | undefined): number | null {
  const times = (posts ?? [])
    .map((post) => {
      const raw = post.publishedAt ?? post.createdAt;
      if (!raw) return null;
      const time = new Date(raw).getTime();
      return Number.isFinite(time) ? time : null;
    })
    .filter((time): time is number => time !== null);
  if (times.length === 0) return null;
  return Math.max(...times);
}

function recencyScoreFromPosts(posts: BlogAnalysisRecentPost[] | null | undefined): number {
  const latest = recentPostDateMs(posts);
  if (latest === null) return 35;
  const days = Math.max(0, (Date.now() - latest) / (24 * 60 * 60 * 1000));
  if (days <= 2) return 100;
  if (days <= 7) return 82;
  if (days <= 14) return 64;
  if (days <= 30) return 42;
  return 22;
}

function visitorAverage(input: BlogScoreInput): number {
  const chartValues = (input.visitorChartData ?? [])
    .map((point) => finiteNum(point.visitorCount))
    .filter((n) => n > 0);
  if (chartValues.length > 0) return average(chartValues);
  return finiteNum(input.visitorCount);
}

function keywordVolumeTotal(input: BlogScoreInput): number {
  const fromKeywords = (input.validKeywords ?? []).reduce(
    (sum, keyword) => sum + finiteNum(keyword.totalVolume),
    0
  );
  if (fromKeywords > 0) return fromKeywords;
  return (input.keywordInsights ?? []).reduce((sum, insight) => sum + finiteNum(insight.totalVolume), 0);
}

function keywordMatchedAverage(input: BlogScoreInput): number {
  const insights = input.keywordInsights ?? [];
  if (insights.length === 0) return 25;
  const scores = insights.map((insight) => {
    const matched = finiteNum(insight.matchedPostCount);
    return Math.min(100, matched * 34);
  });
  return average(scores);
}

function keywordRawAverage(input: BlogScoreInput): number {
  const insights = input.keywordInsights ?? [];
  if (insights.length === 0) return 25;
  return average(insights.map((insight) => finiteNum(insight.keywordScore)));
}

function recentPostNumberAverage(
  posts: BlogAnalysisRecentPost[] | null | undefined,
  fields: Array<keyof Pick<BlogAnalysisRecentPost, "commentCount" | "sympathyCount" | "likeCount" | "shareCount">>
): number {
  const rows = posts ?? [];
  if (rows.length === 0) return 0;
  const values = rows.map((post) =>
    fields.reduce((sum, field) => sum + finiteNum(post[field] as number | null | undefined), 0)
  );
  return average(values);
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

function computeKeywordInfluenceScore(input: BlogScoreInput): number {
  const vk = validKeywordCountForScore(input.validKeywordCount);
  const volume = keywordVolumeTotal(input);
  const keywordCountScore = logScore(vk, 500);
  const volumeScore = volume > 0 ? logScore(volume, 300_000) : 28;
  const matchedScore = keywordMatchedAverage(input);
  const rawKeywordScore = keywordRawAverage(input);
  const trafficSupportScore = logScore(visitorAverage(input), 500);

  const rawKeywordInfluenceScore = clampScore(
    6 +
      keywordCountScore * 0.42 +
      volumeScore * 0.22 +
      matchedScore * 0.14 +
      rawKeywordScore * 0.12 +
      trafficSupportScore * 0.10
  );

  return round2(clampScore(rawKeywordInfluenceScore * 0.52 + 2));
}

function computeContentInfluenceScore(input: BlogScoreInput): number {
  const freq = finiteNum(input.postingFrequency);
  const posts = input.recentPosts ?? [];
  const pattern = input.patternAnalysis ?? null;
  const avgBody = finiteNum(pattern?.averageContentLength);
  const avgImage = finiteNum(pattern?.averageImageCount);
  const avgTitle = finiteNum(pattern?.averageTitleLength);

  const engagementScore = clampScore(recentPostNumberAverage(posts, [
    "commentCount",
    "sympathyCount",
    "likeCount",
    "shareCount",
  ]) * 2.2);
  const activityScore = clampScore(freq * 100);
  const recencyScore = recencyScoreFromPosts(posts);
  const bodyFitScore = avgBody > 0 ? clampScore((avgBody / 1700) * 100) : 35;
  const imageFitScore = avgImage > 0 ? clampScore((Math.min(avgImage, 20) / 20) * 100) : 35;
  const titleFitScore = avgTitle > 0 ? clampScore(100 - Math.min(80, Math.abs(avgTitle - 26) * 5)) : 45;
  const patternScore = bodyFitScore * 0.45 + imageFitScore * 0.25 + titleFitScore * 0.30;

  const commercialityPenalty =
    posts.filter((post) => /후기|예약|추천|맛집|카페|리뷰|솔직/i.test(String(post.title ?? ""))).length *
    1.6;
  const overOptimizationPenalty =
    (avgImage > 25 ? 4 : 0) + (avgTitle > 42 ? 5 : 0) + (avgBody < 900 ? 3 : 0);

  const rawContentInfluenceScore = clampScore(
    3 +
      engagementScore * 0.55 +
      patternScore * 0.05 +
      activityScore * 0.05 +
      recencyScore * 0.03 -
      commercialityPenalty -
      overOptimizationPenalty
  );
  const contentPresenceFloor = posts.length > 0 || pattern ? 8 + recencyScore * 0.02 : 0;

  return round2(clampScore(Math.max(rawContentInfluenceScore, contentPresenceFloor)));
}

export function computeBlogScore(input: BlogScoreInput): BlogScoreResult {
  const dailyVisitor = finiteNum(input.visitorCount);
  const avgVisitor = visitorAverage(input);
  const totalVisitCount = finiteNum(input.totalVisitCount);
  const s = finiteNum(input.subscriberCount);
  const p = finiteNum(input.postCount);
  const f = finiteNum(input.postingFrequency);
  const vk = validKeywordCountForScore(input.validKeywordCount);

  const kw = computeKeywordInfluenceScore(input);
  const ct = computeContentInfluenceScore(input);
  const totalVisitorScore = logScore(totalVisitCount, 1_000_000);
  const averageVisitorScore = logScore(avgVisitor, 500);
  const dailyVisitorScore = logScore(dailyVisitor, 500);
  const activityScore = clampScore(f * 100);
  const subscriberScore = logScore(s, 5000);
  const postScaleScore = logScore(p, 3000);
  const recencyScore = recencyScoreFromPosts(input.recentPosts);
  const trafficScore =
    totalVisitorScore * 0.44 +
    averageVisitorScore * 0.34 +
    dailyVisitorScore * 0.10 +
    subscriberScore * 0.12;

  const influenceScore = round2(
    clampScore(
      5 +
        trafficScore * 0.32 +
        kw * 0.27 +
        activityScore * 0.11 +
        postScaleScore * 0.03 +
        recencyScore * 0.02 +
        ct * 0.02
    )
  );
  const totalScore = influenceScore;

  const level = levelFromTotal(totalScore);
  const grade = gradeFromTotal(totalScore);
  const nextLevelRemaining = nextLevelRemainingPoints(totalScore, level);

  if (process.env.NODE_ENV === "development") {
    console.log("[blog-score] influence debug", {
      blogId: input.blogId ?? null,
      visitorMetrics: {
        dailyVisitCount: dailyVisitor,
        averageVisitCount: avgVisitor,
        totalVisitCount,
      },
      postingActivityMetrics: {
        analyzedPostCount: input.recentPosts?.length ?? 0,
        recentPostCount: input.recentPosts?.length ?? 0,
        latestPostDate:
          recentPostDateMs(input.recentPosts) !== null
            ? new Date(recentPostDateMs(input.recentPosts) as number).toISOString()
            : null,
        postingFrequency: f,
      },
      keywordMetrics: {
        validKeywordCount: vk,
        keywordSearchVolume: keywordVolumeTotal(input),
        keywordScoreRaw: keywordRawAverage(input),
        matchedScore: keywordMatchedAverage(input),
      },
      contentMetrics: {
        avgTitleLength: input.patternAnalysis?.averageTitleLength ?? null,
        avgBodyLength: input.patternAnalysis?.averageContentLength ?? null,
        avgImageCount: input.patternAnalysis?.averageImageCount ?? null,
        recencyScore,
        commercialityPenalty:
          (input.recentPosts ?? []).filter((post) =>
            /후기|예약|추천|맛집|카페|리뷰|솔직/i.test(String(post.title ?? ""))
          ).length * 1.6,
        informativenessScore: input.patternAnalysis?.averageContentLength
          ? clampScore((Number(input.patternAnalysis.averageContentLength) / 1700) * 100)
          : null,
      },
      rawScores: {
        trafficScore,
        keywordInfluenceScore: kw,
        contentInfluenceScore: ct,
        influenceScore,
      },
      finalScores: {
        influenceScore,
        keywordInfluenceScore: kw,
        contentInfluenceScore: ct,
        totalScore,
      },
    });
  }

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
