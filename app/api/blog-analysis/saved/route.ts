import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 검색 기록: blogId별 최신 스냅샷 목록.
 * 고정(pinned) 순서 영구 저장은 향후 BlogAnalysisSaved 모델로 분리 예정 — 현재 isPinned는 항상 false.
 */

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(String(raw ?? "20"), 10);
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = clampLimit(searchParams.get("limit"));

    const rows = await prisma.$queryRaw<
      Array<{
        blogId: string;
        nickname: string | null;
        blogName: string | null;
        profileImage: string | null;
        blogTopic: string | null;
        validKeywordCount: number | null;
        analyzedAt: Date;
        totalRank: number | null;
        topicRank: number | null;
        level: number | null;
        grade: string | null;
      }>
    >`
      WITH ranked AS (
        SELECT
          "blogId",
          "nickname",
          "blogName",
          "profileImage",
          "blogTopic",
          "validKeywordCount",
          "analyzedAt",
          "totalRank",
          "topicRank",
          "level",
          "grade",
          ROW_NUMBER() OVER (PARTITION BY "blogId" ORDER BY "analyzedAt" DESC) AS rn
        FROM "BlogAnalysisHistory"
      )
      SELECT
        "blogId",
        "nickname",
        "blogName",
        "profileImage",
        "blogTopic",
        "validKeywordCount",
        "analyzedAt",
        "totalRank",
        "topicRank",
        "level",
        "grade"
      FROM ranked
      WHERE rn = 1
      ORDER BY "analyzedAt" DESC
      LIMIT ${limit}
    `;

    const items = rows.map((r) => ({
      blogId: r.blogId,
      nickname: r.nickname,
      blogName: r.blogName,
      profileImage: r.profileImage,
      blogTopic: r.blogTopic,
      validKeywordCount: r.validKeywordCount,
      analyzedAt: r.analyzedAt.toISOString(),
      totalRank: r.totalRank,
      topicRank: r.topicRank,
      level: r.level,
      grade: r.grade,
      isPinned: false as const,
    }));

    return NextResponse.json({ ok: true as const, items });
  } catch (e) {
    console.warn("[blog-analysis/saved] 목록 조회 실패:", e);
    return NextResponse.json({ ok: true as const, items: [] });
  }
}

export async function DELETE(req: Request) {
  try {
    const blogId = new URL(req.url).searchParams.get("blogId")?.trim();
    if (!blogId) {
      return NextResponse.json({ ok: false as const, error: "blogId가 필요합니다." }, { status: 400 });
    }

    await prisma.blogAnalysisHistory.deleteMany({
      where: { blogId },
    });

    return NextResponse.json({ ok: true as const });
  } catch (e) {
    console.warn("[blog-analysis/saved] 삭제 실패:", e);
    return NextResponse.json({ ok: false as const, error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
