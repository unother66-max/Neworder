import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function extractPublicPlaceId(placeUrl?: string | null) {
  if (!placeUrl) return "";

  const matched =
    placeUrl.match(/restaurant\/(\d+)/) ||
    placeUrl.match(/place\/(\d+)/) ||
    placeUrl.match(/placeId=(\d+)/) ||
    placeUrl.match(/entry\/place\/(\d+)/);

  return matched?.[1] ?? "";
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const trackedKeywords = await prisma.placeKeyword.findMany({
  where: {}, // 👉 테스트용
  include: { place: true },
});

    const origin = req.nextUrl.origin;

    let successCount = 0;
    let failCount = 0;

    for (const keyword of trackedKeywords) {
      try {
        const publicPlaceId = extractPublicPlaceId(keyword.place?.placeUrl);

        if (!publicPlaceId) {
          failCount++;
          continue;
        }

        // 👉 랭크 조회
        const rankRes = await fetch(`${origin}/api/check-place-rank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: keyword.keyword,
            placeId: publicPlaceId,
          }),
        });

        const rankData = await rankRes.json();

        if (!rankRes.ok || !rankData.rank || rankData.rank === "-") {
          failCount++;
          continue;
        }

        const numericRank = Number(
          String(rankData.rank).match(/\d+/)?.[0] ?? ""
        );

        if (Number.isNaN(numericRank)) {
          failCount++;
          continue;
        }

        // ✅ DB 저장
        await prisma.rankHistory.create({
          data: {
            placeId: keyword.placeId,
            keyword: keyword.keyword,
            rank: numericRank,
          },
        });

        successCount++;
      } catch (error) {
        console.error("cron error", keyword.keyword, error);
        failCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      total: trackedKeywords.length,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error("cron error", error);
    return NextResponse.json(
      { error: "자동 업데이트 중 오류" },
      { status: 500 }
    );
  }
}