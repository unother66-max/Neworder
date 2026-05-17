import { NextRequest, NextResponse } from "next/server";
import {
  collectLightBlogAnalysisSnapshot,
  persistLightBlogAnalysisHistory,
  type LightBlogCollectResult,
} from "@/lib/blog-analysis-light";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AnalyzeResult = {
  blogId: string;
  status: "analyzed" | "failed";
  error?: string;
};

function authorizeCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

function parseLimit(value: string | null): number {
  const n = value === null ? NaN : Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(10, n);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeStoredInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function sanitizeStoredFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function computeRecentActivityScore(postingFrequency: number | null | undefined): number | null {
  const frequency = sanitizeStoredFloat(postingFrequency);
  if (frequency === null) return null;
  return Math.min(100, Math.max(0, frequency * 100));
}

async function selectPendingCandidates(limit: number) {
  const pendingRows = await prisma.blogDiscoveryQueue.findMany({
    where: { status: "pending" },
    orderBy: [{ priority: "desc" }, { discoveredAt: "asc" }],
    take: Math.min(50, limit * 5),
    select: {
      id: true,
      blogId: true,
      blogUrl: true,
      seedKeyword: true,
      priority: true,
      discoveredAt: true,
    },
  });

  const blogIds = pendingRows.map((row) => row.blogId);
  const existingProfiles = blogIds.length
    ? await prisma.blogProfile.findMany({
        where: { blogId: { in: blogIds } },
        select: { blogId: true },
      })
    : [];
  const profiledBlogIds = new Set(existingProfiles.map((profile) => profile.blogId));

  const alreadyProfiled = pendingRows.filter((row) => profiledBlogIds.has(row.blogId));
  if (alreadyProfiled.length > 0) {
    const now = new Date();
    await prisma.blogDiscoveryQueue.updateMany({
      where: { id: { in: alreadyProfiled.map((row) => row.id) } },
      data: {
        status: "analyzed",
        analyzedAt: now,
        lastTriedAt: now,
        errorMessage: null,
      },
    });
  }

  return pendingRows.filter((row) => !profiledBlogIds.has(row.blogId)).slice(0, limit);
}

async function persistRankingPoolSnapshot(blogId: string, snap: LightBlogCollectResult): Promise<void> {
  const now = new Date();

  await prisma.blogProfile.upsert({
    where: { blogId },
    create: {
      blogId,
      blogUrl: `https://blog.naver.com/${blogId}`,
      blogName: snap.nickname || null,
      nickname: snap.nickname || null,
      profileImage: null,
      officialBlogTopic: snap.blogTopic,
      postCount: sanitizeStoredInt(snap.postCount),
      scrapCount: null,
      neighborCount: sanitizeStoredInt(snap.subscriberCount),
      postingFrequency: sanitizeStoredFloat(snap.postingFrequency),
      lastAnalyzedAt: now,
    },
    update: {
      blogUrl: `https://blog.naver.com/${blogId}`,
      blogName: snap.nickname || null,
      nickname: snap.nickname || null,
      officialBlogTopic: snap.blogTopic,
      postCount: sanitizeStoredInt(snap.postCount),
      neighborCount: sanitizeStoredInt(snap.subscriberCount),
      postingFrequency: sanitizeStoredFloat(snap.postingFrequency),
      lastAnalyzedAt: now,
    },
  });

  await prisma.blogMetricSnapshot.create({
    data: {
      blogId,
      influenceScore: sanitizeStoredFloat(snap.blogScorePayload.influenceScore),
      keywordInfluenceScore: sanitizeStoredFloat(snap.blogScorePayload.keywordInfluenceScore),
      contentInfluenceScore: sanitizeStoredFloat(snap.blogScorePayload.contentInfluenceScore),
      validKeywordCount: sanitizeStoredInt(snap.validKeywordCount),
      recentActivityScore: computeRecentActivityScore(snap.postingFrequency),
      totalScore: sanitizeStoredFloat(snap.blogScorePayload.totalScore),
      analyzedAt: now,
    },
  });
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const candidates = await selectPendingCandidates(limit);
  const results: AnalyzeResult[] = [];
  let analyzed = 0;
  let failed = 0;

  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) await sleep(750);

    const attemptedAt = new Date();
    try {
      console.log("[cron blog-discovery-analyze] analyzing", {
        blogId: candidate.blogId,
        seedKeyword: candidate.seedKeyword,
      });

      const snap = await collectLightBlogAnalysisSnapshot(candidate.blogId);
      await persistLightBlogAnalysisHistory(prisma, candidate.blogId, snap);
      await persistRankingPoolSnapshot(candidate.blogId, snap);

      await prisma.blogDiscoveryQueue.update({
        where: { id: candidate.id },
        data: {
          status: "analyzed",
          analyzedAt: new Date(),
          lastTriedAt: attemptedAt,
          errorMessage: null,
        },
      });

      analyzed += 1;
      results.push({ blogId: candidate.blogId, status: "analyzed" });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[cron blog-discovery-analyze] failed", {
        blogId: candidate.blogId,
        error: message,
      });

      await prisma.blogDiscoveryQueue.update({
        where: { id: candidate.id },
        data: {
          status: "failed",
          lastTriedAt: attemptedAt,
          errorMessage: message.slice(0, 500),
        },
      });

      results.push({ blogId: candidate.blogId, status: "failed", error: message.slice(0, 160) });
    }
  }

  return NextResponse.json({
    ok: true,
    limit,
    selected: candidates.length,
    analyzed,
    failed,
    results,
  });
}
