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

    // 순위만 저장돼도 PlaceKeyword.updatedAt이 갱신되게 해 목록의 "마지막 업데이트"가 맞게 나온다.
    await prisma.placeKeyword.update({
      where: { id: placeKeywordId },
      data: { isTracking: placeKeyword.isTracking },
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