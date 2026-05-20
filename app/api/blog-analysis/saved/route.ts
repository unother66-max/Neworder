import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(String(raw ?? "20"), 10);
  if (!Number.isFinite(n)) return 20;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

async function getSessionUserId(): Promise<string | null> {
  try {
    const session = (await getServerSession(authOptions as never)) as {
      user?: { id?: string };
    } | null;
    const uid = session?.user?.id;
    return typeof uid === "string" && uid.trim() ? uid.trim() : null;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanBooleanPatch(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

async function findSavedRow(blogId: string, userId: string | null) {
  if (userId) {
    return prisma.blogAnalysisSaved.findFirst({
      where: { userId, blogId },
      orderBy: { updatedAt: "desc" },
    });
  }

  return prisma.blogAnalysisSaved.findFirst({
    where: { blogId },
    orderBy: { updatedAt: "desc" },
  });
}

async function findLatestHistory(blogId: string) {
  return prisma.blogAnalysisHistory.findFirst({
    where: { blogId },
    orderBy: { analyzedAt: "desc" },
    select: {
      blogId: true,
      nickname: true,
      blogName: true,
      profileImage: true,
      blogTopic: true,
      validKeywordCount: true,
      analyzedAt: true,
      totalRank: true,
      topicRank: true,
      level: true,
      grade: true,
    },
  });
}

export async function GET(req: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  try {
    const { searchParams } = new URL(req.url);
    const limit = clampLimit(searchParams.get("limit"));
    const sessionUserId = await getSessionUserId();

    const savedRows = await prisma.blogAnalysisSaved.findMany({
      where: sessionUserId
        ? { OR: [{ userId: sessionUserId }, { userId: null }] }
        : undefined,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      take: Math.max(limit * 5, 100),
    });

    const blogIds = [...new Set(savedRows.map((row) => row.blogId))];
    const histories = blogIds.length
      ? await prisma.blogAnalysisHistory.findMany({
          where: { blogId: { in: blogIds } },
          orderBy: { analyzedAt: "desc" },
          select: {
            blogId: true,
            nickname: true,
            blogName: true,
            profileImage: true,
            blogTopic: true,
            validKeywordCount: true,
            analyzedAt: true,
            totalRank: true,
            topicRank: true,
            level: true,
            grade: true,
          },
        })
      : [];

    const latestByBlogId = new Map<string, (typeof histories)[number]>();
    for (const history of histories) {
      if (!latestByBlogId.has(history.blogId)) latestByBlogId.set(history.blogId, history);
    }

    const selectedSavedByBlogId = new Map<string, (typeof savedRows)[number]>();
    for (const saved of savedRows) {
      const current = selectedSavedByBlogId.get(saved.blogId);
      if (!current) {
        selectedSavedByBlogId.set(saved.blogId, saved);
        continue;
      }

      if (saved.isPinned !== current.isPinned) {
        if (saved.isPinned) selectedSavedByBlogId.set(saved.blogId, saved);
        continue;
      }

      const savedLatestAt = latestByBlogId.get(saved.blogId)?.analyzedAt ?? saved.updatedAt;
      const currentLatestAt = latestByBlogId.get(current.blogId)?.analyzedAt ?? current.updatedAt;
      const savedTime = Math.max(saved.updatedAt.getTime(), savedLatestAt.getTime());
      const currentTime = Math.max(current.updatedAt.getTime(), currentLatestAt.getTime());
      if (savedTime > currentTime) selectedSavedByBlogId.set(saved.blogId, saved);
    }

    const items = [...selectedSavedByBlogId.values()]
      .map((saved) => {
        const latest = latestByBlogId.get(saved.blogId);
        const analyzedAt = latest?.analyzedAt ?? saved.updatedAt;
        return {
          id: saved.id,
          blogId: saved.blogId,
          nickname: saved.nickname ?? latest?.nickname ?? null,
          blogName: saved.blogName ?? latest?.blogName ?? null,
          profileImage: saved.profileImage ?? latest?.profileImage ?? null,
          blogTopic: saved.blogTopic ?? latest?.blogTopic ?? null,
          validKeywordCount: latest?.validKeywordCount ?? null,
          analyzedAt: analyzedAt.toISOString(),
          totalRank: latest?.totalRank ?? null,
          topicRank: latest?.topicRank ?? null,
          level: latest?.level ?? null,
          grade: latest?.grade ?? null,
          isPinned: saved.isPinned,
          autoTracking: saved.autoTracking,
        };
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const ta = new Date(a.analyzedAt).getTime();
        const tb = new Date(b.analyzedAt).getTime();
        if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
        if (!Number.isFinite(ta)) return 1;
        if (!Number.isFinite(tb)) return -1;
        return tb - ta;
      })
      .slice(0, limit);

    return NextResponse.json({ ok: true as const, items });
  } catch (e) {
    console.warn("[blog-analysis/saved] 목록 조회 실패:", e);
    return NextResponse.json({ ok: true as const, items: [] });
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  try {
    const body = (await req.json()) as {
      blogId?: unknown;
      isPinned?: unknown;
      autoTracking?: unknown;
    };
    const blogId = cleanString(body.blogId);
    if (!blogId) {
      return NextResponse.json({ ok: false as const, error: "blogId가 필요합니다." }, { status: 400 });
    }

    const isPinned = cleanBooleanPatch(body.isPinned);
    const autoTracking = cleanBooleanPatch(body.autoTracking);
    if (isPinned === undefined && autoTracking === undefined) {
      return NextResponse.json(
        { ok: false as const, error: "변경할 값이 필요합니다." },
        { status: 400 }
      );
    }

    const sessionUserId = await getSessionUserId();
    const latest = await findLatestHistory(blogId);
    const existing = await findSavedRow(blogId, sessionUserId);
    const data = {
      ...(isPinned !== undefined ? { isPinned } : {}),
      ...(autoTracking !== undefined ? { autoTracking } : {}),
      nickname: latest?.nickname ?? undefined,
      blogName: latest?.blogName ?? undefined,
      profileImage: latest?.profileImage ?? undefined,
      blogTopic: latest?.blogTopic ?? undefined,
    };

    const saved = existing
      ? await prisma.blogAnalysisSaved.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.blogAnalysisSaved.create({
          data: {
            userId: sessionUserId,
            blogId,
            nickname: latest?.nickname ?? null,
            blogName: latest?.blogName ?? null,
            profileImage: latest?.profileImage ?? null,
            blogTopic: latest?.blogTopic ?? null,
            isPinned: isPinned ?? false,
            autoTracking: autoTracking ?? true,
          },
        });

    return NextResponse.json({
      ok: true as const,
      item: {
        blogId: saved.blogId,
        isPinned: saved.isPinned,
        autoTracking: saved.autoTracking,
      },
    });
  } catch (e) {
    console.warn("[blog-analysis/saved] 상태 변경 실패:", e);
    return NextResponse.json({ ok: false as const, error: "상태 변경에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  try {
    const blogId = new URL(req.url).searchParams.get("blogId")?.trim();
    if (!blogId) {
      return NextResponse.json({ ok: false as const, error: "blogId가 필요합니다." }, { status: 400 });
    }

    const sessionUserId = await getSessionUserId();
    await prisma.blogAnalysisSaved.deleteMany({
      where: sessionUserId ? { userId: sessionUserId, blogId } : { blogId },
    });

    return NextResponse.json({ ok: true as const });
  } catch (e) {
    console.warn("[blog-analysis/saved] 삭제 실패:", e);
    return NextResponse.json({ ok: false as const, error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
