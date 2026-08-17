import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

type SessionWithUserId = {
  user?: {
    id?: string | null;
  } | null;
} | null;

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithUserId;
    const userId = session?.user?.id;

    if (!userId) {
      return Response.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const placeKeywordId = String(body.placeKeywordId || "").trim();
    const rank = Number(body.rank);

    if (!placeKeywordId) {
      return Response.json(
        { ok: false, message: "placeKeywordId가 없습니다." },
        { status: 400 }
      );
    }

    if (!Number.isSafeInteger(rank) || rank <= 0) {
      return Response.json(
        { ok: false, message: "rank 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const placeKeyword = await prisma.placeKeyword.findFirst({
      where: {
        id: placeKeywordId,
        place: {
          userId,
          type: "rank",
        },
      },
    });

    if (!placeKeyword) {
      return Response.json(
        { ok: false, message: "키워드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const savedAt = new Date();
    await prisma.$transaction([
      prisma.rankHistory.create({
        data: {
          placeId: placeKeyword.placeId,
          keyword: placeKeyword.keyword,
          rank,
          source: "manual",
          resultStatus: "FOUND",
          rankLabel: `${rank}위`,
        },
      }),
      prisma.placeKeyword.update({
        where: { id: placeKeywordId },
        data: {
          lastAttemptAt: savedAt,
          lastSuccessAt: savedAt,
          lastFailureCode: null,
        },
      }),
    ]);

    return Response.json({
      ok: true,
      message: "순위 히스토리 저장 완료",
    });
  } catch (error) {
    console.error("place-rank-history-save error:", error);

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "순위 히스토리 저장 실패",
      },
      { status: 500 }
    );
  }
}
