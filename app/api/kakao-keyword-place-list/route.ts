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

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    const places = await prisma.place.findMany({
      where: { userId, type: "kakao-place" },
      orderBy: [{ rankPinned: "desc" }, { rankPinnedAt: "desc" }, { createdAt: "desc" }],
      include: {
        keywords: { orderBy: { createdAt: "asc" } },
        rankHistory: { orderBy: { createdAt: "desc" } },
      },
    });

    const normalized = places.map((place) => {
      const kakaoIdMatch = (place.placeUrl ?? "").match(/\/(\d+)(?:\/|$)/);
      const kakaoId = kakaoIdMatch?.[1] ?? null;

      // 키워드별 최신 랭킹 추출
      const keywords = place.keywords.map((kw) => {
        const latestHistory = place.rankHistory.find((h) => h.keyword === kw.keyword);
        return {
          id: kw.id,
          keyword: kw.keyword,
          mobileVolume: kw.mobileVolume ?? null,
          pcVolume: kw.pcVolume ?? null,
          totalVolume: kw.totalVolume ?? null,
          isTracking: kw.isTracking,
          latestRank: latestHistory?.rank ?? null,
          latestRankDate: latestHistory ? formatDate(latestHistory.createdAt) : null,
        };
      });

      const latestHistory = place.rankHistory[0];
      const latestUpdatedAt = latestHistory ? formatDate(latestHistory.createdAt) : null;
      const isAutoTracking = keywords.length > 0 && keywords.every((k) => k.isTracking);

      return {
        id: place.id,
        kakaoId,
        name: place.name,
        category: place.category ?? "",
        address: place.address ?? "",
        kakaoUrl: place.placeUrl ?? "",
        imageUrl: place.imageUrl ?? null,
        isPinned: place.rankPinned ?? false,
        isAutoTracking,
        keywords,
        latestUpdatedAt,
      };
    });

    return Response.json({ ok: true, places: normalized });
  } catch (error) {
    console.error("kakao-keyword-place-list error:", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "목록 불러오기 실패" },
      { status: 500 }
    );
  }
}
