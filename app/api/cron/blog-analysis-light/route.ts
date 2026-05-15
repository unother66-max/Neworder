import { NextRequest, NextResponse } from "next/server";
import {
  collectLightBlogAnalysisSnapshot,
  persistLightBlogAnalysisHistory,
} from "@/lib/blog-analysis-light";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CronBlogResult = {
  blogId: string;
  status: "ok" | "failed";
  totalRank?: number | null;
  topicRank?: number | null;
  error?: string;
};

function authorizeCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 100);
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(req.nextUrl.searchParams);
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

  // 내부 자동 추적 풀만 대상으로 경량 스냅샷을 쌓습니다.
  // 방문자/최근글/기본 정보는 가볍게 갱신하고, 전체 순위·주제 순위·유효키워드 히스토리는
  // 내부 DB 기준으로 유지합니다. 추후 1~2주 단위 batch 재계산 job으로 확장할 예정입니다.
  const savedRows = await prisma.blogAnalysisSaved.findMany({
    where: { autoTracking: true },
    select: { blogId: true, updatedAt: true },
    orderBy: { updatedAt: "asc" },
  });

  const savedByBlogId = new Map<string, (typeof savedRows)[number]>();
  for (const row of savedRows) {
    if (!savedByBlogId.has(row.blogId)) savedByBlogId.set(row.blogId, row);
  }
  const savedTargets = [...savedByBlogId.values()];
  const savedBlogIds = savedTargets.map((row) => row.blogId);
  const historyRows = savedBlogIds.length
    ? await prisma.blogAnalysisHistory.findMany({
        where: { blogId: { in: savedBlogIds } },
        select: { blogId: true, analyzedAt: true },
        orderBy: { analyzedAt: "desc" },
      })
    : [];

  const latestHistoryByBlogId = new Map<string, Date>();
  for (const row of historyRows) {
    if (!latestHistoryByBlogId.has(row.blogId)) {
      latestHistoryByBlogId.set(row.blogId, row.analyzedAt);
    }
  }

  const stale = savedTargets.filter((row) => {
    const latestAnalyzedAt = latestHistoryByBlogId.get(row.blogId);
    if (!latestAnalyzedAt) return true;
    return latestAnalyzedAt.getTime() < cutoffMs;
  });
  stale.sort((a, b) => {
    const at = latestHistoryByBlogId.get(a.blogId)?.getTime() ?? 0;
    const bt = latestHistoryByBlogId.get(b.blogId)?.getTime() ?? 0;
    return at - bt;
  });

  const skippedRecent = savedTargets.length - stale.length;
  const totalTargets = stale.length;
  const queue = stale.slice(0, limit).map((r) => r.blogId);

  console.log("[cron blog-analysis-light] start", {
    limit,
    totalStale: totalTargets,
    skippedRecent,
    attempted: queue.length,
    trackedBlogs: savedTargets.length,
  });

  const results: CronBlogResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const blogId of queue) {
    try {
      const snap = await collectLightBlogAnalysisSnapshot(blogId);
      const { totalRank, topicRank } = await persistLightBlogAnalysisHistory(prisma, blogId, snap);
      processed += 1;
      results.push({ blogId, status: "ok", totalRank, topicRank });
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[cron blog-analysis-light] failed", blogId, msg);
      results.push({ blogId, status: "failed", error: msg });
    }
  }

  console.log("[cron blog-analysis-light] done", {
    processed,
    failed,
    attempted: queue.length,
  });

  return NextResponse.json({
    ok: true,
    totalTargets,
    processed,
    skipped: skippedRecent,
    failed,
    attempted: queue.length,
    limit,
    results,
  });
}
