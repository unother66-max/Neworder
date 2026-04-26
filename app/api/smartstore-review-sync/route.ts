import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fetchSmartstoreReviewSnapshot,
} from "@/lib/smartstore-review-fetcher";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trackedDateKey(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetId = String(body?.targetId ?? "").trim();
    if (!targetId) {
      return NextResponse.json(
        { error: "targetId가 필요합니다." },
        { status: 400 }
      );
    }

    const target = await prisma.smartstoreReviewTarget.findFirst({
      where: { id: targetId, userId },
    });

    if (!target) {
      return NextResponse.json({ error: "리뷰 대상 상품을 찾을 수 없습니다." }, { status: 404 });
    }

    const snap = await fetchSmartstoreReviewSnapshot({
      productUrl: target.productUrl,
      productId: target.productId,
    });

    const count = snap.summary.reviewCount;
    const rating = snap.summary.reviewRating;
    const photoVideo = snap.summary.photoVideoReviewCount;
    const monthlyUse = snap.summary.monthlyUseReviewCount;
    const repurchase = snap.summary.repurchaseReviewCount;
    const storePick = snap.summary.storePickReviewCount;
    const starSummary = snap.summary.starScoreSummary;
    const starSummaryJson =
      starSummary == null ? Prisma.JsonNull : (starSummary as Prisma.InputJsonValue);

    const today = trackedDateKey();

    await prisma.$transaction(async (tx) => {
      await tx.smartstoreReviewTarget.update({
        where: { id: target.id },
        data: {
          reviewCount: count == null ? target.reviewCount ?? 0 : count,
          reviewRating: rating,
          reviewPhotoVideoCount:
            photoVideo == null ? target.reviewPhotoVideoCount ?? 0 : photoVideo,
          reviewMonthlyUseCount:
            monthlyUse == null ? target.reviewMonthlyUseCount ?? 0 : monthlyUse,
          reviewRepurchaseCount:
            repurchase == null ? target.reviewRepurchaseCount ?? 0 : repurchase,
          reviewStorePickCount:
            storePick == null ? target.reviewStorePickCount ?? 0 : storePick,
          reviewStarSummary: starSummaryJson,
        },
      });

      if (count != null) {
        await tx.smartstoreReviewHistory.upsert({
          where: { targetId_trackedDate: { targetId: target.id, trackedDate: today } },
          update: {
            reviewCount: count,
            reviewRating: rating,
            reviewPhotoVideoCount: photoVideo,
            reviewMonthlyUseCount: monthlyUse,
            reviewRepurchaseCount: repurchase,
            reviewStorePickCount: storePick,
            reviewStarSummary: starSummaryJson,
          },
          create: {
            targetId: target.id,
            trackedDate: today,
            reviewCount: count,
            reviewRating: rating,
            reviewPhotoVideoCount: photoVideo,
            reviewMonthlyUseCount: monthlyUse,
            reviewRepurchaseCount: repurchase,
            reviewStorePickCount: storePick,
            reviewStarSummary: starSummaryJson,
          },
        });
      }

      // Upsert recent reviews (limit=20), then prune older ones
      for (const r of snap.recentReviews.slice(0, 20)) {
        await tx.smartstoreRecentReview.upsert({
          where: { targetId_reviewKey: { targetId: target.id, reviewKey: r.reviewKey } },
          update: {
            postedAt: r.postedAt,
            rating: r.rating,
            author: r.author,
            content: r.content,
          },
          create: {
            targetId: target.id,
            reviewKey: r.reviewKey,
            postedAt: r.postedAt,
            rating: r.rating,
            author: r.author,
            content: r.content,
          },
        });
      }

      const keep = await tx.smartstoreRecentReview.findMany({
        where: { targetId: target.id },
        orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
        take: 20,
      });
      const keepIds = new Set(keep.map((k) => k.id));
      await tx.smartstoreRecentReview.deleteMany({
        where: {
          targetId: target.id,
          NOT: { id: { in: Array.from(keepIds) } },
        },
      });
    });

    const recent = await prisma.smartstoreRecentReview.findMany({
      where: { targetId: target.id },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        reviewKey: true,
        postedAt: true,
        rating: true,
        author: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      targetId: target.id,
      summary: snap.summary,
      recentReviews: recent.map((r) => ({
        ...r,
        postedAt: r.postedAt ? r.postedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[smartstore-review-sync]", e);
    if (isSmartstoreNaverRateLimitedError(e)) {
      return NextResponse.json(
        { error: "보안 차단 감지: 10초간 긴급 휴식에 들어갑니다" },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "리뷰 동기화에 실패했습니다." }, { status: 502 });
  }
}

