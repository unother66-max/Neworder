import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { ADMIN_ONLY_FEATURE_ERROR, requireAdminApi } from "@/lib/require-admin-api";
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

async function buildExistingSummaryForPartial(target: NonNullable<Awaited<ReturnType<typeof prisma.smartstoreReviewTarget.findFirst>>>) {
  const latestHistory = await prisma.smartstoreReviewHistory.findFirst({
    where: { targetId: target.id },
    orderBy: [{ trackedDate: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  const hasCollectedMetrics = latestHistory != null;
  return {
    reviewCount: hasCollectedMetrics ? target.reviewCount : null,
    reviewRating: hasCollectedMetrics ? target.reviewRating : null,
    photoVideoReviewCount: hasCollectedMetrics ? target.reviewPhotoVideoCount : null,
    monthlyUseReviewCount: hasCollectedMetrics ? target.reviewMonthlyUseCount : null,
    repurchaseReviewCount: hasCollectedMetrics ? target.reviewRepurchaseCount : null,
    storePickReviewCount: hasCollectedMetrics ? target.reviewStorePickCount : null,
    starScoreSummary: hasCollectedMetrics ? target.reviewStarSummary : null,
  };
}

export async function POST(req: Request) {
  const admin = await requireAdminApi({ errorMessage: ADMIN_ONLY_FEATURE_ERROR });
  if (!admin.ok) return admin.response;

  let logContext: { targetId?: string; productId?: string; productUrl?: string } | null = null;
  // target을 catch 블록에서도 접근할 수 있도록 스코프 호이스팅
  let resolvedTarget: Awaited<ReturnType<typeof prisma.smartstoreReviewTarget.findFirst>> | null = null;

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
    resolvedTarget = target;

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
      reviewProductId: target.reviewProductId ?? null,
      productName: target.name ?? null,
      storeName: target.storeName ?? null,
      leafCategoryId: target.leafCategoryId ?? null,
    });
    console.log("[smartstore-review-source-trace]", {
      file: "app/api/smartstore-review-sync/route.ts",
      function: "POST",
      readsFrom: "fetchSmartstoreReviewSnapshot",
      writesTo: ["SmartstoreReviewTarget", "SmartstoreReviewHistory"],
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
    const hasFreshReviewMetric = [
      count,
      rating,
      photoVideo,
      monthlyUse,
      repurchase,
      storePick,
      starSummary,
    ].some((v) => v != null);

    if (!hasFreshReviewMetric) {
      const existingSummary = await buildExistingSummaryForPartial(target);
      console.warn("[smartstore-review-fetcher-lite] review-summary fallback failed keep-existing", {
        productId: target.productId,
        targetId: target.id,
        reason: "no-review-summary-data",
        hasCollectedMetrics: existingSummary.reviewCount != null,
      });
      return NextResponse.json(
        {
          ok: false,
          partial: true,
          targetId: target.id,
          message:
            "리뷰 요약 소스를 찾지 못해 최신 리뷰 지표를 갱신하지 못했습니다. 기존 데이터를 유지합니다.",
          summary: existingSummary,
        },
        { status: 200 }
      );
    }

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

      if (count != null && hasFreshReviewMetric) {
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
    });

    // 네이버 차단(429) / 봇 필터 감지 → 기존 DB 값 유지하며 partial 응답(200)
    const isRateLimit = isSmartstoreNaverRateLimitedError(e);
    const isBlocked = e instanceof SmartstoreReviewBlockedError;
    if ((isRateLimit || isBlocked) && resolvedTarget) {
      const existingSummary = await buildExistingSummaryForPartial(resolvedTarget);
      const msg = isRateLimit
        ? "네이버 요청 차단(429)으로 최신 리뷰를 갱신하지 못했습니다. 기존 데이터를 유지합니다."
        : "네이버 차단/검증 감지. 기존 리뷰 데이터를 유지합니다.";
      console.warn("[smartstore-review-sync] partial 응답 반환", {
        ...logContext,
        isRateLimit,
        existingReviewCount: existingSummary.reviewCount,
        existingReviewRating: existingSummary.reviewRating,
      });
      return NextResponse.json(
        {
          ok: false,
          partial: true,
          blocked: true,
          targetId: resolvedTarget.id,
          message: msg,
          summary: existingSummary,
        },
        { status: 200 }
      );
    }
    // target을 못 찾기 전에 차단된 경우 (resolvedTarget == null)
    if (isRateLimit) {
      return NextResponse.json(
        { error: "보안 차단 감지: 10초간 긴급 휴식에 들어갑니다" },
        { status: 429 }
      );
    }
    if (isBlocked) {
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
