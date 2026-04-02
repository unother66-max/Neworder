import { prisma } from "../../../lib/prisma";
import { getKeywordSearchVolume } from "../../../lib/getKeywordSearchVolume";

type TrackResult = {
  placeKeywordId: string;
  keyword: string;
  placeId: string;
  rank: number;
  mobileVolume: number;
  pcVolume: number;
  totalVolume: number;
};

async function runTracking(placeKeywordId?: string) {
  const keywords = await prisma.placeKeyword.findMany({
    where: placeKeywordId ? { id: placeKeywordId } : undefined,
  });

  if (!keywords.length) {
    return {
      ok: false,
      count: 0,
      items: [] as TrackResult[],
      message: placeKeywordId
        ? "해당 키워드를 찾을 수 없습니다."
        : "추적할 키워드가 없습니다.",
    };
  }

  const results: TrackResult[] = [];

  for (const item of keywords) {
    const fakeRank = Math.floor(Math.random() * 10) + 1;

    const volume = await getKeywordSearchVolume(item.keyword);

    await prisma.rankHistory.create({
      data: {
        placeId: item.placeId,
        keyword: item.keyword,
        rank: fakeRank,
      },
    });

    await prisma.placeKeyword.update({
      where: { id: item.id },
      data: {
        mobileVolume: volume.mobile,
        pcVolume: volume.pc,
        totalVolume: volume.total,
      },
    });

    results.push({
      placeKeywordId: item.id,
      keyword: item.keyword,
      placeId: item.placeId,
      rank: fakeRank,
      mobileVolume: volume.mobile,
      pcVolume: volume.pc,
      totalVolume: volume.total,
    });
  }

  return {
    ok: true,
    count: keywords.length,
    items: results,
    message:
      keywords.length === 1
        ? "키워드 1개 자동추적 저장 완료"
        : "자동추적 저장 완료",
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const placeKeywordId = searchParams.get("placeKeywordId")?.trim() || undefined;

    const result = await runTracking(placeKeywordId);
    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    console.error("fetch-rank GET error:", error);

    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "자동추적 실패",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    let body: { placeKeywordId?: string } = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const placeKeywordId = String(body.placeKeywordId || "").trim() || undefined;

    const result = await runTracking(placeKeywordId);
    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    console.error("fetch-rank POST error:", error);

    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "자동추적 실패",
      },
      { status: 500 }
    );
  }
}