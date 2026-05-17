import { NextRequest, NextResponse } from "next/server";
import { createBlogRankSnapshot } from "@/lib/blog-rank-snapshot";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authorizeCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await createBlogRankSnapshot(prisma);
    return NextResponse.json({
      ok: true,
      rankSource: "postlabs",
      calculatedAt: result.calculatedAt.toISOString(),
      totalBlogsCount: result.totalBlogsCount,
      savedCount: result.savedCount,
      topicCounts: result.topicCounts,
      topOverall: result.topOverall,
    });
  } catch (error) {
    console.error("[cron blog-rank-snapshot] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Rank snapshot failed",
      },
      { status: 500 }
    );
  }
}
