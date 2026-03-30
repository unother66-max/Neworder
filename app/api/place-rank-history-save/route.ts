import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const placeKeywordId = String(body.placeKeywordId || "").trim();
    const rawRank = body.rank;

    if (!placeKeywordId) {
      return NextResponse.json(
        { error: "placeKeywordId가 없습니다." },
        { status: 400 }
      );
    }

    const rank =
      rawRank === null || rawRank === undefined || rawRank === ""
        ? null
        : Number(rawRank);

    if (rank !== null && Number.isNaN(rank)) {
      return NextResponse.json(
        { error: "rank 값이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const existingToday = await prisma.placeRankHistory.findFirst({
      where: {
        placeKeywordId,
        checkedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        checkedAt: "desc",
      },
    });

    if (existingToday) {
      const updated = await prisma.placeRankHistory.update({
        where: {
          id: existingToday.id,
        },
        data: {
          rank,
          checkedAt: now,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "updated",
        history: updated,
      });
    }

    const created = await prisma.placeRankHistory.create({
      data: {
        placeKeywordId,
        rank,
        checkedAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "created",
      history: created,
    });
  } catch (error) {
    console.error("place-rank-history-save error", error);

    return NextResponse.json(
      { error: "순위 히스토리 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}