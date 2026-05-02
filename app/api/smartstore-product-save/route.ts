import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  fetchSmartstoreProductMeta,
  SMARTSTORE_TRACE_LOG,
} from "@/lib/fetch-smartstore-product-meta";
import {
  fetchSmartstoreMetaViaShoppingSearchApi,
  isSmartstoreShoppingSearchConfigured,
} from "@/lib/fetch-smartstore-search-api";
import {
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";
import { isSuspiciousSmartstoreMetaName } from "@/lib/smartstore-meta-guard";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/smartstore-product-save
 * - productUrl 수신 → productId 추출
 * - 모바일 우회 기반 fetch로 meta 수집
 * - 최종 name/category/imageUrl 저장
 * - [추가] 유저 티어에 따른 등록 개수 제한 로직 포함
 */
export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    console.log("현재 세션 정보:", session);
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json(
        { error: session ? "세션은 있으나 userId가 누락되었습니다" : "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    // Ensure the session userId exists in DB and fetch tier/counts
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
          // race: created by another request
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

    const body = await req.json();

    const productUrl = String(body?.productUrl ?? "").trim();
    const skipMetaFetch = body?.skipMetaFetch === true;
    const nameOverride = body?.name != null ? String(body.name).trim() : "";
    const categoryOverride =
      body?.category != null ? String(body.category).trim() : "";
    const imageOverride =
      body?.imageUrl != null ? String(body.imageUrl).trim() : "";
    const thumbnailOverride =
      body?.thumbnailLink != null ? String(body.thumbnailLink).trim() : "";

    if (!productUrl) {
      return NextResponse.json(
        { error: "상품 URL을 입력해주세요." },
        { status: 400 }
      );
    }

    const normalizedUrl = productUrl.startsWith("http")
      ? productUrl
      : `https://${productUrl}`;

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
      return NextResponse.json(
        {
          error:
            "스마트스토어·브랜드스토어·쇼핑 상품 URL 형식인지 확인해주세요.",
        },
        { status: 400 }
      );
    }

    const naverProductId = extractNaverSmartstoreProductId(normalizedUrl);

    if (!naverProductId) {
      return NextResponse.json(
        { error: "상품 URL에서 상품 번호를 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    const fallbackName = `상품 #${naverProductId}`;

    const space = (() => {
      const raw = String(body?.space ?? "").trim().toUpperCase();
      return raw === "PLUS_STORE" ? ("PLUS_STORE" as const) : ("NAVER_PRICE" as const);
    })();

    // DB에 이미 있는 상품인지 확인
    const existing = await prisma.smartstoreProduct.findUnique({
      where: {
        userId_productId_space: { userId, productId: naverProductId, space },
      },
      select: {
        id: true,
        name: true,
        category: true,
        imageUrl: true,
        thumbnailLink: true,
        mallName: true,
      },
    });

    // =====================================================================
    // [추가된 로직] 신규 등록일 경우에만 총 등록 개수를 확인하고 티어 제한 방어
    // =====================================================================
    if (!existing) {
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

    let meta: {
      name: string | null;
      imageUrl: string | null;
      category: string | null;
      mallName?: string | null;
    } = {
      name: null,
      imageUrl: null,
      category: null,
    };

    let productPageFetch: Awaited<
      ReturnType<typeof fetchSmartstoreProductMeta>
    >["productPageFetch"] = null;

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

    console.log(`${SMARTSTORE_TRACE_LOG} [save] 시작`, {
      userId,
      productUrl: normalizedUrl,
      pcUrl,
      productId: naverProductId,
      space,
      skipMetaFetch,
      urlQueryHint,
    });

    if (!skipMetaFetch) {
      const fetched = await fetchSmartstoreProductMeta(pcUrl, naverProductId);
      meta = fetched.meta;
      productPageFetch = fetched.productPageFetch;
    }

    const gotServerMeta =
      !skipMetaFetch &&
      (Boolean(meta.name?.trim()) ||
        Boolean(meta.imageUrl?.trim()) ||
        Boolean(meta.category?.trim()));

    if (!skipMetaFetch && !gotServerMeta) {
      const shoppingConfigured = isSmartstoreShoppingSearchConfigured();
      if (shoppingConfigured) {
        try {
          const searchMeta = await fetchSmartstoreMetaViaShoppingSearchApi({
            productUrl: pcUrl,
            productId: naverProductId,
            existingNameHint: existing?.name ?? null,
            ogTitle: urlQueryHint,
            pageProductNameHint: meta.name ?? null,
          });
          if (searchMeta.searchApiMatched) {
            meta = {
              name: meta.name?.trim() ? meta.name : searchMeta.name,
              imageUrl: meta.imageUrl?.trim()
                ? meta.imageUrl
                : (searchMeta.thumbnailLink ?? null),
              category: meta.category?.trim() ? meta.category : searchMeta.category,
              mallName: searchMeta.mallName,
            };
          }
        } catch (e) {
          if (isSmartstoreNaverRateLimitedError(e)) {
            throw e;
          }
          console.error(`${SMARTSTORE_TRACE_LOG} [save] 쇼핑검색 보강 실패`, e);
        }
      }
    }

    if (isSuspiciousSmartstoreMetaName(meta.name)) {
      meta.name = null;
    }

    const nameFromFetcher = skipMetaFetch ? "" : (meta.name?.trim() || "").trim();
    const nameFromOverride = (nameOverride || "").trim();

    const nameFinal = (
      nameFromOverride ||
      nameFromFetcher ||
      fallbackName
    ).trim();

    const categoryRaw = skipMetaFetch
      ? (categoryOverride || "").trim()
      : (categoryOverride || meta.category?.trim() || "").trim();

    const category = categoryRaw.length > 0 ? categoryRaw : null;

    const thumbFromMeta = skipMetaFetch
      ? ""
      : (meta.imageUrl?.trim() || "").trim();

    const thumbFromOverride = (thumbnailOverride || imageOverride || "").trim();
    const thumbRaw = (thumbFromOverride || thumbFromMeta || "").trim();
    const thumbnailLink = thumbRaw.length > 0 ? thumbRaw : null;
    const imageUrl = thumbnailLink;

    const gotFinalMeta =
      !skipMetaFetch &&
      (Boolean(meta.name?.trim()) ||
        Boolean(meta.imageUrl?.trim()) ||
        Boolean(meta.category?.trim()));

    if (!skipMetaFetch && !gotFinalMeta) {
      const overrideProvided = Boolean(nameFromOverride) || Boolean(thumbFromOverride);
      if (!overrideProvided) {
        return NextResponse.json(
          { error: "네이버에서 정보를 가져오지 못했습니다" },
          { status: 400 }
        );
      }
    }

    const metaFetchIncomplete = !skipMetaFetch && !gotFinalMeta;

    const data = {
      name: nameFinal,
      category,
      thumbnailLink,
      imageUrl,
      mallName:
        !skipMetaFetch && typeof meta.mallName === "string" && meta.mallName.trim()
          ? meta.mallName.trim()
          : null,
      productId: naverProductId,
    };

    let product: Awaited<ReturnType<typeof prisma.smartstoreProduct.upsert>>;
    try {
      product = await prisma.smartstoreProduct.upsert({
        where: {
          userId_productId_space: { userId, productId: naverProductId, space },
        },
        update: {
          productUrl: normalizedUrl,
          name: nameFinal,
          category,
          thumbnailLink,
          imageUrl,
          mallName: data.mallName,
        },
        create: {
          userId,
          productId: naverProductId,
          space,
          productUrl: normalizedUrl,
          name: nameFinal,
          category,
          thumbnailLink,
          imageUrl,
          mallName: data.mallName,
        },
        include: { keywords: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "DB 유니크 제약이 (userId, productId)로 남아 있어 페이지별 분리가 불가능합니다. prisma migrate/reset 후 다시 시도해주세요.",
          },
          { status: 409 }
        );
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return NextResponse.json(
          { error: "로그인이 필요합니다." },
          { status: 401 }
        );
      }
      throw e;
    }

    return NextResponse.json({
      ok: true,
      product,
      updated: Boolean(existing),
      metaFetchIncomplete,
    });
  } catch (e) {
    console.error("[smartstore-product-save]", e);
    if (isSmartstoreNaverRateLimitedError(e)) {
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "상품 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}