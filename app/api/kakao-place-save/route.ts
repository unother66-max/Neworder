import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchKakaoPlaceImage(kakaoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://place.map.kakao.com/${kakaoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const html = await res.text();

    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    if (ogMatch?.[1]) return ogMatch[1];

    return null;
  } catch {
    return null;
  }
}

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
    const { name, category, address, kakaoUrl, kakaoId, x, y, type: bodyType } = body ?? {};

    if (!name) {
      return NextResponse.json({ error: "name은 필수입니다." }, { status: 400 });
    }

    // =====================================================================
    // 1. 유저 정보 동기화 및 등록된 항목 개수(_count), 티어(tier) 가져오기
    // =====================================================================
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

    const resolvedType = bodyType === "kakao-place" ? "kakao-place" : "kakao-rank";
    const normalizedUrl =
      kakaoUrl !== undefined && kakaoUrl !== null ? String(kakaoUrl).trim() : "";

    // 기존 등록 여부 먼저 확인
    if (normalizedUrl) {
      const existing = await prisma.place.findFirst({
        where: { userId, type: resolvedType, placeUrl: normalizedUrl },
      });
      if (existing) {
        return NextResponse.json({ ok: true, place: existing, alreadyExisted: true });
      }
    }

    // =====================================================================
    // 2. 총 등록 개수 확인 및 티어 제한 방어
    // =====================================================================
    const totalItems = 
      (user._count?.smartstoreProducts || 0) + 
      (user._count?.places || 0) + 
      (user._count?.smartstoreReviewTargets || 0);
    
    const MAX_LIMIT = user.tier === "PRO" ? 999 : 10;

    if (totalItems >= MAX_LIMIT) {
      return NextResponse.json(
        { error: `모든 항목 통틀어 최대 등록 개수(${MAX_LIMIT}개)를 초과했습니다.` },
        { status: 403 }
      );
    }
    // =====================================================================

    const imageUrl = kakaoId ? await fetchKakaoPlaceImage(String(kakaoId)) : null;

    const place = await prisma.place.create({
      data: {
        userId,
        name,
        category: category ?? null,
        address: address ?? null,
        placeUrl: normalizedUrl || null,
        imageUrl: imageUrl ?? null,
        x: x ? String(x) : null,
        y: y ? String(y) : null,
        type: resolvedType,
      },
    });

    return NextResponse.json({ ok: true, place });
  } catch (error) {
    console.error("kakao-place-save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "매장 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}