import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK_TYPES = ["search", "path", "favorite", "share"] as const;
type RankType = (typeof RANK_TYPES)[number];

function extractKakaoId(placeUrl: string): string {
  if (!placeUrl) return "";
  const match = placeUrl.match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? "";
}

// place-api.map.kakao.com/places/panel3/{id} 호출
// 반환: { trend_rank, summary } 포함 place 상세
async function fetchPanel3(kakaoId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://place-api.map.kakao.com/places/panel3/${kakaoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        appVersion: "6.6.0",
        pf: "MW",
        Referer: `https://place.map.kakao.com/${kakaoId}`,
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[check-kakao-rank] panel3 ${res.status} for kakaoId=${kakaoId}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.error("[check-kakao-rank] panel3 fetch error:", e);
    return null;
  }
}

// place.map.kakao.com/api/rank/places/search 로 특정 매장의 rank 조회
// confirm_id가 kakaoId와 일치하는 항목의 rank 반환, 없으면 null
async function fetchRank(
  kakaoId: string,
  type: RankType,
  category: string,
  region: string
): Promise<number | null> {
  const url = new URL("https://place.map.kakao.com/api/rank/places/search");
  url.searchParams.set("type", type);
  url.searchParams.set("category-or-menu", category);
  url.searchParams.set("region", region);
  url.searchParams.set("limit", "100");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Referer: `https://place.map.kakao.com/${kakaoId}`,
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      items?: Array<{ rank: number; confirm_id: number | string }>;
    };
    const found = (data.items ?? []).find((i) => String(i.confirm_id) === kakaoId);
    return found ? found.rank : null;
  } catch (e) {
    console.warn(`[check-kakao-rank] fetchRank error (${type}/${category}):`, e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    if (!session?.user?.id) {
      return Response.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = session.user.id as string;

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return Response.json({ ok: false, error: "placeId가 필요합니다." }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, userId, type: "kakao-rank" },
      select: { id: true, name: true, category: true, placeUrl: true },
    });

    if (!place) {
      return Response.json({ ok: false, error: "매장을 찾을 수 없습니다." }, { status: 404 });
    }

    const kakaoId = extractKakaoId(place.placeUrl ?? "");
    if (!kakaoId) {
      return Response.json(
        { ok: false, error: "카카오 place ID를 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    console.log("[check-kakao-rank] start:", { placeId, kakaoId, name: place.name });

    // 1. panel3 API로 지역 코드 + 업종 카테고리 조회
    const panel3 = await fetchPanel3(kakaoId);

    const trendRank = panel3?.trend_rank as
      | { category_value?: string; menu_rank?: { name?: string } }
      | undefined;
    const summaryRegions = (
      panel3?.summary as
        | { regions?: Array<{ depth: number; id: string; name: string }> }
        | undefined
    )?.regions;

    // 업종 카테고리 (예: "menu_pizza"), 없으면 category_all로 폴백
    const categoryValue = trendRank?.category_value || "category_all";
    // 업종 표시명 (예: "피자"), 히스토리 keyword 필드에 저장
    const categoryName =
      trendRank?.menu_rank?.name || place.category || "전체";
    // depth 3(동) 우선, 없으면 depth 2(구), 그것도 없으면 "all"
    const selectedRegion =
      summaryRegions?.find((r) => r.depth === 3) ??
      summaryRegions?.find((r) => r.depth === 2) ??
      null;
    const regionId = selectedRegion?.id ?? "all";

    console.log("[check-kakao-rank] panel3:", {
      categoryValue,
      categoryName,
      regionId,
      regionDepth: selectedRegion?.depth ?? null,
      regionName: selectedRegion?.name ?? "all",
    });

    // 2. 8개 랭킹 병렬 조회 (4 타입 × 전체/업종)
    const [
      searchAll,
      searchCat,
      directionAll,
      directionCat,
      favoriteAll,
      favoriteCat,
      shareAll,
      shareCat,
    ] = await Promise.all([
      fetchRank(kakaoId, "search", "category_all", regionId),
      fetchRank(kakaoId, "search", categoryValue, regionId),
      fetchRank(kakaoId, "path", "category_all", regionId),
      fetchRank(kakaoId, "path", categoryValue, regionId),
      fetchRank(kakaoId, "favorite", "category_all", regionId),
      fetchRank(kakaoId, "favorite", categoryValue, regionId),
      fetchRank(kakaoId, "share", "category_all", regionId),
      fetchRank(kakaoId, "share", categoryValue, regionId),
    ]);

    console.log("[check-kakao-rank] ranks:", {
      searchAll, searchCat, directionAll, directionCat,
      favoriteAll, favoriteCat, shareAll, shareCat,
    });

    // 3. KakaoRankHistory에 저장
    const history = await prisma.kakaoRankHistory.create({
      data: {
        placeId,
        keyword: categoryName,
        searchAll,
        searchCat,
        directionAll,
        directionCat,
        favoriteAll,
        favoriteCat,
        shareAll,
        shareCat,
      },
    });

    return Response.json({
      ok: true,
      historyId: history.id,
      categoryName,
      regionId,
      ranks: { searchAll, searchCat, directionAll, directionCat, favoriteAll, favoriteCat, shareAll, shareCat },
    });
  } catch (error) {
    console.error("check-kakao-rank error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "순위 조회 실패" },
      { status: 500 }
    );
  }
}
