import { prisma } from "@/lib/prisma";
import { createAdminAlert } from "@/lib/admin-alert";
import { NextResponse } from "next/server";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import { getPlaceNameSearchVolume } from "@/lib/getPlaceNameSearchVolume";

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
      debugReason?: string;
      chosenType?: "restaurant" | "place" | null;
      triedTypes?: Array<"restaurant" | "place">;
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
          void createAdminAlert({
            type: "cron",
            level: "error",
            title: "리뷰 자동추적 실패",
            message: `업체명: ${place.name} / 사유: placeUrl 없음`,
            meta: {
              placeId: place.id,
              cron: "place-review-tracking",
              reason: "placeUrl 없음",
            },
          });
          continue;
        }

        const snapshot = await getNaverPlaceReviewSnapshot({
          placeUrl: String(place.placeUrl || ""),
          placeName: String(place.name || ""),
          category: place.category ? String(place.category) : "",
          x: place.x ? String(place.x) : "",
          y: place.y ? String(place.y) : "",
          force: false,
        });

        const latest = place.reviewHistory[0];
        if (
          !snapshot.ok ||
          snapshot.visitorReviewCount === null ||
          snapshot.blogReviewCount === null ||
          snapshot.saveCountText === null
        ) {
          const reason = snapshot.reason ?? "REVIEW_SNAPSHOT_UNAVAILABLE";
          const debugReason = snapshot.debugReason ?? reason;
          results.push({
            placeId: place.id,
            name: place.name,
            saved: false,
            date: trackedDate,
            reason,
            debugReason,
            chosenType: snapshot.chosenType,
            triedTypes: snapshot.triedTypes,
          });
          void createAdminAlert({
            type: "cron",
            level: "error",
            title: "리뷰 자동추적 실패",
            message: `업체명: ${place.name} / 사유: 최신 리뷰 수집 실패(${reason})`,
            meta: {
              placeId: place.id,
              cron: "place-review-tracking",
              reason,
              debugReason,
              hintType: snapshot.hintType,
              chosenType: snapshot.chosenType,
              triedTypes: snapshot.triedTypes,
              cacheStatus: snapshot.cacheStatus,
            },
          });
          continue;
        }

        const registeredKeywordsStatus =
          snapshot.registeredKeywordsStatus ?? snapshot.keywordListStatus;
        const freshRegisteredKeywords =
          snapshot.registeredKeywords ?? snapshot.keywordList;
        const keywords =
          registeredKeywordsStatus === "AVAILABLE"
            ? (freshRegisteredKeywords ?? [])
            : (latest?.keywords ?? []);

        const visitorReviewCount = snapshot.visitorReviewCount;
        const blogReviewCount = snapshot.blogReviewCount;
        const totalReviewCount = visitorReviewCount + blogReviewCount;
        const saveCount = snapshot.saveCountText;

        const volume = await getPlaceNameSearchVolume(place.name);
        const volTotal =
          (volume?.total ?? 0) ||
          (volume?.mobile ?? 0) + (volume?.pc ?? 0);
        const shouldUpdatePlaceVolume =
          volume?.ok === true && volTotal > 0;

        const placeMobileVolume = shouldUpdatePlaceVolume
          ? volume.mobile
          : (place.placeMobileVolume ?? 0);
        const placePcVolume = shouldUpdatePlaceVolume
          ? volume.pc
          : (place.placePcVolume ?? 0);
        const placeMonthlyVolume = shouldUpdatePlaceVolume
          ? volTotal
          : (place.placeMonthlyVolume ?? 0);

        if (!shouldUpdatePlaceVolume) {
          console.warn("[place-volume] keep previous volume", {
            placeId: place.id,
            placeName: place.name,
            reason: volume?.reason,
            previous: {
              total: place.placeMonthlyVolume,
              mobile: place.placeMobileVolume,
              pc: place.placePcVolume,
            },
            received: volume,
          });
        }

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
          reason: snapshot.reason ?? undefined,
          debugReason: snapshot.debugReason ?? undefined,
          chosenType: snapshot.chosenType,
          triedTypes: snapshot.triedTypes,
        });

        // 네이버 호출/저장 API 레이트리밋 완화용
        await sleep(250);
      } catch (error) {
        console.error(`[place-review-tracking] save failed: ${place.name}`, error);

        const reason =
          error instanceof Error ? error.message : "저장 실패";
        void createAdminAlert({
          type: "cron",
          level: "error",
          title: "리뷰 자동추적 실패",
          message: `업체명: ${place.name} / 사유: getNaverPlaceReviewSnapshot 또는 저장 실패 — ${reason}`,
          meta: {
            placeId: place.id,
            cron: "place-review-tracking",
            error: reason,
          },
        });

        results.push({
          placeId: place.id,
          name: place.name,
          saved: false,
          date: trackedDate,
          reason,
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

    const msg =
      error instanceof Error ? error.message : "리뷰 자동추적 실패";
    void createAdminAlert({
      type: "cron",
      level: "error",
      title: "리뷰 자동추적 크론 전체 실패",
      message: `사유: ${msg}`,
      meta: { cron: "place-review-tracking", scope: "global" },
    });

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "리뷰 자동추적 실패",
      },
      { status: 500 }
    );
  }
}
