import { prisma } from "../../../lib/prisma";
import { getKeywordSearchVolume } from "../../../lib/getKeywordSearchVolume";

type TrackResult = {
  placeKeywordId: string;
  keyword: string;
  placeId: string;
  mobileVolume: number;
  pcVolume: number;
  totalVolume: number;
};

async function runTracking(placeKeywordId?: string) {
  const keywords = await prisma.placeKeyword.findMany({
    where: placeKeywordId ? { id: placeKeywordId } : undefined,
    orderBy: {
      createdAt: "asc",
    },
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

  console.log("🚀 fetch-rank 시작");
  console.log("대상 키워드 수:", keywords.length);
  console.log(
    "대상 키워드 목록:",
    keywords.map((item) => item.keyword)
  );

  for (const item of keywords) {
    try {
      const volume = await getKeywordSearchVolume(item.keyword);

      console.log("🔍 fetch-rank keyword:", item.keyword);
      console.log("📊 fetch-rank volume:", {
        mobile: volume.mobile,
        pc: volume.pc,
        total: volume.total,
      });

      await prisma.placeKeyword.update({
        where: { id: item.id },
        data: {
          mobileVolume: volume.mobile,
          pcVolume: volume.pc,
          totalVolume: volume.total,
        },
      });

      console.log("✅ 검색량 저장 완료:", {
        keyword: item.keyword,
        mobileVolume: volume.mobile,
        pcVolume: volume.pc,
        totalVolume: volume.total,
      });

      results.push({
        placeKeywordId: item.id,
        keyword: item.keyword,
        placeId: item.placeId,
        mobileVolume: volume.mobile,
        pcVolume: volume.pc,
        totalVolume: volume.total,
      });
    } catch (error) {
      console.error("❌ fetch-rank 개별 키워드 실패:", item.keyword, error);
    }
  }

  console.log("✅ fetch-rank 완료:", {
    count: results.length,
    items: results.map((item) => ({
      keyword: item.keyword,
      totalVolume: item.totalVolume,
      mobileVolume: item.mobileVolume,
      pcVolume: item.pcVolume,
    })),
  });

  return {
    ok: true,
    count: keywords.length,
    items: results,
    message:
      keywords.length === 1
        ? "키워드 1개 검색량 업데이트 완료"
        : "검색량 업데이트 완료",
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const placeKeywordId =
      searchParams.get("placeKeywordId")?.trim() || undefined;

    const result = await runTracking(placeKeywordId);
    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    console.error("fetch-rank GET error:", error);

    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "검색량 업데이트 실패",
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

    const placeKeywordId =
      String(body.placeKeywordId || "").trim() || undefined;

    const result = await runTracking(placeKeywordId);
    return Response.json(result, { status: result.ok ? 200 : 404 });
  } catch (error) {
    console.error("fetch-rank POST error:", error);

    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "검색량 업데이트 실패",
      },
      { status: 500 }
    );
  }
}