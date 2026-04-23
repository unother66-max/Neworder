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
  fetchSmartstoreMetaFromPlaywrightService,
  isSmartstorePlaywrightServiceConfigured,
} from "@/lib/fetch-smartstore-playwright-service";
import {
  fetchSmartstoreMetaViaShoppingSearchApi,
  isSmartstoreShoppingSearchConfigured,
} from "@/lib/fetch-smartstore-search-api";
import { getSmartstoreProductSnapshot } from "@/lib/get-smartstore-product-snapshot";
import {
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";
import { isSuspiciousSmartstoreMetaName } from "@/lib/smartstore-meta-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/smartstore-product-save
 * - productUrl 수신 → productId 추출
 * - SMARTSTORE_PLAYWRIGHT_URL 있으면 Playwright 서비스 우선 호출
 * - 없으면 기존 fetchSmartstoreProductMeta fallback
 * - 최종 name/category/imageUrl 저장
 */
export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
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

    const playwrightConfigured = isSmartstorePlaywrightServiceConfigured();
    let playwrightServiceAttempted = false;
    let playwrightServiceFailed = false;
    let playwrightServiceError: string | null = null;

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
        // 짧은 일반어(예: "침대")라도 매칭에는 도움이 될 수 있어 그대로 둠
        return candidates[0] ?? null;
      } catch {
        return null;
      }
    })();

    console.log(`${SMARTSTORE_TRACE_LOG} [save] 시작`, {
      userId,
      productUrl: normalizedUrl,
      productId: naverProductId,
      space,
      skipMetaFetch,
      playwrightConfigured,
      SMARTSTORE_PLAYWRIGHT_URL:
        process.env.SMARTSTORE_PLAYWRIGHT_URL?.trim() || "(없음)",
      urlQueryHint,
    });

    if (!skipMetaFetch) {
      if (playwrightConfigured) {
        try {
          playwrightServiceAttempted = true;
          console.log(`${SMARTSTORE_TRACE_LOG} [save] Playwright 서비스 호출 시작`, {
            productUrl: normalizedUrl,
            serviceUrl: process.env.SMARTSTORE_PLAYWRIGHT_URL?.trim() || "(없음)",
          });

          meta = await fetchSmartstoreMetaFromPlaywrightService(normalizedUrl, {
            timeoutMs: 55_000,
          });

          console.log(`${SMARTSTORE_TRACE_LOG} [save] Playwright 서비스 호출 성공`, {
            meta,
          });
        } catch (error) {
          playwrightServiceFailed = true;
          playwrightServiceError =
            error instanceof Error ? error.message : String(error);
          console.error(
            `${SMARTSTORE_TRACE_LOG} [save] Playwright 서비스 호출 실패`,
            error
          );

          console.log(
            `${SMARTSTORE_TRACE_LOG} [save] 기존 fetchSmartstoreProductMeta fallback 시작`,
            {
              productUrl: normalizedUrl,
              productId: naverProductId,
            }
          );

          const fetched = await fetchSmartstoreProductMeta(
            normalizedUrl,
            naverProductId
          );
          meta = fetched.meta;
          productPageFetch = fetched.productPageFetch;

          console.log(
            `${SMARTSTORE_TRACE_LOG} [save] 기존 fetchSmartstoreProductMeta fallback 완료`,
            {
              meta,
              productPageFetch,
            }
          );
        }
      } else {
        console.log(
          `${SMARTSTORE_TRACE_LOG} [save] Playwright 미설정 → 기존 fetchSmartstoreProductMeta 사용`,
          {
            productUrl: normalizedUrl,
            productId: naverProductId,
          }
        );

        const fetched = await fetchSmartstoreProductMeta(
          normalizedUrl,
          naverProductId
        );
        meta = fetched.meta;
        productPageFetch = fetched.productPageFetch;
      }
    }

    const gotServerMeta =
      !skipMetaFetch &&
      (Boolean(meta.name?.trim()) ||
        Boolean(meta.imageUrl?.trim()) ||
        Boolean(meta.category?.trim()));

    // 네이버 API가 429/HTML로 막히는 경우가 잦아, 공식 쇼핑검색 API로 최소 메타를 보강한다.
    // (place/kakao와 무관, smartstore 저장에만 적용)
    if (!skipMetaFetch && !gotServerMeta) {
      const shoppingConfigured = isSmartstoreShoppingSearchConfigured();
      console.log(`${SMARTSTORE_TRACE_LOG} [save] meta 비어있음 → 쇼핑검색 보강 시도`, {
        shoppingConfigured,
        productId: naverProductId,
      });
      if (shoppingConfigured) {
        try {
          const searchMeta = await fetchSmartstoreMetaViaShoppingSearchApi({
            productUrl: normalizedUrl,
            productId: naverProductId,
            existingNameHint: existing?.name ?? null,
            ogTitle: urlQueryHint,
            pageProductNameHint: meta.name ?? null,
          });
          if (searchMeta.searchApiMatched) {
            meta = {
              name: meta.name?.trim() ? meta.name : searchMeta.name,
              imageUrl: meta.imageUrl?.trim() ? meta.imageUrl : searchMeta.thumbnailLink,
              category: meta.category?.trim() ? meta.category : searchMeta.category,
              mallName: searchMeta.mallName,
            };
            console.log(`${SMARTSTORE_TRACE_LOG} [save] 쇼핑검색 보강 성공`, {
              name: meta.name,
              imageUrl: meta.imageUrl,
              category: meta.category,
              mallName: meta.mallName ?? null,
            });
          } else {
            console.log(`${SMARTSTORE_TRACE_LOG} [save] 쇼핑검색 매칭 실패`, {
              used: searchMeta.searchApiUsed,
            });
          }
        } catch (e) {
          console.error(`${SMARTSTORE_TRACE_LOG} [save] 쇼핑검색 보강 실패`, e);
        }
      }
    }

    // 로컬 개발 환경에서는 원격 Playwright가 없더라도 자체 Playwright로 한번 더 복구 시도
    // (Vercel 배포에서는 별도 Playwright 서비스 사용을 권장)
    const isVercel = process.env.VERCEL === "1";
    const gotMetaAfterSearch =
      !skipMetaFetch &&
      (Boolean(meta.name?.trim()) ||
        Boolean(meta.imageUrl?.trim()) ||
        Boolean(meta.category?.trim()));
    const shouldTryLocalSnapshot =
      !skipMetaFetch &&
      !gotMetaAfterSearch &&
      !isVercel &&
      (!playwrightConfigured || playwrightServiceFailed);
    if (shouldTryLocalSnapshot) {
      console.log(`${SMARTSTORE_TRACE_LOG} [save] 로컬 Playwright 스냅샷 폴백 시도`, {
        productUrl: normalizedUrl,
        playwrightConfigured,
        playwrightServiceAttempted,
        playwrightServiceFailed,
        playwrightServiceError,
      });
      try {
        const snap = await getSmartstoreProductSnapshot(normalizedUrl);
        meta = {
          name: snap.name?.trim() ? snap.name : meta.name,
          imageUrl: snap.imageUrl?.trim() ? snap.imageUrl : meta.imageUrl,
          category: snap.category?.trim() ? snap.category : meta.category,
          mallName: meta.mallName ?? null,
        };
        console.log(`${SMARTSTORE_TRACE_LOG} [save] 로컬 Playwright 스냅샷 결과`, {
          name: meta.name,
          imageUrl: meta.imageUrl,
          category: meta.category,
        });
      } catch (e) {
        console.error(`${SMARTSTORE_TRACE_LOG} [save] 로컬 Playwright 스냅샷 실패`, e);
      }
    }

    // 에러 페이지 제목이 name으로 들어오는 것을 차단
    if (isSuspiciousSmartstoreMetaName(meta.name)) {
      console.warn(`${SMARTSTORE_TRACE_LOG} [save] suspicious meta.name dropped`, {
        name: meta.name,
      });
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

    console.log(`${SMARTSTORE_TRACE_LOG} ⑦ DB 저장 직전`, {
      skipMetaFetch,
      playwrightConfigured,
      name: data.name,
      thumbnailLink: data.thumbnailLink,
      imageUrl: data.imageUrl,
      category: data.category,
      nameOverride: nameOverride || "(없음)",
      categoryOverride: categoryOverride || "(없음)",
      imageOverride: imageOverride || "(없음)",
      thumbnailOverride: thumbnailOverride || "(없음)",
      nameFallbackUsed: !nameFromOverride && !nameFromFetcher,
      fetcherMeta: skipMetaFetch
        ? "(skipped)"
        : {
            name: meta.name,
            imageUrl: meta.imageUrl,
            category: meta.category,
          },
      metaFetchIncomplete,
    });

    console.log(`${SMARTSTORE_TRACE_LOG} ⑨ 등록-저장-요약`, {
      productPageUrl: productPageFetch?.requestUrl ?? normalizedUrl,
      productId: naverProductId,
      htmlStatus: productPageFetch?.status ?? "(없음)",
      htmlResponseUrl: productPageFetch?.responseUrl ?? "(없음)",
      contentType: productPageFetch?.contentType ?? "(없음)",
      bodyHeadSample: productPageFetch?.bodyHeadSample ?? "(없음)",
      skipMetaFetch,
      playwrightConfigured,
      metaFetchIncomplete,
      최종저장: {
        name: data.name,
        thumbnailLink: data.thumbnailLink,
        imageUrl: data.imageUrl,
        category: data.category,
      },
    });

    // space별로 완전히 독립 저장: (userId, productId, space) 기준 upsert
    // (기존 row가 있으면 갱신, 없으면 생성)
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
      // DB에 옛 유니크(userId, productId)가 남아있으면 space 분리가 불가능하므로 명확히 안내한다.
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
      throw e;
    }

    const listShape = await prisma.smartstoreProduct.findUnique({
      where: { id: product.id },
      select: {
        name: true,
        thumbnailLink: true,
        imageUrl: true,
        category: true,
      },
    });

    console.log(
      `${SMARTSTORE_TRACE_LOG} ⑧ list API와 동일 필드 확인(DB 재조회)`,
      {
        name: listShape?.name,
        thumbnailLink: listShape?.thumbnailLink ?? null,
        imageUrl: listShape?.imageUrl ?? null,
        category: listShape?.category ?? null,
      }
    );

    return NextResponse.json({
      ok: true,
      product,
      updated: Boolean(existing),
      metaFetchIncomplete,
    });
  } catch (e) {
    console.error("[smartstore-product-save]", e);
    return NextResponse.json(
      { error: "상품 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}