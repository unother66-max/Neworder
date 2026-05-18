import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { isAdminEmail } from "@/lib/admin-emails";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function todayUtcStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function withinMs(date: Date | null | undefined, now: Date, ms: number): boolean {
  return Boolean(date && now.getTime() - date.getTime() <= ms);
}

function shortError(message: string | null): string | null {
  if (!message) return null;
  return message.length > 240 ? `${message.slice(0, 240)}...` : message;
}

export async function GET() {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null };
  } | null;
  const email = session?.user?.email?.trim();
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const generatedAt = new Date();
  const startOfToday = todayUtcStart(generatedAt);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;

  const [
    queueTotal,
    queueByStatus,
    latestQueueDiscovered,
    latestQueueAnalyzed,
    latestQueueFailed,
    recentFailedItems,
    failedCountToday,
    profileTotal,
    profilesCreatedToday,
    profilesAnalyzedToday,
    latestProfileCreated,
    latestProfileAnalyzed,
    metricTotal,
    metricsCreatedToday,
    latestMetricAnalyzed,
    rankTotal,
    latestRank,
  ] = await Promise.all([
    prisma.blogDiscoveryQueue.count(),
    prisma.blogDiscoveryQueue.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.blogDiscoveryQueue.findFirst({
      orderBy: { discoveredAt: "desc" },
      select: { discoveredAt: true },
    }),
    prisma.blogDiscoveryQueue.findFirst({
      where: { analyzedAt: { not: null } },
      orderBy: { analyzedAt: "desc" },
      select: { analyzedAt: true },
    }),
    prisma.blogDiscoveryQueue.findFirst({
      where: { status: "failed", lastTriedAt: { not: null } },
      orderBy: { lastTriedAt: "desc" },
      select: { lastTriedAt: true },
    }),
    prisma.blogDiscoveryQueue.findMany({
      where: { status: "failed" },
      orderBy: [{ lastTriedAt: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        blogId: true,
        seedKeyword: true,
        errorMessage: true,
        lastTriedAt: true,
      },
    }),
    prisma.blogDiscoveryQueue.count({
      where: {
        status: "failed",
        lastTriedAt: { gte: startOfToday },
      },
    }),
    prisma.blogProfile.count(),
    prisma.blogProfile.count({
      where: { createdAt: { gte: startOfToday } },
    }),
    prisma.blogProfile.count({
      where: { lastAnalyzedAt: { gte: startOfToday } },
    }),
    prisma.blogProfile.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.blogProfile.findFirst({
      where: { lastAnalyzedAt: { not: null } },
      orderBy: { lastAnalyzedAt: "desc" },
      select: { lastAnalyzedAt: true },
    }),
    prisma.blogMetricSnapshot.count(),
    prisma.blogMetricSnapshot.count({
      where: { createdAt: { gte: startOfToday } },
    }),
    prisma.blogMetricSnapshot.findFirst({
      orderBy: { analyzedAt: "desc" },
      select: { analyzedAt: true },
    }),
    prisma.blogRankSnapshot.count(),
    prisma.blogRankSnapshot.findFirst({
      orderBy: { calculatedAt: "desc" },
      select: {
        calculatedAt: true,
        totalBlogsCount: true,
        rankSource: true,
      },
    }),
  ]);

  const statusCounts = new Map(queueByStatus.map((row) => [row.status, row._count._all]));
  const latestCalculatedAt = latestRank?.calculatedAt ?? null;
  const latestTopRanks = latestCalculatedAt
    ? await prisma.blogRankSnapshot.findMany({
        where: {
          calculatedAt: latestCalculatedAt,
          overallRank: { not: null },
        },
        orderBy: { overallRank: "asc" },
        take: 10,
        select: {
          blogId: true,
          overallRank: true,
          topicRank: true,
          officialBlogTopic: true,
        },
      })
    : [];

  const topBlogIds = latestTopRanks.map((row) => row.blogId);
  const latestMetrics = topBlogIds.length
    ? await prisma.blogMetricSnapshot.findMany({
        where: { blogId: { in: topBlogIds } },
        orderBy: [{ analyzedAt: "desc" }, { createdAt: "desc" }],
        select: {
          blogId: true,
          totalScore: true,
        },
      })
    : [];
  const totalScoreByBlogId = new Map<string, number | null>();
  for (const metric of latestMetrics) {
    if (!totalScoreByBlogId.has(metric.blogId)) {
      totalScoreByBlogId.set(metric.blogId, metric.totalScore);
    }
  }

  const latestDiscoveredAt = latestQueueDiscovered?.discoveredAt ?? null;
  const latestAnalyzedAt = latestQueueAnalyzed?.analyzedAt ?? null;
  const latestRankCalculatedAt = latestRank?.calculatedAt ?? null;
  const warnings: string[] = [];
  const discoveryOk = withinMs(latestDiscoveredAt, generatedAt, oneDayMs);
  const analyzeOk = withinMs(latestAnalyzedAt, generatedAt, oneDayMs);
  const rankOk = withinMs(latestRankCalculatedAt, generatedAt, sevenDaysMs);

  if (!discoveryOk) warnings.push("최근 24시간 안에 후보 수집 기록이 없습니다.");
  if (!analyzeOk) warnings.push("최근 24시간 안에 후보 분석 완료 기록이 없습니다.");
  if (!rankOk) warnings.push("최근 7일 안에 랭킹 스냅샷 생성 기록이 없습니다.");
  if (failedCountToday > 0) warnings.push(`오늘 실패한 후보 분석/처리가 ${failedCountToday}건 있습니다.`);

  return NextResponse.json({
    ok: true,
    generatedAt: generatedAt.toISOString(),
    queue: {
      total: queueTotal,
      pending: statusCounts.get("pending") ?? 0,
      analyzed: statusCounts.get("analyzed") ?? 0,
      failed: statusCounts.get("failed") ?? 0,
      latestDiscoveredAt: isoOrNull(latestDiscoveredAt),
      latestAnalyzedAt: isoOrNull(latestAnalyzedAt),
      latestFailedAt: isoOrNull(latestQueueFailed?.lastTriedAt),
      recentFailedItems: recentFailedItems.map((item) => ({
        blogId: item.blogId,
        seedKeyword: item.seedKeyword,
        errorMessage: shortError(item.errorMessage),
        lastTriedAt: isoOrNull(item.lastTriedAt),
      })),
    },
    profiles: {
      total: profileTotal,
      createdToday: profilesCreatedToday,
      analyzedToday: profilesAnalyzedToday,
      latestCreatedAt: isoOrNull(latestProfileCreated?.createdAt),
      latestAnalyzedAt: isoOrNull(latestProfileAnalyzed?.lastAnalyzedAt),
    },
    metrics: {
      total: metricTotal,
      createdToday: metricsCreatedToday,
      latestAnalyzedAt: isoOrNull(latestMetricAnalyzed?.analyzedAt),
    },
    ranks: {
      total: rankTotal,
      latestCalculatedAt: isoOrNull(latestRank?.calculatedAt),
      latestTotalBlogsCount: latestRank?.totalBlogsCount ?? null,
      latestRankSource: latestRank?.rankSource ?? null,
      latestTopOverall: latestTopRanks.map((rank) => {
        const totalScore = totalScoreByBlogId.get(rank.blogId);
        return {
          blogId: rank.blogId,
          overallRank: rank.overallRank,
          topicRank: rank.topicRank,
          officialBlogTopic: rank.officialBlogTopic,
          ...(totalScore == null ? {} : { totalScore }),
        };
      }),
    },
    health: {
      discoveryOk,
      analyzeOk,
      rankOk,
      failedCountToday,
      warnings,
    },
  });
}
