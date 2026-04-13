import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

const MAX_KEYWORDS_PER_STORE = 10;

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

    // 🔥 기존 키워드 개수 체크
    const existingCount = await prisma.placeKeyword.count({
      where: { placeId },
    });

    const exists = await prisma.placeKeyword.findUnique({
      where: {
        placeId_keyword: {
          placeId,
          keyword,
        },
      },
    });

    // 🔥 이미 있는 키워드는 허용 (업데이트니까)
    if (!exists && existingCount >= MAX_KEYWORDS_PER_STORE) {
      return NextResponse.json(
        {
          error: `키워드는 매장당 최대 ${MAX_KEYWORDS_PER_STORE}개까지 등록할 수 있습니다.`,
        },
        { status: 400 }
      );
    }

    // 검색량이 비어 있으면 서버에서 키워드도구로 채움(클라이언트는 null로 보내는 경우가 많음)
    let nextMobile: number | null = mobileVolume ?? null;
    let nextPc: number | null = pcVolume ?? null;
    let nextTotal: number | null = totalVolume ?? null;
    if (nextMobile == null || nextPc == null || nextTotal == null) {
      const vol = await getKeywordSearchVolume(String(keyword));
      nextMobile = nextMobile ?? vol.mobile;
      nextPc = nextPc ?? vol.pc;
      nextTotal = nextTotal ?? vol.total;
    }

    const placeKeyword = await prisma.placeKeyword.upsert({
      where: {
        placeId_keyword: {
          placeId,
          keyword,
        },
      },
      update: {
        mobileVolume: nextMobile,
        pcVolume: nextPc,
        totalVolume: nextTotal,
      },
      create: {
        placeId,
        keyword,
        mobileVolume: nextMobile,
        pcVolume: nextPc,
        totalVolume: nextTotal,
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