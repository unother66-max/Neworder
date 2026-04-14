import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader && authHeader === `Bearer ${cronSecret}`) {
      // 통과
    } else if (req.headers.get("x-vercel-cron") === "1") {
      // 통과
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const trackedKeywords = await prisma.placeKeyword.findMany({
      where: {
        isTracking: true,
      },
      include: {
        place: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const origin = req.nextUrl.origin;

    let successCount = 0;
    let failCount = 0;

    for (const keyword of trackedKeywords) {
      try {
        if (!keyword.place?.name) {
          failCount++;
          continue;
        }

        const rankRes = await fetch(`${origin}/api/check-place-rank`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: cronSecret ? `Bearer ${cronSecret}` : "",
          },
          body: JSON.stringify({
            keyword: keyword.keyword,
            targetName: keyword.place.name,
          }),
          cache: "no-store",
        });

        const text = await rankRes.text();

        let rankData: any = null;
        try {
          rankData = text ? JSON.parse(text) : null;
        } catch (error) {
          console.error(
            "cron JSON parse 실패:",
            keyword.keyword,
            text.slice(0, 300)
          );
          failCount++;
          continue;
        }

        if (!rankRes.ok || !rankData?.rank || rankData.rank === "-") {
          console.error("cron rank 조회 실패:", keyword.keyword, rankData);
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

        await prisma.rankHistory.create({
          data: {
            placeId: keyword.placeId,
            keyword: keyword.keyword,
            rank: numericRank,
          },
        });

        await prisma.placeKeyword.update({
          where: { id: keyword.id },
          data: { isTracking: keyword.isTracking },
        });

        successCount++;
      } catch (error) {
        console.error("cron keyword update error", keyword.keyword, error);
        failCount++;
      }
    }

    console.log("✅ cron 완료:", {
  total: trackedKeywords.length,
  successCount,
  failCount,
});

return NextResponse.json({
  ok: true,
  total: trackedKeywords.length,
  successCount,
  failCount,
});
  } catch (error) {
    console.error("place-tracking cron error", error);
    return NextResponse.json(
      { error: "자동 업데이트 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}