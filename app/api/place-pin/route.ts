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
        { ok: false, message: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        rankPinned: true,
      },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, message: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const nextPinned = !place.rankPinned;

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: {
        rankPinned: nextPinned,
        rankPinnedAt: nextPinned ? new Date() : null,
      },
      select: {
        id: true,
        rankPinned: true,
      },
    });

    return NextResponse.json({
      ok: true,
      place: updated,
    });
  } catch (error) {
    console.error("place-pin error:", error);

    return NextResponse.json(
      { ok: false, message: "핀 변경 실패" },
      { status: 500 }
    );
  }
}