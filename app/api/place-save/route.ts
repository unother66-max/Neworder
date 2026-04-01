import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    const userEmail = session?.user?.email as string | null | undefined;
    const userName = session?.user?.name as string | null | undefined;

    if (!userId) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, category, address, placeUrl, imageUrl } = body ?? {};

    if (!name) {
      return NextResponse.json(
        { error: "name은 필수입니다." },
        { status: 400 }
      );
    }

    // ✅ 현재 로그인한 유저를 User 테이블에 먼저 맞춰둠
    await prisma.user.upsert({
      where: {
        id: userId,
      },
      update: {
        email: userEmail ?? `${userId}@no-email.local`,
        name: userName ?? null,
      },
      create: {
        id: userId,
        email: userEmail ?? `${userId}@no-email.local`,
        name: userName ?? null,
      },
    });

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
      {
        error:
          error instanceof Error
            ? error.message
            : "매장 저장 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}