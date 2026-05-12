import { NextResponse } from "next/server";
import type { BlogAnalysisHistoryPoint } from "@/lib/blog-analysis-types";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const blogId = searchParams.get("blogId")?.trim();
    if (!blogId) {
      return NextResponse.json({ error: "blogId가 필요합니다." }, { status: 400 });
    }

    const daysRaw = searchParams.get("days");
    let days = Number.parseInt(String(daysRaw ?? "14"), 10);
    if (!Number.isFinite(days)) days = 14;
    days = Math.min(366, Math.max(1, Math.floor(days)));

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.blogAnalysisHistory.findMany({
      where: {
        blogId,
        analyzedAt: { gte: since },
      },
      orderBy: { analyzedAt: "asc" },
      select: {
        analyzedAt: true,
        totalRank: true,
        topicRank: true,
        validKeywordCount: true,
        totalScore: true,
        visitorCount: true,
        postCount: true,
        subscriberCount: true,
      },
    });

    const points: BlogAnalysisHistoryPoint[] = rows.map((r) => ({
      analyzedAt: r.analyzedAt.toISOString(),
      totalRank: r.totalRank,
      topicRank: r.topicRank,
      validKeywordCount: r.validKeywordCount,
      totalScore: r.totalScore,
      visitorCount: r.visitorCount,
      postCount: r.postCount,
      subscriberCount: r.subscriberCount,
    }));

    return NextResponse.json({ ok: true as const, points });
  } catch (e) {
    console.warn("[blog-analysis/history] 조회 실패:", e);
    return NextResponse.json({ ok: true as const, points: [] as BlogAnalysisHistoryPoint[] });
  }
}
