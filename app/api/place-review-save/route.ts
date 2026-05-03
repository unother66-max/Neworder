import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getLimit } from "@/lib/constants"; // 🚨 상단 임포트 확인

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
      return NextResponse.json({ error: "name은 필수입니다." }, { status: 400 });
    }

    // 1. 유저 정보 조회 (티어와 개수 포함)
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

    // 🚨 2. 중앙 통제실 규칙 적용 (이 부분으로 통일!)
    const MAX_LIMIT = getLimit(user.tier, userEmail);

    const totalItems = 
      (user._count?.smartstoreProducts || 0) + 
      (user._count?.places || 0) + 
      (user._count?.smartstoreReviewTargets || 0);

    if (totalItems >= MAX_LIMIT) {
      return NextResponse.json(
        { error: `${user.tier || "FREE"} 등급은 최대 ${MAX_LIMIT}개까지만 등록 가능합니다.` },
        { status: 403 }
      );
    }

    // 3. 중복 등록 확인
    const alreadyExists = await prisma.place.findFirst({
      where: {
        userId,
        type: "review",
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
      return NextResponse.json({ error: "이미 리뷰 추적에 등록된 매장입니다." }, { status: 400 });
    }

    // 4. 저장 로직
    const place = await prisma.place.create({
      data: {
        userId,
        name,
        type: "review",
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
    console.error("place-review-save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "리뷰 매장 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}