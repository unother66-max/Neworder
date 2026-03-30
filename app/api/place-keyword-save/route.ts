import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      placeId,
      keyword,
      mobileVolume,
      pcVolume,
      totalVolume,
    } = body ?? {};

    if (!placeId || !keyword) {
      return NextResponse.json(
        { error: "placeId와 keyword는 필수입니다." },
        { status: 400 }
      );
    }

    const placeKeyword = await prisma.placeKeyword.upsert({
      where: {
        placeId_keyword: {
          placeId,
          keyword,
        },
      },
      update: {
        mobileVolume: mobileVolume ?? null,
        pcVolume: pcVolume ?? null,
        totalVolume: totalVolume ?? null,
      },
      create: {
        placeId,
        keyword,
        mobileVolume: mobileVolume ?? null,
        pcVolume: pcVolume ?? null,
        totalVolume: totalVolume ?? null,
      },
    });

    return NextResponse.json({ ok: true, placeKeyword });
  } catch (error) {
    console.error("place-keyword-save error:", error);
    return NextResponse.json(
      { error: "키워드 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}