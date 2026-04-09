import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function formatRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "-";
  if (rank <= 0) return "-";
  return `${rank}위`;
}

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 200 });
    }

    const places = await prisma.place.findMany({
      where: { userId, type: "kakao-rank" },
      orderBy: [{ rankPinned: "desc" }, { rankPinnedAt: "desc" }, { createdAt: "desc" }],
      include: {
        kakaoRankHistory: {
          orderBy: { trackedAt: "desc" },
          take: 1,
        },
      },
    });

    const normalizedPlaces = places.map((place) => {
      const rawHistory = place.kakaoRankHistory ?? [];

      // 날짜(한국 기준)별 최신 1건만 남기기
      const dailyMap = new Map<string, (typeof rawHistory)[number]>();
      for (const h of rawHistory) {
        const dateKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(h.trackedAt);
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, h);
        }
      }
      const history = Array.from(dailyMap.values());

      const rankRows = history.map((h) => ({
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

      return {
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
        createdAt: place.createdAt,
      };
    });

    return Response.json({ ok: true, places: normalizedPlaces });
  } catch (error) {
    console.error("kakao-place-list error:", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "매장 목록 불러오기 실패" },
      { status: 500 }
    );
  }
}
