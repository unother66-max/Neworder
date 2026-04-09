import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return NextResponse.json({ error: "placeId가 필요합니다." }, { status: 400 });
    }

    const place = await prisma.place.findUnique({ where: { id: placeId } });

    if (!place || place.userId !== userId || place.type !== "kakao-rank") {
      return NextResponse.json({ error: "매장을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.place.delete({ where: { id: placeId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("kakao-place-delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "매장 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
