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
    const { name, category, address, kakaoUrl, kakaoId, x, y } = body ?? {};

    if (!name) {
      return NextResponse.json({ error: "name은 필수입니다." }, { status: 400 });
    }

    await prisma.user.upsert({
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
    });

    const imageUrl = kakaoId ? await fetchKakaoPlaceImage(String(kakaoId)) : null;

    const place = await prisma.place.create({
      data: {
        userId,
        name,
        category: category ?? null,
        address: address ?? null,
        placeUrl: kakaoUrl ?? null,
        imageUrl: imageUrl ?? null,
        x: x ? String(x) : null,
        y: y ? String(y) : null,
        type: "kakao-rank",
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
