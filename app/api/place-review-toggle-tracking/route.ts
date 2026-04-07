import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    const enabled = Boolean(body.enabled);

    if (!placeId) {
      return NextResponse.json(
        { ok: false, message: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        reviewAutoTracking: enabled,
      },
      select: {
        id: true,
        reviewAutoTracking: true,
      },
    });

    return NextResponse.json({
      ok: true,
      place: updated,
    });
  } catch (error) {
    console.error("place-review-toggle-tracking error:", error);

    return NextResponse.json(
      { ok: false, message: "리뷰 자동추적 변경 실패" },
      { status: 500 }
    );
  }
}