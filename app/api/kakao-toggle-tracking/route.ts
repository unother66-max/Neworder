import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ ok: false, message: "로그인 필요" }, { status: 401 });
    }

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    const enabled = Boolean(body.enabled);

    if (!placeId) {
      return NextResponse.json({ ok: false, message: "placeId가 없습니다." }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, userId },
      select: { id: true },
    });

    if (!place) {
      return NextResponse.json({ ok: false, message: "매장을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.place.update({
      where: { id: placeId },
      data: { kakaoAutoTracking: enabled },
      select: { id: true, kakaoAutoTracking: true },
    });

    return NextResponse.json({ ok: true, place: updated });
  } catch (error) {
    console.error("kakao-toggle-tracking error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "자동추적 변경 실패" },
      { status: 500 }
    );
  }
}
