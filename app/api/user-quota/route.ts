import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        tier: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "유저를 찾을 수 없습니다." }, { status: 404 });
    }

    // 1. 각 항목별 개수 조회 (리뷰 분석 제외)
    const smartstoreCount = await prisma.smartstoreProduct.count({ where: { userId } });
    
    const naverMapCount = await prisma.place.count({
      where: { userId, type: { in: ["rank", "review"] } }
    });

    const kakaoMapCount = await prisma.place.count({
      where: { userId, type: { in: ["kakao-place", "kakao-rank"] } }
    });

    // 2. 전체 합계 계산 (3가지 항목만 합산)
    const totalItems = smartstoreCount + naverMapCount + kakaoMapCount;
    const maxLimit = user.tier === "PRO" ? 999 : 10;

    return NextResponse.json({
      ok: true,
      email: user.email,
      name: user.name,
      tier: user.tier,
      counts: {
        smartstore: smartstoreCount,
        naverMap: naverMapCount,
        kakaoMap: kakaoMapCount,
      },
      totalItems,
      maxLimit,
    });
  } catch (error) {
    console.error("user-quota fetch error:", error);
    return NextResponse.json({ error: "조회 중 오류 발생" }, { status: 500 });
  }
}