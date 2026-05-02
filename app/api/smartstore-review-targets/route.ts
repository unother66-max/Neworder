import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchSmartstoreProductMeta } from "@/lib/fetch-smartstore-product-meta";
import {
  fetchSmartstoreMetaViaShoppingSearchApi,
  isSmartstoreShoppingSearchConfigured,
} from "@/lib/fetch-smartstore-search-api";
import {
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";
import { isSmartstoreNaverRateLimitedError, randomSmartstoreDelay } from "@/lib/smartstore-bot-shield";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractStoreSlugFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    if (pi > 0 && segs[pi - 1]) return segs[pi - 1];
  } catch {
    // ignore
  }
  return null;
}

function formatKoDateTime(d: Date): string {
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

// ... (위쪽의 GET 함수 부분은 그대로 둡니다) ...

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // =====================================================================
    // 1. 유저 정보 동기화 및 등록된 항목 개수(_count), 티어(tier) 가져오기
    // =====================================================================
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true,
        tier: true,
        _count: {
          select: {
            smartstoreProducts: true,
            places: true,
            smartstoreReviewTargets: true,
          }
        }
      },
    });

    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            id: userId,
            email:
              typeof session?.user?.email === "string" && session.user.email.trim()
                ? session.user.email.trim()
                : `${userId}@kakao.local`,
            name:
              typeof session?.user?.name === "string" && session.user.name.trim()
                ? session.user.name.trim()
                : null,
          },
          select: { 
            id: true,
            tier: true,
            _count: {
              select: {
                smartstoreProducts: true,
                places: true,
                smartstoreReviewTargets: true,
              }
            }
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          user = await prisma.user.findUnique({
            where: { id: userId },
            select: { 
              id: true,
              tier: true,
              _count: {
                select: {
                  smartstoreProducts: true,
                  places: true,
                  smartstoreReviewTargets: true,
                }
              }
            },
          });
        } else {
          throw e;
        }
      }
    }
    
    if (!user) {
      return NextResponse.json(
        { error: "세션은 있으나 userId가 DB에 동기화되지 않았습니다" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const productUrlRaw = String(body?.productUrl ?? "").trim();
    const manualNameRaw = body?.manualName != null ? String(body.manualName).trim() : "";
    const manualImageUrlRaw =
      body?.manualImageUrl != null ? String(body.manualImageUrl).trim() : "";
      
    if (!productUrlRaw) {
      return NextResponse.json({ error: "productUrl이 필요합니다." }, { status: 400 });
    }
    
    const normalizedUrl = productUrlRaw.startsWith("http")
      ? productUrlRaw
      : `https://${productUrlRaw}`;

    const naverProductId = extractNaverSmartstoreProductId(normalizedUrl);
    if (!naverProductId) {
      return NextResponse.json({ error: "상품 URL에서 상품 번호를 찾을 수 없습니다." }, { status: 400 });
    }

    // 중복 등록 여부 먼저 확인 (중복이면 개수 제한 검사를 건너뛰기 위함)
    const existingTarget = await prisma.smartstoreReviewTarget.findUnique({
      where: { userId_productId: { userId, productId: naverProductId } },
      select: { id: true }
    });

    // =====================================================================
    // 2. 신규 등록일 경우에만 총 등록 개수 확인 및 티어 제한 방어
    // =====================================================================
    if (!existingTarget) {
      const totalItems = 
        (user._count?.smartstoreProducts || 0) + 
        (user._count?.places || 0) + 
        (user._count?.smartstoreReviewTargets || 0);
      
      const MAX_LIMIT = user.tier === "PRO" ? 999 : 10;

      if (totalItems >= MAX_LIMIT) {
        return NextResponse.json(
          { error: `모든 항목 통틀어 최대 등록 개수(${MAX_LIMIT}개)를 초과했습니다.` },
          { status: 403 }
        );
      }
    }
    // =====================================================================


    const urlQueryHint = (() => {
      try {
        const u = new URL(normalizedUrl);
        const candidates = [
          u.searchParams.get("nl-query"),
          u.searchParams.get("nl_query"),
          u.searchParams.get("n_query"),
          u.searchParams.get("query"),
          u.searchParams.get("q"),
        ]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean);
        if (candidates.length === 0) return null;
        return candidates[0] ?? null;
      } catch {
        return null;
      }
    })();

    const pcUrl = (() => {
      try {
        const u = new URL(normalizedUrl);
        if (u.hostname === "m.smartstore.naver.com") u.hostname = "smartstore.naver.com";
        if (u.hostname === "m.brand.naver.com") u.hostname = "brand.naver.com";
        return `${u.protocol}//${u.hostname}${u.pathname}`;
      } catch {
        return normalizedUrl
          .split("#")[0]!
          .split("?")[0]!
          .replace("://m.smartstore.naver.com", "://smartstore.naver.com")
          .replace("://m.brand.naver.com", "://brand.naver.com");
      }
    })();
    
    if (!isLikelySmartstoreProductUrl(normalizedUrl)) {
      return NextResponse.json({ error: "스마트스토어/브랜드스토어 상품 URL이 아닙니다." }, { status: 400 });
    }

    if (manualNameRaw) {
      const storeNameManual = extractStoreSlugFromUrl(normalizedUrl);
      const created = await prisma.smartstoreReviewTarget.upsert({
        where: { userId_productId: { userId, productId: naverProductId } },
        update: {
          productUrl: normalizedUrl,
          name: manualNameRaw,
          imageUrl: manualImageUrlRaw || null,
          storeName: storeNameManual,
        },
        create: {
          userId,
          productId: naverProductId,
          productUrl: normalizedUrl,
          name: manualNameRaw,
          imageUrl: manualImageUrlRaw || null,
          storeName: storeNameManual,
        },
      });
      return NextResponse.json({ ok: true, target: created, manual: true });
    }

    await randomSmartstoreDelay("ranking");
    const meta = await fetchSmartstoreProductMeta(pcUrl, naverProductId);
    let name = meta.meta.name?.trim() ? meta.meta.name.trim() : null;
    let imageUrl = meta.meta.imageUrl?.trim() ? meta.meta.imageUrl.trim() : null;

    if (!name) {
      const shoppingConfigured = isSmartstoreShoppingSearchConfigured();
      if (shoppingConfigured) {
        try {
          const searchMeta = await fetchSmartstoreMetaViaShoppingSearchApi({
            productUrl: pcUrl,
            productId: naverProductId,
            existingNameHint: null,
            ogTitle: urlQueryHint || null,
            pageProductNameHint: null,
          });
          if (searchMeta.searchApiMatched) {
            name = name ?? (searchMeta.name?.trim() ? searchMeta.name.trim() : null);
            imageUrl =
              imageUrl ??
              (searchMeta.thumbnailLink?.trim() ? searchMeta.thumbnailLink.trim() : null);
          }
        } catch (e) {
          if (isSmartstoreNaverRateLimitedError(e)) throw e;
          console.error("[smartstore-review-targets][POST] shopping search fallback failed", e);
        }
      }
    }

    if (!name) {
      return NextResponse.json(
        { error: "네이버에서 정보를 가져오지 못했습니다" },
        { status: 400 }
      );
    }

    const storeName = extractStoreSlugFromUrl(normalizedUrl);

    const created = await prisma.smartstoreReviewTarget.upsert({
      where: { userId_productId: { userId, productId: naverProductId } },
      update: { productUrl: normalizedUrl, name, imageUrl, storeName },
      create: { userId, productId: naverProductId, productUrl: normalizedUrl, name, imageUrl, storeName },
    });

    return NextResponse.json({ ok: true, target: created });
  } catch (e) {
    console.error("[smartstore-review-targets][POST]", e);
    if (isSmartstoreNaverRateLimitedError(e)) {
      return NextResponse.json(
        { error: "보안 차단 감지: 10초간 긴급 휴식에 들어갑니다" },
        { status: 429 }
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "로그인 상태를 확인해주세요. (userId 참조 오류)" },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "대상 추가에 실패했습니다." }, { status: 500 });
  }
}

// ... (이 아래에 있는 DELETE 함수 부분은 그대로 둡니다) ...

export async function DELETE(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "id 쿼리가 필요합니다." }, { status: 400 });
    }

    const target = await prisma.smartstoreReviewTarget.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "대상을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.smartstoreReviewTarget.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[smartstore-review-targets][DELETE]", e);
    return NextResponse.json({ error: "대상 삭제에 실패했습니다." }, { status: 500 });
  }
}

