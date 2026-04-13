import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

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

function getDateKey(value: string | Date) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  return 0;
}

type RankHistoryItem = {
  id: string;
  placeId: string;
  keyword: string;
  rank: number | null;
  createdAt: Date;
};

function normalizeDailyRankHistory(items: RankHistoryItem[]) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const map = new Map<string, RankHistoryItem>();

  for (const item of sorted) {
    const dateKey = getDateKey(item.createdAt);
    const key = `${item.keyword}__${dateKey}`;

    // 같은 날짜/같은 키워드가 여러 개면
    // 마지막(더 이른 시각) 값으로 덮어쓰기
    map.set(key, item);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return Response.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 200 }
      );
    }

    const places = await prisma.place.findMany({
      where: {
        userId,
        type: "rank",
      },
      orderBy: [{ rankPinned: "desc" }, { createdAt: "desc" }],
      include: {
        keywords: {
          orderBy: {
            createdAt: "asc",
          },
        },
        rankHistory: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    // place 목록에서 업체(매장) 검색량이 비어 있으면 "매장명" 기준으로 보정한다.
    // (키워드 검색량 보정은 상세 화면에서 수행)
    for (const place of places) {
      const placeMonthlyVolumeDb = toNumber((place as any).placeMonthlyVolume ?? 0);
      const placeMobileVolumeDb = toNumber((place as any).placeMobileVolume ?? 0);
      const placePcVolumeDb = toNumber((place as any).placePcVolume ?? 0);
      if (placeMonthlyVolumeDb) continue;

      const vol = await getKeywordSearchVolume(String(place.name || ""));
      if (!(vol.total || vol.mobile || vol.pc)) continue;

      const placeMonthlyVolume = vol.total || vol.mobile + vol.pc;
      await prisma.place.update({
        where: { id: place.id },
        data: {
          placeMonthlyVolume,
          placeMobileVolume: vol.mobile,
          placePcVolume: vol.pc,
        },
      });

      (place as any).placeMonthlyVolume = placeMonthlyVolume;
      (place as any).placeMobileVolume = vol.mobile;
      (place as any).placePcVolume = vol.pc;

      await new Promise((r) => setTimeout(r, 120));
    }

    const normalizedPlaces = places.map((place) => {
      const normalizedRankHistory = normalizeDailyRankHistory(
        (place.rankHistory || []).map((item) => ({
          id: item.id,
          placeId: item.placeId,
          keyword: item.keyword,
          rank: item.rank,
          createdAt: item.createdAt,
        }))
      );

      const latestUpdatedAt =
        [...place.keywords].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0]?.updatedAt ?? null;

      const placeMonthlyVolumeDb = toNumber(place.placeMonthlyVolume ?? 0);
      const placeMobileVolumeDb = toNumber(place.placeMobileVolume ?? 0);
      const placePcVolumeDb = toNumber(place.placePcVolume ?? 0);

      let placeMonthlyVolume = placeMonthlyVolumeDb;
      let placeMobileVolume = placeMobileVolumeDb;
      let placePcVolume = placePcVolumeDb;

      // placeMonthlyVolume이 아직 채워지지 않은 경우 키워드 검색량으로 fallback
      if (!placeMonthlyVolume) {
        const firstKeyword = place.keywords?.[0];
        if (firstKeyword) {
          placeMobileVolume = toNumber(firstKeyword.mobileVolume ?? 0);
          placePcVolume = toNumber(firstKeyword.pcVolume ?? 0);
          const totalVolume = toNumber(firstKeyword.totalVolume);
          placeMonthlyVolume = totalVolume || placeMobileVolume + placePcVolume;
        }
      }

      return {
        ...place,
        rankPinned: place.rankPinned,
        rankPinnedAt: place.rankPinnedAt,
        rankHistory: normalizedRankHistory,
        jibunAddress: (place as any).jibunAddress ?? null,
        latestUpdatedAt,
        latestUpdatedAtText: formatUpdatedAt(latestUpdatedAt),
        placeMonthlyVolume,
        placeMobileVolume,
        placePcVolume,
      };
    });

    return Response.json({
      ok: true,
      places: normalizedPlaces,
    });
  } catch (error) {
    console.error("place-list error:", error);

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "매장 목록 불러오기 실패",
      },
      { status: 500 }
    );
  }
}