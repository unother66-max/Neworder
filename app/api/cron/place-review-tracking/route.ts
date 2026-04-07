import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { ok: false, message: "Unauthorized" },
          { status: 401 }
        );
      }
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
      totalReviewCount?: number;
      visitorReviewCount?: number;
      blogReviewCount?: number;
      saveCount?: string;
      reason?: string;
    }> = [];

    for (const place of places) {
      try {
        const latest = place.reviewHistory[0];

        let totalReviewCount = 0;
        let visitorReviewCount = 0;
        let blogReviewCount = 0;
        let saveCount = "0+";

        if (latest) {
          const totalDiff = randomBetween(3, 20);
          const visitorDiff = randomBetween(1, Math.max(1, Math.floor(totalDiff / 2)));
          const blogDiff = totalDiff - visitorDiff;

          totalReviewCount = latest.totalReviewCount + totalDiff;
          visitorReviewCount = latest.visitorReviewCount + visitorDiff;
          blogReviewCount = latest.blogReviewCount + blogDiff;

          const latestSave = Number(String(latest.saveCount).replace(/[^\d]/g, "")) || 0;
          const nextSave = latestSave + randomBetween(10, 120);
          saveCount = `${nextSave}+`;
        } else {
          totalReviewCount = randomBetween(200, 1200);
          visitorReviewCount = Math.floor(totalReviewCount * 0.45);
          blogReviewCount = totalReviewCount - visitorReviewCount;
          saveCount = `${randomBetween(1000, 30000)}+`;
        }

        const keywords = ["맛집", "분위기", "데이트", "가성비", "친절"];

        await prisma.placeReviewHistory.create({
          data: {
            placeId: place.id,
            totalReviewCount,
            visitorReviewCount,
            blogReviewCount,
            saveCount,
            keywords,
          },
        });

        results.push({
          placeId: place.id,
          name: place.name,
          saved: true,
          totalReviewCount,
          visitorReviewCount,
          blogReviewCount,
          saveCount,
        });
      } catch (error) {
        console.error(`[place-review-tracking] save failed: ${place.name}`, error);

        results.push({
          placeId: place.id,
          name: place.name,
          saved: false,
          reason: error instanceof Error ? error.message : "저장 실패",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
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