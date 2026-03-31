import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const keywords = await prisma.placeKeyword.findMany();

    for (const item of keywords) {
      const fakeRank = Math.floor(Math.random() * 10) + 1;

      await prisma.rankHistory.create({
        data: {
          placeId: item.placeId,
          keyword: item.keyword,
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
        message: error instanceof Error ? error.message : "자동추적 실패",
      },
      { status: 500 }
    );
  }
}