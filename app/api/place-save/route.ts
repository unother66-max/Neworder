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
    const jibunAddress = String(body.jibunAddress || "").trim();
    const x = body.x ? String(body.x).trim() : null;
    const y = body.y ? String(body.y).trim() : null;

    if (!name) {
      return NextResponse.json(
        { error: "name은 필수입니다." },
        { status: 400 }
      );
    }

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {
        email: userEmail ?? `${userId}@no-email.local`,
        name: userName ?? null,
      },
      create: {
        id: userId,
        email: userEmail ?? `${userId}@no-email.local`,
        name: userName ?? null,
      },
      select: {
        tier: true,
        _count: {
          select: {
            smartstoreProducts: true,
            places: true,
            smartstoreReviewTargets: true,
          }
        }
      }
    });

    // ── [수정됨] type을 "rank"로 변경하여 순위 추적용 매장인지 확인 ──
    const alreadyExists = await prisma.place.findFirst({
      where: {
        userId,
        type: "rank", 
        OR: [
          ...(placeUrl ? [{ placeUrl }] : []),
          {
            AND: [
              { name },
              { address: address ?? null },
            ],
          },
        ],
      },
    });

    if (alreadyExists) {
      return NextResponse.json(
        { error: "이미 순위 추적에 등록된 매장입니다." },
        { status: 400 }
      );
    }

    const totalItems = 
      (user._count?.smartstoreProducts || 0) + 
      (user._count?.places || 0) + 
      (user._count?.smartstoreReviewTargets || 0);
    
    // 대표님 요청대로 PRO는 사실상 무제한(999)
    const MAX_LIMIT = user.tier === "PRO" ? 999 : 10;

    if (totalItems >= MAX_LIMIT) {
      return NextResponse.json(
        { error: `최대 등록 개수(${MAX_LIMIT}개)를 초과했습니다.` },
        { status: 403 }
      );
    }

    // ── [수정됨] type을 "rank"로 저장하여 지도 순위 탭에 나오게 함 ──
    const place = await prisma.place.create({
      data: {
        userId,
        name,
        type: "rank", 
        category: category ?? null,
        address: address ?? null,
        placeUrl: placeUrl ?? null,
        imageUrl: imageUrl ?? null,
        jibunAddress: jibunAddress || null,
        x,
        y,
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