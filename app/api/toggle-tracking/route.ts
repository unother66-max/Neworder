import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    const isTracking = Boolean(body.isTracking);

    if (!placeId) {
      return NextResponse.json(
        { ok: false, message: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    const result = await prisma.placeKeyword.updateMany({
      where: {
        placeId,
      },
      data: {
        isTracking,
      },
    });

    return NextResponse.json({
      ok: true,
      updatedCount: result.count,
      isTracking,
    });
  } catch (error) {
    console.error("toggle-tracking error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "자동추적 상태 변경 실패",
      },
      { status: 500 }
    );
  }
}