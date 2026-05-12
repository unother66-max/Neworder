import { NextRequest, NextResponse } from "next/server";
import {
  collectLightBlogAnalysisSnapshot,
  persistLightBlogAnalysisHistory,
} from "@/lib/blog-analysis-light";
import { pickLatestHistoryPerBlogId } from "@/lib/blog-analysis-history-rank";
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

  const rows = await prisma.blogAnalysisHistory.findMany({
    select: { blogId: true, analyzedAt: true },
    orderBy: { analyzedAt: "desc" },
  });

  const latestPerBlog = pickLatestHistoryPerBlogId(rows);
  const stale = latestPerBlog.filter((r) => r.analyzedAt.getTime() < cutoffMs);
  stale.sort((a, b) => a.analyzedAt.getTime() - b.analyzedAt.getTime());

  const skippedRecent = latestPerBlog.length - stale.length;
  const totalTargets = stale.length;
  const queue = stale.slice(0, limit).map((r) => r.blogId);

  console.log("[cron blog-analysis-light] start", {
    limit,
    totalStale: totalTargets,
    skippedRecent,
    attempted: queue.length,
    trackedBlogs: latestPerBlog.length,
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
