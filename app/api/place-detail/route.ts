import { prisma } from "@/lib/prisma";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RankHistoryItem = {
  id: string;
  placeId: string;
  keyword: string;
  rank: number;
  createdAt: Date;
};

type PlaceKeywordItem = {
  id: string;
  placeId: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  createdAt: Date;
  updatedAt: Date;
  isTracking: boolean;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  return 0;
}

function formatUpdatedAt(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get("placeId") || searchParams.get("id");

    if (!placeId) {
      return Response.json(
        { ok: false, message: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: {
        id: placeId,
      },
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

    if (!place) {
      return Response.json(
        { ok: false, message: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const rankHistory = (place.rankHistory || []) as RankHistoryItem[];
    const keywords = (place.keywords || []) as PlaceKeywordItem[];

    // 검색량이 비어 있는 키워드는 서버에서 보정(최대 10개)
    // - 화면에서 '-'가 뜨는 문제 해결 목적
    // - 레이트리밋 고려해 순차 처리
    for (const kw of keywords) {
      const needs =
        kw.mobileVolume == null || kw.pcVolume == null || kw.totalVolume == null;
      if (!needs) continue;
      const vol = await getKeywordSearchVolume(String(kw.keyword || ""));
      await prisma.placeKeyword.update({
        where: { id: kw.id },
        data: {
          mobileVolume: kw.mobileVolume ?? vol.mobile,
          pcVolume: kw.pcVolume ?? vol.pc,
          totalVolume: kw.totalVolume ?? vol.total,
        },
      });
      kw.mobileVolume = kw.mobileVolume ?? vol.mobile;
      kw.pcVolume = kw.pcVolume ?? vol.pc;
      kw.totalVolume = kw.totalVolume ?? vol.total;
      await new Promise((r) => setTimeout(r, 120));
    }

    const normalizedKeywords = keywords.map((item: PlaceKeywordItem) => {
      const mobileVolume = toNumber(item.mobileVolume ?? 0);
      const pcVolume = toNumber(item.pcVolume ?? 0);
      const totalVolume = toNumber(item.totalVolume) || mobileVolume + pcVolume;

      const updatedAtRaw = item.updatedAt ?? item.createdAt ?? null;

      const histories = rankHistory
        .filter((history: RankHistoryItem) => history.keyword === item.keyword)
        .sort(
          (a: RankHistoryItem, b: RankHistoryItem) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      return {
        ...item,
        mobileVolume,
        pcVolume,
        totalVolume,
        monthlyVolume: totalVolume,
        updatedAt: updatedAtRaw,
        updatedAtText: formatUpdatedAt(updatedAtRaw),
        histories,
      };
    });

    const latestUpdatedAtRaw =
      normalizedKeywords
        .map((item) => item.updatedAt)
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(String(b)).getTime() - new Date(String(a)).getTime()
        )[0] ?? null;

    const latestUpdatedAtText = formatUpdatedAt(latestUpdatedAtRaw);

    let placeMonthlyVolume = 0;
    let placeMobileVolume = 0;
    let placePcVolume = 0;

    // 업체(매장) 검색량은 "첫 번째 키워드"가 아니라 "매장명" 기준(또는 DB 컬럼)을 우선한다.
    const placeMonthlyVolumeDb = toNumber((place as any).placeMonthlyVolume ?? 0);
    const placeMobileVolumeDb = toNumber((place as any).placeMobileVolume ?? 0);
    const placePcVolumeDb = toNumber((place as any).placePcVolume ?? 0);

    placeMonthlyVolume = placeMonthlyVolumeDb;
    placeMobileVolume = placeMobileVolumeDb;
    placePcVolume = placePcVolumeDb;

    if (!placeMonthlyVolume) {
      // 1) 매장명으로 조회 시도
      const vol = await getKeywordSearchVolume(String(place.name || ""));
      if (vol.total || vol.mobile || vol.pc) {
        placeMobileVolume = vol.mobile;
        placePcVolume = vol.pc;
        placeMonthlyVolume = vol.total || vol.mobile + vol.pc;

        await prisma.place.update({
          where: { id: place.id },
          data: {
            placeMonthlyVolume,
            placeMobileVolume,
            placePcVolume,
          },
        });
      }
    }

    return Response.json({
      ok: true,
      place: {
        ...place,
        keywords: normalizedKeywords,
        latestUpdatedAt: latestUpdatedAtRaw,
        latestUpdatedAtText,
        placeMonthlyVolume,
        placeMobileVolume,
        placePcVolume,
      },
    });
  } catch (error) {
    console.error("place-detail error:", error);

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "매장 상세 조회 실패",
      },
      { status: 500 }
    );
  }
}