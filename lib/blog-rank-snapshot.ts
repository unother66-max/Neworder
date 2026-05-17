import type { PrismaClient } from "@prisma/client";

type BlogRankMetric = {
  blogId: string;
  totalScore: number | null;
  validKeywordCount: number | null;
  recentActivityScore: number | null;
  analyzedAt: Date;
};

type BlogRankProfile = {
  blogId: string;
  officialBlogTopic: string | null;
};

type RankedBlog = BlogRankMetric & {
  officialBlogTopic: string | null;
  overallRank: number;
  topicRank: number | null;
  totalBlogsCount: number;
  topicBlogsCount: number | null;
};

export type BlogRankSnapshotResult = {
  calculatedAt: Date;
  totalBlogsCount: number;
  savedCount: number;
  topicCounts: Record<string, number>;
  topOverall: Array<{
    blogId: string;
    overallRank: number;
    topicRank: number | null;
    officialBlogTopic: string | null;
    totalScore: number | null;
  }>;
};

function finiteOrNegative(value: number | null | undefined): number {
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

function compareRankMetric(a: BlogRankMetric, b: BlogRankMetric): number {
  const totalDiff = finiteOrNegative(b.totalScore) - finiteOrNegative(a.totalScore);
  if (totalDiff !== 0) return totalDiff;

  const keywordDiff = finiteOrNegative(b.validKeywordCount) - finiteOrNegative(a.validKeywordCount);
  if (keywordDiff !== 0) return keywordDiff;

  const activityDiff = finiteOrNegative(b.recentActivityScore) - finiteOrNegative(a.recentActivityScore);
  if (activityDiff !== 0) return activityDiff;

  const analyzedDiff = b.analyzedAt.getTime() - a.analyzedAt.getTime();
  if (analyzedDiff !== 0) return analyzedDiff;

  return a.blogId.localeCompare(b.blogId);
}

function rankBlogs(metrics: BlogRankMetric[], profilesByBlogId: Map<string, BlogRankProfile>): RankedBlog[] {
  const sorted = [...metrics].sort(compareRankMetric);
  const totalBlogsCount = sorted.length;
  const topicGroups = new Map<string, BlogRankMetric[]>();

  for (const metric of sorted) {
    const topic = profilesByBlogId.get(metric.blogId)?.officialBlogTopic?.trim() || null;
    if (!topic) continue;
    const group = topicGroups.get(topic) ?? [];
    group.push(metric);
    topicGroups.set(topic, group);
  }

  const topicRankByBlogId = new Map<string, { rank: number; count: number }>();
  for (const group of topicGroups.values()) {
    const topicSorted = [...group].sort(compareRankMetric);
    topicSorted.forEach((metric, index) => {
      topicRankByBlogId.set(metric.blogId, { rank: index + 1, count: topicSorted.length });
    });
  }

  return sorted.map((metric, index) => {
    const topic = profilesByBlogId.get(metric.blogId)?.officialBlogTopic?.trim() || null;
    const topicRank = topicRankByBlogId.get(metric.blogId) ?? null;
    return {
      ...metric,
      officialBlogTopic: topic,
      overallRank: index + 1,
      topicRank: topicRank?.rank ?? null,
      totalBlogsCount,
      topicBlogsCount: topicRank?.count ?? null,
    };
  });
}

export async function createBlogRankSnapshot(prisma: PrismaClient): Promise<BlogRankSnapshotResult> {
  const metricRows = await prisma.blogMetricSnapshot.findMany({
    where: {
      totalScore: { not: null },
    },
    select: {
      blogId: true,
      totalScore: true,
      validKeywordCount: true,
      recentActivityScore: true,
      analyzedAt: true,
    },
    orderBy: [{ analyzedAt: "desc" }, { createdAt: "desc" }],
  });

  const latestByBlogId = new Map<string, BlogRankMetric>();
  for (const metric of metricRows) {
    if (!latestByBlogId.has(metric.blogId)) latestByBlogId.set(metric.blogId, metric);
  }

  const latestMetrics = [...latestByBlogId.values()];
  const blogIds = latestMetrics.map((metric) => metric.blogId);
  const profileRows = blogIds.length
    ? await prisma.blogProfile.findMany({
        where: { blogId: { in: blogIds } },
        select: { blogId: true, officialBlogTopic: true },
      })
    : [];
  const profilesByBlogId = new Map(profileRows.map((profile) => [profile.blogId, profile]));
  const rankedBlogs = rankBlogs(latestMetrics, profilesByBlogId);
  const calculatedAt = new Date();

  if (rankedBlogs.length > 0) {
    await prisma.blogRankSnapshot.createMany({
      data: rankedBlogs.map((blog) => ({
        blogId: blog.blogId,
        overallRank: blog.overallRank,
        topicRank: blog.topicRank,
        officialBlogTopic: blog.officialBlogTopic,
        totalBlogsCount: blog.totalBlogsCount,
        topicBlogsCount: blog.topicBlogsCount,
        rankSource: "postlabs",
        calculatedAt,
      })),
    });
  }

  const topicCounts: Record<string, number> = {};
  for (const blog of rankedBlogs) {
    if (!blog.officialBlogTopic || blog.topicBlogsCount == null) continue;
    topicCounts[blog.officialBlogTopic] = blog.topicBlogsCount;
  }

  return {
    calculatedAt,
    totalBlogsCount: rankedBlogs.length,
    savedCount: rankedBlogs.length,
    topicCounts,
    topOverall: rankedBlogs.slice(0, 10).map((blog) => ({
      blogId: blog.blogId,
      overallRank: blog.overallRank,
      topicRank: blog.topicRank,
      officialBlogTopic: blog.officialBlogTopic,
      totalScore: blog.totalScore,
    })),
  };
}
