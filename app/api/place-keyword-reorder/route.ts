import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(
      authOptions as never
    )) as Session | null;
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const placeId = String(body?.placeId || "").trim();
    const keywords = Array.isArray(body?.keywords)
      ? body.keywords
          .map((k: unknown) => String(k ?? "").trim())
          .filter(Boolean)
      : [];

    if (!placeId) {
      return NextResponse.json(
        { ok: false, error: "placeId가 필요합니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.findFirst({
      where: {
        id: placeId,
        userId,
        type: "rank",
      },
      select: { id: true },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, error: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < keywords.length; i++) {
        await tx.placeKeyword.updateMany({
          where: { placeId, keyword: keywords[i]! },
          data: { sortOrder: i },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("place-keyword-reorder error:", error);

    return NextResponse.json(
      { ok: false, error: "키워드 순서 저장 실패" },
      { status: 500 }
    );
  }
}
