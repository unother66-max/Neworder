import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { SmartstoreSpace } from "@prisma/client";
import { executeSmartstoreProductSavePost } from "@/lib/execute-smartstore-product-save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatKoDateTime(d: Date): string {
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ==========================================
// 1. GET: 목록 조회 로직 (원본 보존)
// ==========================================
export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const targets = await prisma.smartstoreReviewTarget.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        productId: true,
        productUrl: true,
        name: true,
        imageUrl: true,
        storeName: true,
        reviewCount: true,
        reviewRating: true,
        reviewPhotoVideoCount: true,
        reviewMonthlyUseCount: true,
        reviewRepurchaseCount: true,
        reviewStorePickCount: true,
        reviewStarSummary: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const targetIds = targets.map((t) => t.id);
    const histories = targetIds.length
      ? await prisma.smartstoreReviewHistory.findMany({
          where: { targetId: { in: targetIds } },
          orderBy: [{ targetId: "asc" }, { trackedDate: "desc" }, { createdAt: "desc" }],
          select: {
            targetId: true,
            trackedDate: true,
            reviewCount: true,
            reviewRating: true,
            reviewPhotoVideoCount: true,
            reviewMonthlyUseCount: true,
            reviewRepurchaseCount: true,
            reviewStorePickCount: true,
            reviewStarSummary: true,
            createdAt: true,
          },
        })
      : [];

    const latest2ByTargetId = new Map<
      string,
      Array<{
        trackedDate: string;
        reviewCount: number;
        reviewRating: number | null;
        reviewPhotoVideoCount: number | null;
        reviewMonthlyUseCount: number | null;
        reviewRepurchaseCount: number | null;
        reviewStorePickCount: number | null;
        reviewStarSummary: unknown | null;
        createdAt: Date;
      }>
    >();
    for (const h of histories) {
      const arr = latest2ByTargetId.get(h.targetId) ?? [];
      if (arr.length >= 2) continue;
      arr.push(h);
      latest2ByTargetId.set(h.targetId, arr);
    }

    const payload = targets.map((t) => {
      const h2 = latest2ByTargetId.get(t.id) ?? [];
      const latest = h2[0] ?? null;
      const prev = h2[1] ?? null;
      const deltaCount =
        latest && prev ? latest.reviewCount - prev.reviewCount : null;
      const deltaRating =
        latest && prev && latest.reviewRating != null && prev.reviewRating != null
          ? Number((latest.reviewRating - prev.reviewRating).toFixed(2))
          : null;
      const deltaPhotoVideo =
        latest && prev && latest.reviewPhotoVideoCount != null && prev.reviewPhotoVideoCount != null
          ? latest.reviewPhotoVideoCount - prev.reviewPhotoVideoCount
          : null;
      const deltaMonthlyUse =
        latest && prev && latest.reviewMonthlyUseCount != null && prev.reviewMonthlyUseCount != null
          ? latest.reviewMonthlyUseCount - prev.reviewMonthlyUseCount
          : null;
      const deltaRepurchase =
        latest && prev && latest.reviewRepurchaseCount != null && prev.reviewRepurchaseCount != null
          ? latest.reviewRepurchaseCount - prev.reviewRepurchaseCount
          : null;
      const deltaStorePick =
        latest && prev && latest.reviewStorePickCount != null && prev.reviewStorePickCount != null
          ? latest.reviewStorePickCount - prev.reviewStorePickCount
          : null;

      return {
        id: t.id,
        createdAt: t.createdAt.toISOString(),
        target: {
          id: t.id,
          productId: t.productId,
          productUrl: t.productUrl,
          name: t.name,
          imageUrl: t.imageUrl ?? null,
          storeName: t.storeName ?? null,
          reviewCount: t.reviewCount ?? null,
          reviewRating: t.reviewRating ?? null,
          reviewPhotoVideoCount: t.reviewPhotoVideoCount ?? null,
          reviewMonthlyUseCount: t.reviewMonthlyUseCount ?? null,
          reviewRepurchaseCount: t.reviewRepurchaseCount ?? null,
          reviewStorePickCount: t.reviewStorePickCount ?? null,
          reviewStarSummary: t.reviewStarSummary ?? null,
          updatedAtLabel: formatKoDateTime(t.updatedAt),
        },
        latestHistory: latest
          ? {
              trackedDate: latest.trackedDate,
              reviewCount: latest.reviewCount,
              reviewRating: latest.reviewRating,
              reviewPhotoVideoCount: latest.reviewPhotoVideoCount ?? null,
              reviewMonthlyUseCount: latest.reviewMonthlyUseCount ?? null,
              reviewRepurchaseCount: latest.reviewRepurchaseCount ?? null,
              reviewStorePickCount: latest.reviewStorePickCount ?? null,
              reviewStarSummary: latest.reviewStarSummary ?? null,
              createdAt: latest.createdAt.toISOString(),
            }
          : null,
        prevHistory: prev
          ? {
              trackedDate: prev.trackedDate,
              reviewCount: prev.reviewCount,
              reviewRating: prev.reviewRating,
              reviewPhotoVideoCount: prev.reviewPhotoVideoCount ?? null,
              reviewMonthlyUseCount: prev.reviewMonthlyUseCount ?? null,
              reviewRepurchaseCount: prev.reviewRepurchaseCount ?? null,
              reviewStorePickCount: prev.reviewStorePickCount ?? null,
              reviewStarSummary: prev.reviewStarSummary ?? null,
              createdAt: prev.createdAt.toISOString(),
            }
          : null,
        delta: {
          reviewCount: deltaCount,
          reviewRating: deltaRating,
          reviewPhotoVideoCount: deltaPhotoVideo,
          reviewMonthlyUseCount: deltaMonthlyUse,
          reviewRepurchaseCount: deltaRepurchase,
          reviewStorePickCount: deltaStorePick,
        },
      };
    });

    return NextResponse.json({ ok: true, targets: payload });
  } catch (e) {
    console.error("[smartstore-review-targets][GET]", e);
    return NextResponse.json({ error: "대상 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

// ==========================================
// 2. POST: /smartstore와 동일한 등록 파이프라인 (space=NAVER_REVIEW) + 리뷰 타깃 동기화
// ==========================================
export async function POST(req: Request) {
  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const manualNameRaw = raw?.manualName != null ? String(raw.manualName).trim() : "";
    const manualImageRaw = raw?.manualImageUrl != null ? String(raw.manualImageUrl).trim() : "";

    const merged: Record<string, unknown> = {
      ...raw,
      space: String(raw?.space ?? "NAVER_REVIEW").trim() || "NAVER_REVIEW",
      productUrl: String(raw?.productUrl ?? "").trim(),
    };

    if (manualNameRaw) {
      merged.skipMetaFetch = true;
      merged.name = manualNameRaw;
      merged.imageUrl = manualImageRaw;
      merged.thumbnailLink = manualImageRaw;
    }

    const nextReq = new Request(req.url, {
      method: "POST",
      headers: new Headers(req.headers),
      body: JSON.stringify(merged),
    });
    return executeSmartstoreProductSavePost(nextReq);
  } catch (e) {
    console.error("[smartstore-review-targets][POST]", e);
    return NextResponse.json({ error: "대상 추가 실패" }, { status: 500 });
  }
}

// ==========================================
// 3. DELETE: 삭제 로직 (원본 보존)
// ==========================================
export async function DELETE(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) return NextResponse.json({ error: "id 쿼리 필요" }, { status: 400 });

    const target = await prisma.smartstoreReviewTarget.findFirst({
      where: { id, userId },
      select: { id: true, productId: true },
    });
    if (!target) return NextResponse.json({ error: "대상 없음" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.smartstoreReviewTarget.delete({ where: { id } });
      await tx.smartstoreProduct.deleteMany({
        where: {
          userId,
          productId: target.productId,
          space: "NAVER_REVIEW" as SmartstoreSpace,
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[smartstore-review-targets][DELETE]", e);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}