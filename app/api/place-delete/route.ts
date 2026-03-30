import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return NextResponse.json(
        { error: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    await prisma.placeRankHistory.deleteMany({
      where: {
        placeKeyword: {
          placeId,
        },
      },
    });

    await prisma.placeKeyword.deleteMany({
      where: {
        placeId,
      },
    });

    await prisma.place.delete({
      where: {
        id: placeId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("place-delete error", error);
    return NextResponse.json(
      { error: "매장 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}