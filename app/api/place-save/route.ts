import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getLimit } from "@/lib/constants"; // 🚨 1. 중앙 통제실 불러오기

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    const userEmail = session?.user?.email as string | null | undefined;
    const userName = session?.user?.name as string | null | undefined;

    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { name, category, address, placeUrl, imageUrl } = body ?? {};
    const jibunAddress = String(body.jibunAddress || "").trim();
    const x = body.x ? String(body.x).trim() : null;
    const y = body.y ? String(body.y).trim() : null;

    if (!name) {
      return NextResponse.json({ error: "매장 이름은 필수입니다." }, { status: 400 });
    }

    // 1. 유저 정보 및 현재 등록 개수 확인
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
      include: {
        _count: {
          select: { places: true, smartstoreProducts: true, smartstoreReviewTargets: true }
        }
      }
    });

    // 🚨 2. 중앙 통제실(getLimit)을 이용한 개수 제한 체크
    // 반드시 user 정보를 가져온 이 시점(함수 내부)에서 실행해야 합니다!
    const MAX_LIMIT = getLimit(user.tier, userEmail);
    
    // 현재 등록된 총 아이템 수 합산
    const totalItems = 
      (user._count?.smartstoreProducts || 0) + 
      (user._count?.places || 0) + 
      (user._count?.smartstoreReviewTargets || 0);

    if (totalItems >= MAX_LIMIT) {
      return NextResponse.json(
        { 
          error: `${user.tier || "FREE"} 등급은 최대 ${MAX_LIMIT}개까지만 등록 가능합니다.`,
          limitReached: true,
          currentTier: user.tier || "FREE",
          maxLimit: MAX_LIMIT
        },
        { status: 403 }
      );
    }

    // 3. 중복 등록 확인
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
      return NextResponse.json({ error: "이미 순위 추적에 등록된 매장입니다." }, { status: 400 });
    }

    // 4. 매장 저장
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
    return NextResponse.json({ error: "매장 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}