import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, SmartstoreSpace } from "@prisma/client";
import { getLimit } from "@/lib/constants";
import {
  fetchSmartstoreProductMeta,
  SMARTSTORE_TRACE_LOG,
} from "@/lib/fetch-smartstore-product-meta";
import {
  fetchSmartstoreMetaViaShoppingSearchApi,
  isSmartstoreShoppingSearchConfigured,
} from "@/lib/fetch-smartstore-search-api";
import {
  extractNaverShoppingProductRef,
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";
import { isSuspiciousSmartstoreMetaName } from "@/lib/smartstore-meta-guard";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

function extractStoreSlugFromProductUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    if (pi > 0 && /^\d+$/.test(segs[pi + 1] ?? "")) {
      return segs[pi - 1] ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

function parseSmartstoreSpace(body: Record<string, unknown>): SmartstoreSpace {
  const raw = String(body?.space ?? "").trim().toUpperCase();
  if (raw === "PLUS_STORE") return SmartstoreSpace.PLUS_STORE;
  if (raw === "NAVER_REVIEW" || raw === "SMARTSTORE_REVIEW") {
    return SmartstoreSpace.NAVER_REVIEW;
  }
  return SmartstoreSpace.NAVER_PRICE;
}

/**
 * 사용자 등록 한도 스캘: 장소 + 가격·플러스 상품 NAVER_PRICE/PLUS_STORE
 * + NAVER_REVIEW 상품 행 수 + 레거시(연결 상품 행 없는) 리뷰 타깃만.
 */
async function countUnifiedRegistrationSlots(userId: string): Promise<number> {
  // Promise.all 금지: 동일 요청에서 풀에서 연결을 동시 다발로 빌리며 P2024 유발 가능성을 줄입니다.
  const placeCnt = await prisma.place.count({ where: { userId } });
  const rankPlusCnt = await prisma.smartstoreProduct.count({
    where: {
      userId,
      space: { in: [SmartstoreSpace.NAVER_PRICE, SmartstoreSpace.PLUS_STORE] },
    },
  });
  const naverReviewRows = await prisma.smartstoreProduct.findMany({
    where: { userId, space: SmartstoreSpace.NAVER_REVIEW },
    select: { productId: true },
  });
  const targetRows = await prisma.smartstoreReviewTarget.findMany({
    where: { userId },
    select: { productId: true },
  });
  const reviewProductIdSet = new Set(naverReviewRows.map((r) => r.productId));
  const orphanedTargets = targetRows.filter((t) => !reviewProductIdSet.has(t.productId)).length;

  return placeCnt + rankPlusCnt + naverReviewRows.length + orphanedTargets;
}

/**
 * 통합 저장: 가격비교·플러스·리뷰 추적(NAVER_REVIEW) 상품 등록.
 * 세션은 req의 Cookie 헤더로부터 읽습니다.
 */
export async function executeSmartstoreProductSavePost(req: Request): Promise<Response> {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    console.log("현재 세션 정보:", session);
    const userId = session?.user?.id as string | undefined;
    const userEmail = session?.user?.email as string | null | undefined;

    if (!userId) {
      return NextResponse.json(
        { error: session ? "세션은 있으나 userId가 누락되었습니다" : "로그인이 필요합니다." },
        { status: 401 }
      );
    }

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
          },
        },
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
              },
            },
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
                },
              },
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const productUrl = String(body?.productUrl ?? "").trim();
    const skipMetaFetch = body?.skipMetaFetch === true;
    const nameOverride = body?.name != null ? String(body.name).trim() : "";
    const categoryOverride = body?.category != null ? String(body.category).trim() : "";
    const imageOverride = body?.imageUrl != null ? String(body.imageUrl).trim() : "";
    const thumbnailOverride =
      body?.thumbnailLink != null ? String(body.thumbnailLink).trim() : "";

    if (!productUrl) {
      return NextResponse.json({ error: "상품 URL을 입력해주세요." }, { status: 400 });
    }

    const normalizedUrl = productUrl.startsWith("http") ? productUrl : `https://${productUrl}`;

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
      console.warn(`${SMARTSTORE_TRACE_LOG} [save] 실패 단계: URL 형식 검증`, {
        productUrl: normalizedUrl,
      });
      return NextResponse.json(
        {
          error: "스마트스토어·브랜드스토어·쇼핑 상품 URL 형식인지 확인해주세요.",
        },
        { status: 400 }
      );
    }

    const productRef = extractNaverShoppingProductRef(normalizedUrl);
    const naverProductId =
      productRef?.productId ?? extractNaverSmartstoreProductId(normalizedUrl);
    const productUrlType = productRef?.type ?? "unknown";
    const metaFetchTargetUrl =
      productUrlType === "window" || productUrlType === "shoppingCatalog"
        ? normalizedUrl
        : pcUrl;

    if (!naverProductId) {
      console.warn(`${SMARTSTORE_TRACE_LOG} [save] 실패 단계: 상품ID 추출`, {
        productUrl: normalizedUrl,
        pcUrl,
      });
      return NextResponse.json(
        { error: "상품 URL에서 상품 번호를 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    const storeSlug = extractStoreSlugFromProductUrl(normalizedUrl);
    const fallbackName = (() => {
      if (storeSlug) return `${storeSlug} 상품 #${naverProductId}`;
      if (productUrlType === "shoppingCatalog") return `catalog #${naverProductId}`;
      return `상품 #${naverProductId}`;
    })();

    const space = parseSmartstoreSpace(body);

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

    if (!existing) {
      const totalItems = await countUnifiedRegistrationSlots(userId);
      const MAX_LIMIT = getLimit(user.tier, userEmail);

      if (totalItems >= MAX_LIMIT) {
        return NextResponse.json(
          {
            error: `${user.tier || "FREE"} 등급의 최대 등록 개수(${MAX_LIMIT}개)를 초과했습니다.`,
          },
          { status: 403 }
        );
      }
    }

    let meta: {
      name: string | null;
      imageUrl: string | null;
      category: string | null;
      leafCategoryId: number | null;
      mallName?: string | null;
    } = {
      name: null,
      imageUrl: null,
      category: null,
      leafCategoryId: null,
    };

    let searchMatchInfo: {
      matchedProductId: string | null;
      isStrongMatch: boolean;
      weakMatch: boolean;
      metaSource: string | null;
    } = {
      matchedProductId: null,
      isStrongMatch: false,
      weakMatch: false,
      metaSource: null,
    };

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
      metaFetchTargetUrl,
      productId: naverProductId,
      productUrlType,
      space,
      skipMetaFetch,
      urlQueryHint,
    });

    if (!skipMetaFetch) {
      const fetched = await fetchSmartstoreProductMeta(metaFetchTargetUrl, naverProductId);
      meta = fetched.meta;
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
            productUrl: metaFetchTargetUrl,
            productId: naverProductId,
            productUrlType,
            existingNameHint: existing?.name ?? null,
            ogTitle: urlQueryHint,
            pageProductNameHint: meta.name ?? null,
          });
          console.log(`${SMARTSTORE_TRACE_LOG} [save] search fallback 결과`, {
            inputProductId: naverProductId,
            productUrlType,
            matchedProductId: searchMeta.matchedProductId,
            isStrongMatch: searchMeta.isStrongMatch,
            weakMatch: searchMeta.weakMatch,
            metaSource: searchMeta.metaSource,
          });
          searchMatchInfo = {
            matchedProductId: searchMeta.matchedProductId,
            isStrongMatch: searchMeta.isStrongMatch,
            weakMatch: searchMeta.weakMatch,
            metaSource: searchMeta.metaSource,
          };
          if (searchMeta.searchApiMatched) {
            meta = {
              ...meta,
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
    if (meta.name?.trim() && /^네이버\s*쇼핑$/i.test(meta.name.trim())) {
      meta.name = null;
    }

    const nameFromFetcher = skipMetaFetch ? "" : (meta.name?.trim() || "").trim();
    const nameFromOverride = (nameOverride || "").trim();

    const nameFinal = (nameFromOverride || nameFromFetcher || fallbackName).trim();

    const categoryRaw = skipMetaFetch
      ? (categoryOverride || "").trim()
      : (categoryOverride || meta.category?.trim() || "").trim();

    const category = categoryRaw.length > 0 ? categoryRaw : null;

    const thumbFromMeta = skipMetaFetch ? "" : (meta.imageUrl?.trim() || "").trim();

    const thumbFromOverride = (thumbnailOverride || imageOverride || "").trim();
    const thumbRaw = (thumbFromOverride || thumbFromMeta || "").trim();
    const thumbnailLink = thumbRaw.length > 0 ? thumbRaw : null;
    const imageUrl = thumbnailLink;

    const leafCategoryIdFromMeta = ((): number | null => {
      const v = meta.leafCategoryId;
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      const t = Math.trunc(v);
      return t > 0 ? t : null;
    })();

    const gotFinalMeta =
      !skipMetaFetch &&
      (Boolean(meta.name?.trim()) ||
        Boolean(meta.imageUrl?.trim()) ||
        Boolean(meta.category?.trim()));

    if (!skipMetaFetch && !gotFinalMeta) {
      const overrideProvided = Boolean(nameFromOverride) || Boolean(thumbFromOverride);
      const allowMinimalSaveWhenMetaMissing =
        productUrlType === "brand" || productUrlType === "shoppingCatalog";

      console.warn(`${SMARTSTORE_TRACE_LOG} [save] 메타 부족 감지`, {
        productId: naverProductId,
        productUrl: normalizedUrl,
        metaFetchTargetUrl,
        productUrlType,
        gotServerMeta,
        gotFinalMeta,
        overrideProvided,
        allowMinimalSaveWhenMetaMissing,
        fallbackName,
        storeSlug,
      });

      if (!overrideProvided && !allowMinimalSaveWhenMetaMissing) {
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

    console.log(`${SMARTSTORE_TRACE_LOG} [save] 최종 저장 payload`, {
      inputProductId: naverProductId,
      productUrlType,
      matchedProductId: searchMatchInfo.matchedProductId,
      isStrongMatch: searchMatchInfo.isStrongMatch,
      weakMatch: searchMatchInfo.weakMatch,
      metaSource:
        gotServerMeta || gotFinalMeta
          ? "fetch-meta"
          : (searchMatchInfo.metaSource ?? "fallback-or-manual"),
      name: data.name,
      category: data.category,
      thumbnailLink: data.thumbnailLink,
    });

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
          ...(leafCategoryIdFromMeta != null ? { leafCategoryId: leafCategoryIdFromMeta } : {}),
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
          ...(leafCategoryIdFromMeta != null ? { leafCategoryId: leafCategoryIdFromMeta } : {}),
        },
        include: { keywords: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        console.error(`${SMARTSTORE_TRACE_LOG} [save] 실패 단계: DB upsert 유니크 충돌`, {
          userId,
          productId: naverProductId,
          space,
        });
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
        console.error(`${SMARTSTORE_TRACE_LOG} [save] 실패 단계: DB upsert FK 오류`, {
          userId,
          productId: naverProductId,
          space,
        });
        return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
      }
      throw e;
    }

    if (space === SmartstoreSpace.NAVER_REVIEW) {
      const storeNameForReview = storeSlug ?? data.mallName;
      await prisma.smartstoreReviewTarget.upsert({
        where: { userId_productId: { userId, productId: naverProductId } },
        update: {
          productUrl: normalizedUrl,
          name: nameFinal,
          imageUrl,
          storeName: storeNameForReview,
          ...(leafCategoryIdFromMeta != null ? { leafCategoryId: leafCategoryIdFromMeta } : {}),
        },
        create: {
          userId,
          productId: naverProductId,
          productUrl: normalizedUrl,
          name: nameFinal,
          imageUrl,
          storeName: storeNameForReview,
          ...(leafCategoryIdFromMeta != null ? { leafCategoryId: leafCategoryIdFromMeta } : {}),
        },
      });
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
      return NextResponse.json({ ok: false, error: e.message }, { status: 429 });
    }
    return NextResponse.json({ error: "상품 등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}
