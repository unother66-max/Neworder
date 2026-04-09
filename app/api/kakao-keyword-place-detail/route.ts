import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} (${get("weekday")}) ${get("hour")}:${get("minute")}`;
}

// 날짜만 추출 (중복 제거 키용)
function dateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get("id") || "";
    if (!placeId) {
      return NextResponse.json({ ok: false, message: "id가 필요합니다." }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, userId, type: "kakao-place" },
      include: {
        keywords: { orderBy: { createdAt: "asc" } },
        rankHistory: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!place) {
      return NextResponse.json({ ok: false, message: "매장을 찾을 수 없습니다." }, { status: 404 });
    }

    const kakaoIdMatch = (place.placeUrl ?? "").match(/\/(\d+)(?:\/|$)/);
    const kakaoId = kakaoIdMatch?.[1] ?? null;

    const keywords = place.keywords.map((kw) => {
      // 날짜별 최신 1건만 남기기 (rankHistory는 이미 createdAt desc 정렬됨)
      const seen = new Map<string, typeof place.rankHistory[number]>();
      for (const h of place.rankHistory.filter((h) => h.keyword === kw.keyword)) {
        const key = dateKey(h.createdAt);
        if (!seen.has(key)) seen.set(key, h);
      }
      const history = Array.from(seen.values()).map((h) => ({
        id: h.id,
        rank: h.rank,
        date: formatDate(h.createdAt),
        createdAt: h.createdAt.toISOString(),
      }));

      const latestRank = history[0]?.rank ?? null;

      return {
        id: kw.id,
        keyword: kw.keyword,
        mobileVolume: kw.mobileVolume ?? null,
        pcVolume: kw.pcVolume ?? null,
        totalVolume: kw.totalVolume ?? null,
        isTracking: kw.isTracking,
        latestRank,
        history,
      };
    });

    const latestHistory = place.rankHistory[0];
    const latestUpdatedAt = latestHistory ? formatDate(latestHistory.createdAt) : null;

    return NextResponse.json({
      ok: true,
      place: {
        id: place.id,
        kakaoId,
        name: place.name,
        category: place.category ?? "",
        address: place.address ?? "",
        kakaoUrl: place.placeUrl ?? "",
        imageUrl: place.imageUrl ?? null,
        isPinned: place.rankPinned ?? false,
        isAutoTracking: place.keywords.length > 0 && place.keywords.every((k) => k.isTracking),
        keywords,
        latestUpdatedAt,
      },
    });
  } catch (error) {
    console.error("kakao-keyword-place-detail error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
