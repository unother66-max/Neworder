import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK_TYPES = ["search", "path", "favorite", "share"] as const;
type RankType = (typeof RANK_TYPES)[number];

function extractKakaoId(placeUrl: string): string {
  if (!placeUrl) return "";
  const match = placeUrl.match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? "";
}

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
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

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
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    // 인증: CRON_SECRET Bearer 또는 Vercel 내부 호출
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    const isValidCronSecret = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";

    if (!isValidCronSecret && !isVercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 자동추적 ON 매장만 조회
    const places = await prisma.place.findMany({
      where: { kakaoAutoTracking: true, type: "kakao-rank" },
      select: { id: true, name: true, category: true, placeUrl: true },
    });

    console.log(`[kakao-tracking cron] 대상 매장: ${places.length}개`);

    let successCount = 0;
    let failCount = 0;

    for (const place of places) {
      try {
        const kakaoId = extractKakaoId(place.placeUrl ?? "");
        if (!kakaoId) {
          console.warn(`[kakao-tracking cron] kakaoId 없음: ${place.name}`);
          failCount++;
          continue;
        }

        const panel3 = await fetchPanel3(kakaoId);

        const trendRank = panel3?.trend_rank as
          | { category_value?: string; menu_rank?: { name?: string } }
          | undefined;
        const summaryRegions = (
          panel3?.summary as
            | { regions?: Array<{ depth: number; id: string; name: string }> }
            | undefined
        )?.regions;

        const categoryValue = trendRank?.category_value || "category_all";
        const categoryName = trendRank?.menu_rank?.name || place.category || "전체";
        const selectedRegion =
          summaryRegions?.find((r) => r.depth === 3) ??
          summaryRegions?.find((r) => r.depth === 2) ??
          null;
        const regionId = selectedRegion?.id ?? "all";

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

        await prisma.kakaoRankHistory.create({
          data: {
            placeId: place.id,
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

        console.log(`[kakao-tracking cron] ✅ ${place.name} (${kakaoId}) regionId=${regionId}`);
        successCount++;
      } catch (error) {
        console.error(`[kakao-tracking cron] ❌ ${place.name}:`, error);
        failCount++;
      }
    }

    console.log(`[kakao-tracking cron] 완료: 성공 ${successCount} / 실패 ${failCount}`);

    return NextResponse.json({
      ok: true,
      total: places.length,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error("[kakao-tracking cron] 치명적 오류:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "크론 실패" },
      { status: 500 }
    );
  }
}
