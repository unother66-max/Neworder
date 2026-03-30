import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      userId,
      name,
      category,
      address,
      placeUrl,
      imageUrl,
    } = body ?? {};

    if (!userId || !name) {
      return NextResponse.json(
        { error: "userId와 name은 필수입니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.create({
      data: {
        userId,
        name,
        category: category ?? null,
        address: address ?? null,
        placeUrl: placeUrl ?? null,
        imageUrl: imageUrl ?? null,
      },
    });

    return NextResponse.json({ ok: true, place });
  } catch (error) {
    console.error("place-save error:", error);
    return NextResponse.json(
      { error: "매장 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}