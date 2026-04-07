import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return NextResponse.json(
        { ok: false, message: "placeId 없음" },
        { status: 400 }
      );
    }

    // 현재 값 조회
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: { reviewPinned: true },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, message: "매장 없음" },
        { status: 404 }
      );
    }

    // 토글
    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        reviewPinned: !place.reviewPinned,
      },
    });

    return NextResponse.json({
      ok: true,
      reviewPinned: updated.reviewPinned,
    });
  } catch (error) {
    console.error("place-review-pin error:", error);
    return NextResponse.json(
      { ok: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}