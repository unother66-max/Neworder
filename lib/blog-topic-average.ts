import type { BlogTopicAverageComparison } from "@/lib/blog-analysis-types";
import { pickLatestHistoryPerBlogId, isTopicRankingEligible } from "@/lib/blog-analysis-history-rank";
import { prisma } from "@/lib/prisma";

type HistoryAvgRow = {
  blogId: string;
  blogTopic: string | null;
  analyzedAt: Date;
  totalScore: number | null;
  validKeywordCount: number | null;
  visitorCount: number | null;
  postingFrequency: number | null;
  averageTitleLength: number | null;
  averageContentLength: number | null;
  averageImageCount: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finiteNums(rows: HistoryAvgRow[], key: keyof HistoryAvgRow): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function meanRound(nums: number[], decimals: 1 | 2): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const raw = sum / nums.length;
  return decimals === 1 ? round1(raw) : round2(raw);
}

export type TopicAverageMySnapshot = {
  totalScore: number | null;
  validKeywordCount: number | null;
  visitorCount: number | null;
  postingFrequency: number | null;
  averageTitleLength: number | null;
  averageContentLength: number | null;
  averageImageCount: number | null;
};

/**
 * 서비스 내 BlogAnalysisHistory 기준, 동일 주제(blogTopic) 블로그들의 최신 스냅샷만 모아 동료 평균을 계산합니다.
 * 현재 블로그가 스냅샷에 있으면 평균 계산에서 제외합니다.
 */
export async function computeBlogTopicAverageComparison(args: {
  blogTopic: string | null | undefined;
  myBlogId: string;
  mySnapshot: TopicAverageMySnapshot;
}): Promise<BlogTopicAverageComparison | null> {
  const topic = args.blogTopic ?? null;
  if (!isTopicRankingEligible(topic)) return null;

  const rows = await prisma.blogAnalysisHistory.findMany({
    select: {
      blogId: true,
      blogTopic: true,
      analyzedAt: true,
      totalScore: true,
      validKeywordCount: true,
      visitorCount: true,
      postingFrequency: true,
      averageTitleLength: true,
      averageContentLength: true,
      averageImageCount: true,
    },
    orderBy: { analyzedAt: "desc" },
  });

  const latestPerBlog = pickLatestHistoryPerBlogId(rows);
  const topicSlice = latestPerBlog.filter((r) => r.blogTopic === topic && isTopicRankingEligible(r.blogTopic));

  if (topicSlice.length < 2) return null;

  const peers = topicSlice.filter((r) => r.blogId !== args.myBlogId);
  const rowsForAvg = peers.length > 0 ? peers : topicSlice;

  const averageTotalScore = meanRound(finiteNums(rowsForAvg, "totalScore"), 2);
  const averageValidKeywordCount = meanRound(finiteNums(rowsForAvg, "validKeywordCount"), 1);
  const averageVisitorCount = meanRound(finiteNums(rowsForAvg, "visitorCount"), 1);
  const averagePostingFrequency = meanRound(finiteNums(rowsForAvg, "postingFrequency"), 2);
  const averageTitleLength = meanRound(finiteNums(rowsForAvg, "averageTitleLength"), 1);
  const averageContentLength = meanRound(finiteNums(rowsForAvg, "averageContentLength"), 1);
  const averageImageCount = meanRound(finiteNums(rowsForAvg, "averageImageCount"), 1);

  const my = args.mySnapshot;

  return {
    topic,
    sampleCount: topicSlice.length,
    averageTotalScore,
    averageValidKeywordCount,
    averageVisitorCount,
    averagePostingFrequency,
    averageTitleLength,
    averageContentLength,
    averageImageCount,
    myTotalScore: my.totalScore,
    myValidKeywordCount: my.validKeywordCount,
    myVisitorCount: my.visitorCount,
    myPostingFrequency: my.postingFrequency,
    myAverageTitleLength: my.averageTitleLength,
    myAverageContentLength: my.averageContentLength,
    myAverageImageCount: my.averageImageCount,
  };
}
