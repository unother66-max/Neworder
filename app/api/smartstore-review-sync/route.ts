import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fetchSmartstoreReviewSnapshot,
  SmartstoreReviewBlockedError,
  SmartstoreReviewParseError,
  SmartstoreReviewProductNotFoundError,
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
  let logContext: { targetId?: string; productId?: string; productUrl?: string } | null = null;
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetId = String(body?.targetId ?? "").trim();
    const productId = String(body?.productId ?? "").trim();
    if (!targetId && !productId) {
      return NextResponse.json({ error: "targetId 또는 productId가 필요합니다." }, { status: 400 });
    }

    const target = await prisma.smartstoreReviewTarget.findFirst({
      where: targetId ? { id: targetId, userId } : { productId, userId },
    });

    if (!target) {
      return NextResponse.json({ error: "리뷰 대상 상품을 찾을 수 없습니다." }, { status: 404 });
    }
    logContext = {
      targetId: target.id,
      productId: target.productId,
      productUrl: target.productUrl,
    };

    // Scraping-only URL:
    // - Prefer MOBILE host (m.) for the review scraping engine
    // - Drop ALL query params / fragments (NaPm, nl-*, etc.)
    // IMPORTANT: keep DB value (target.productUrl) untouched; only use cleanMobileUrl for scraping.
    const cleanMobileUrl = (() => {
      try {
        const u = new URL(target.productUrl);
        if (u.hostname === "smartstore.naver.com") u.hostname = "m.smartstore.naver.com";
        if (u.hostname === "brand.naver.com") u.hostname = "m.brand.naver.com";
        return `${u.protocol}//${u.hostname}${u.pathname}`;
      } catch {
        return target.productUrl.split("#")[0]!.split("?")[0]!;
      }
    })();

    const snap = await fetchSmartstoreReviewSnapshot({
      productUrl: cleanMobileUrl,
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
      starSummary == null
        ? (target.reviewStarSummary ?? Prisma.JsonNull)
        : (starSummary as Prisma.InputJsonValue);

    const today = trackedDateKey();

    await prisma.$transaction(async (tx) => {
      await tx.smartstoreReviewTarget.update({
        where: { id: target.id },
        data: {
          reviewCount: count == null ? target.reviewCount : count,
          reviewRating: rating == null ? target.reviewRating : rating,
          reviewPhotoVideoCount:
            photoVideo == null ? target.reviewPhotoVideoCount : photoVideo,
          reviewMonthlyUseCount:
            monthlyUse == null ? target.reviewMonthlyUseCount : monthlyUse,
          reviewRepurchaseCount:
            repurchase == null ? target.reviewRepurchaseCount : repurchase,
          reviewStorePickCount:
            storePick == null ? target.reviewStorePickCount : storePick,
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
    console.error("[smartstore-review-sync] 동기화 실패", {
      ...logContext,
      errorName: e instanceof Error ? e.name : "unknown",
      errorMessage: e instanceof Error ? e.message : String(e),
      error: e,
    });
    if (isSmartstoreNaverRateLimitedError(e)) {
      return NextResponse.json(
        { error: "보안 차단 감지: 10초간 긴급 휴식에 들어갑니다" },
        { status: 429 }
      );
    }
    if (e instanceof SmartstoreReviewBlockedError) {
      return NextResponse.json(
        { error: "네이버 차단/검증 페이지로 인해 리뷰 데이터를 가져오지 못했습니다." },
        { status: 429 }
      );
    }
    if (e instanceof SmartstoreReviewProductNotFoundError) {
      return NextResponse.json(
        { error: "상품이 존재하지 않거나 현재 URL 유형에서 리뷰 페이지를 찾지 못했습니다." },
        { status: 404 }
      );
    }
    if (e instanceof SmartstoreReviewParseError) {
      return NextResponse.json(
        { error: "리뷰 페이지는 열렸지만 필요한 데이터를 파싱하지 못했습니다." },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "리뷰 동기화에 실패했습니다." }, { status: 502 });
  }
}

