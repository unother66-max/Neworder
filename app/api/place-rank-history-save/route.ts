import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeKeywordId = String(body.placeKeywordId || "").trim();
    const rank = Number(body.rank);

    if (!placeKeywordId) {
      return Response.json(
        { ok: false, message: "placeKeywordId가 없습니다." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(rank)) {
      return Response.json(
        { ok: false, message: "rank 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const placeKeyword = await prisma.placeKeyword.findUnique({
      where: {
        id: placeKeywordId,
      },
    });

    if (!placeKeyword) {
      return Response.json(
        { ok: false, message: "키워드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.rankHistory.create({
      data: {
        placeId: placeKeyword.placeId,
        keyword: placeKeyword.keyword,
        rank,
      },
    });

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