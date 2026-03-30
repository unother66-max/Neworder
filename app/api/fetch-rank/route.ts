import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const keywords = await prisma.placeKeyword.findMany({
      where: {
        isTracking: true,
      },
      include: {
        place: true,
      },
    });

    for (const item of keywords) {
      const fakeRank = Math.floor(Math.random() * 10) + 1;

      await prisma.placeRankHistory.create({
        data: {
          placeKeywordId: item.id,
          rank: fakeRank,
        },
      });
    }

    return Response.json({
      ok: true,
      count: keywords.length,
      message: "자동추적 테스트 저장 완료",
    });
  } catch (error) {
    console.error("fetch-rank error:", error);
    return Response.json(
      {
        ok: false,
        message: "자동추적 테스트 실패",
      },
      { status: 500 }
    );
  }
}