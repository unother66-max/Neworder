import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KakaoDoc = { id: string; place_name: string; address_name: string; road_address_name: string };

function extractKakaoId(placeUrl: string): string {
  const match = placeUrl.match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? "";
}

async function searchKakaoByKeyword(keyword: string): Promise<KakaoDoc[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return [];

  const results: KakaoDoc[] = [];
  for (let page = 1; page <= 3; page++) {
    try {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&size=15&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        cache: "no-store",
      });
      if (!res.ok) break;
      const data = await res.json();
      const docs: KakaoDoc[] = data.documents ?? [];
      results.push(...docs);
      if (docs.length < 15) break;
    } catch {
      break;
    }
  }
  return results;
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

    // isTracking = true 인 키워드가 있는 kakao-place 매장 조회
    const places = await prisma.place.findMany({
      where: {
        type: "kakao-place",
        keywords: { some: { isTracking: true } },
      },
      select: {
        id: true,
        name: true,
        placeUrl: true,
        keywords: {
          where: { isTracking: true },
          select: { id: true, keyword: true },
        },
      },
    });

    console.log(`[kakao-keyword-tracking cron] 대상 매장: ${places.length}개`);

    let successCount = 0;
    let failCount = 0;

    for (const place of places) {
      const kakaoId = extractKakaoId(place.placeUrl ?? "");
      if (!kakaoId) {
        console.warn(`[kakao-keyword-tracking cron] kakaoId 없음: ${place.name}`);
        failCount++;
        continue;
      }

      for (const kw of place.keywords) {
        try {
          const docs = await searchKakaoByKeyword(kw.keyword);
          const idx = docs.findIndex((d) => d.id === kakaoId);
          const rank = idx >= 0 ? idx + 1 : null;

          await prisma.rankHistory.create({
            data: { placeId: place.id, keyword: kw.keyword, rank: rank ?? 0 },
          });

          console.log(
            `[kakao-keyword-tracking cron] ✅ ${place.name} / "${kw.keyword}" → rank: ${rank ?? "미진입"}`
          );
          successCount++;
        } catch (error) {
          console.error(
            `[kakao-keyword-tracking cron] ❌ ${place.name} / "${kw.keyword}":`,
            error
          );
          failCount++;
        }
      }
    }

    console.log(
      `[kakao-keyword-tracking cron] 완료: 성공 ${successCount} / 실패 ${failCount}`
    );

    return NextResponse.json({
      ok: true,
      total: places.length,
      successCount,
      failCount,
    });
  } catch (error) {
    console.error("[kakao-keyword-tracking cron] 치명적 오류:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "크론 실패" },
      { status: 500 }
    );
  }
}
