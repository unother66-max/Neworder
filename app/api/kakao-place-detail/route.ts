import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatTrackedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} (${get("weekday")}) ${get("hour")}:${get("minute")}`;
}

function formatUpdatedAt(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "100위 밖";
  if (rank <= 0) return "100위 밖";
  return `${rank}위`;
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
      where: { id: placeId, userId, type: "kakao-rank" },
      include: {
        kakaoRankHistory: {
          orderBy: { trackedAt: "desc" },
          // 전체 히스토리 (limit 없음)
        },
      },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, message: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const history = place.kakaoRankHistory ?? [];

    // 날짜(한국 기준 YYYY-MM-DD)별 최신 1건만 남기기 (app/place의 getDailyRankHistory와 동일 로직)
    const dailyMap = new Map<string, (typeof history)[number]>();
    for (const h of history) {
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(h.trackedAt);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, h); // 이미 desc 정렬이므로 첫 항목 = 당일 최신
      }
    }
    const deduped = Array.from(dailyMap.values());

    const rankRows = deduped.map((h) => ({
      id: h.id,
      date: formatTrackedAt(h.trackedAt),
      keyword: h.keyword,
      searchAll: formatRank(h.searchAll),
      searchCat: formatRank(h.searchCat),
      directionAll: formatRank(h.directionAll),
      directionCat: formatRank(h.directionCat),
      favoriteAll: formatRank(h.favoriteAll),
      favoriteCat: formatRank(h.favoriteCat),
      shareAll: formatRank(h.shareAll),
      shareCat: formatRank(h.shareCat),
    }));

    const latestUpdatedAt =
      history.length > 0
        ? formatUpdatedAt(history[0].trackedAt)
        : formatUpdatedAt(place.updatedAt);

    const kakaoIdMatch = (place.placeUrl ?? "").match(/\/(\d+)(?:\/|$)/);
    const kakaoId = kakaoIdMatch?.[1] ?? null;

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
        isAutoTracking: place.kakaoAutoTracking ?? false,
        rankRows,
        latestUpdatedAt,
      },
    });
  } catch (error) {
    console.error("kakao-place-detail error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
