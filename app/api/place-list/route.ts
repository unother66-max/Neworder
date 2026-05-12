import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // 🚨 캐시 완벽 차단!

/**
 * 렌더링(UI) 목적의 GET 라우트 — DB 조회 전용.
 *
 * - Prisma로 저장된 매장·키워드·순위 히스토리만 조회해 내려준다.
 * - 여기에 getKeywordSearchVolume, 네이버 등 외부 메타 fetch,
 *   순위조회(check-place-rank 등), 리뷰수집 같은 네트워크 요청을 다시 넣지 말 것.
 * - 외부 요청은 매장 등록·수동 업데이트·cron·별도 action 라우트에서만 실행한다.
 */

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

    // 🚨 핵심 수정 부분: 
    // 기존에는 옛날 데이터로 덮어씌웠지만, 
    // 이제는 '가장 먼저 읽힌(가장 최신)' 데이터만 Map에 담고 이후 과거 데이터는 무시합니다.
    if (!map.has(key)) {
      map.set(key, item);
    }
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
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        rankHistory: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

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

      const keywordLatestUpdatedAt =
        [...place.keywords].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0]?.updatedAt ?? null;

      const rankHistoryLatestMs = (place.rankHistory || []).reduce(
        (acc, r) => {
          const t = new Date(r.createdAt).getTime();
          return Number.isNaN(t) ? acc : Math.max(acc, t);
        },
        0
      );

      const keywordLatestMs = keywordLatestUpdatedAt
        ? new Date(keywordLatestUpdatedAt).getTime()
        : 0;

      const bestMs = Math.max(
        Number.isFinite(keywordLatestMs) ? keywordLatestMs : 0,
        rankHistoryLatestMs
      );

      const latestUpdatedAt =
        bestMs > 0 ? new Date(bestMs) : keywordLatestUpdatedAt ?? null;

      const placeMonthlyVolumeDb = toNumber(place.placeMonthlyVolume ?? 0);
      const placeMobileVolumeDb = toNumber(place.placeMobileVolume ?? 0);
      const placePcVolumeDb = toNumber(place.placePcVolume ?? 0);

      let placeMonthlyVolume = placeMonthlyVolumeDb;
      let placeMobileVolume = placeMobileVolumeDb;
      let placePcVolume = placePcVolumeDb;

      // 업체(매장) 검색량은 키워드 검색량으로 폴백하지 않는다.
      // (키워드 검색량이 업체 검색량을 덮어쓰는 문제 방지)

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