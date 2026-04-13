import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 👉 한국 날짜 기준 YYYY-MM-DD
function getKstDateString() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const isValidCronSecret =
      Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
    if (cronSecret && !isValidCronSecret && !isVercelCron) {
      return NextResponse.json(
        { ok: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const places = await prisma.place.findMany({
      where: {
        reviewAutoTracking: true,
      },
      include: {
        reviewHistory: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    const results: Array<{
      placeId: string;
      name: string;
      saved: boolean;
      date?: string;
      totalReviewCount?: number;
      visitorReviewCount?: number;
      blogReviewCount?: number;
      saveCount?: string;
      keywords?: string[];
      reason?: string;
    }> = [];

    const trackedDate = getKstDateString();

    for (const place of places) {
      try {
        if (!place.placeUrl) {
          results.push({
            placeId: place.id,
            name: place.name,
            saved: false,
            date: trackedDate,
            reason: "placeUrl 없음",
          });
          continue;
        }

        const snapshot = await getNaverPlaceReviewSnapshot({
          placeUrl: String(place.placeUrl || ""),
          placeName: String(place.name || ""),
          x: place.x ? String(place.x) : "",
          y: place.y ? String(place.y) : "",
        });

        if (
          snapshot.visitorReviewCount === null &&
          snapshot.blogReviewCount === null &&
          snapshot.saveCountText === null
        ) {
          results.push({
            placeId: place.id,
            name: place.name,
            saved: false,
            date: trackedDate,
            reason: "리뷰 파싱 실패",
          });
          continue;
        }

        const latest = place.reviewHistory[0];
        const keywords =
          snapshot.keywordList && snapshot.keywordList.length > 0
            ? snapshot.keywordList
            : latest?.keywords && latest.keywords.length > 0
              ? latest.keywords
              : ["맛집", "분위기", "데이트", "가성비", "친절"];

        const visitorReviewCount = snapshot.visitorReviewCount ?? 0;
        const blogReviewCount = snapshot.blogReviewCount ?? 0;
        const totalReviewCount = visitorReviewCount + blogReviewCount;
        const saveCount = snapshot.saveCountText ?? "0";

        const volume = await getKeywordSearchVolume(place.name);
        const placeMobileVolume = volume?.mobile ?? 0;
        const placePcVolume = volume?.pc ?? 0;
        const placeMonthlyVolume = placeMobileVolume + placePcVolume;

        await prisma.placeReviewHistory.upsert({
          where: {
            placeId_trackedDate: {
              placeId: place.id,
              trackedDate,
            },
          },
          update: {
            totalReviewCount,
            visitorReviewCount,
            blogReviewCount,
            saveCount,
            keywords,
          },
          create: {
            placeId: place.id,
            trackedDate,
            totalReviewCount,
            visitorReviewCount,
            blogReviewCount,
            saveCount,
            keywords,
          },
        });

        await prisma.place.update({
          where: { id: place.id },
          data: {
            placeMobileVolume,
            placePcVolume,
            placeMonthlyVolume,
          },
        });

        results.push({
          placeId: place.id,
          name: place.name,
          saved: true,
          date: trackedDate,
          totalReviewCount,
          visitorReviewCount,
          blogReviewCount,
          saveCount,
          keywords,
        });

        // 네이버 호출/저장 API 레이트리밋 완화용
        await sleep(250);
      } catch (error) {
        console.error(`[place-review-tracking] save failed: ${place.name}`, error);

        results.push({
          placeId: place.id,
          name: place.name,
          saved: false,
          date: trackedDate,
          reason: error instanceof Error ? error.message : "저장 실패",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      date: trackedDate,
      results,
    });
  } catch (error) {
    console.error("place-review-tracking cron error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "리뷰 자동추적 실패",
      },
      { status: 500 }
    );
  }
}