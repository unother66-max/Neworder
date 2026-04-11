import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchSmartstoreProductMeta,
  SMARTSTORE_TRACE_LOG,
} from "@/lib/fetch-smartstore-product-meta";
import {
  fetchSmartstoreMetaFromPlaywrightService,
  isSmartstorePlaywrightServiceConfigured,
} from "@/lib/fetch-smartstore-playwright-service";
import {
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";

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

    let meta: {
      name: string | null;
      imageUrl: string | null;
      category: string | null;
    } = {
      name: null,
      imageUrl: null,
      category: null,
    };

    let productPageFetch: Awaited<
      ReturnType<typeof fetchSmartstoreProductMeta>
    >["productPageFetch"] = null;

    const playwrightConfigured = isSmartstorePlaywrightServiceConfigured();

    console.log(`${SMARTSTORE_TRACE_LOG} [save] 시작`, {
      userId,
      productUrl: normalizedUrl,
      productId: naverProductId,
      skipMetaFetch,
      playwrightConfigured,
      SMARTSTORE_PLAYWRIGHT_URL:
        process.env.SMARTSTORE_PLAYWRIGHT_URL?.trim() || "(없음)",
    });

    if (!skipMetaFetch) {
      if (playwrightConfigured) {
        try {
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

    const gotServerMeta =
      !skipMetaFetch &&
      (Boolean(meta.name?.trim()) ||
        Boolean(meta.imageUrl?.trim()) ||
        Boolean(meta.category?.trim()));

    const metaFetchIncomplete = !skipMetaFetch && !gotServerMeta;

    const data = {
      name: nameFinal,
      category,
      thumbnailLink,
      imageUrl,
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

    const existing = await prisma.smartstoreProduct.findUnique({
      where: {
        userId_productId: { userId, productId: naverProductId },
      },
    });

    if (existing) {
      const product = await prisma.smartstoreProduct.update({
        where: { id: existing.id },
        data: {
          name: nameFinal,
          category,
          thumbnailLink,
          imageUrl,
          productUrl: normalizedUrl,
        },
        include: { keywords: true },
      });

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
        updated: true,
        metaFetchIncomplete,
      });
    }

    const product = await prisma.smartstoreProduct.create({
      data: {
        userId,
        productId: naverProductId,
        productUrl: normalizedUrl,
        name: nameFinal,
        category,
        thumbnailLink,
        imageUrl,
      },
      include: { keywords: true },
    });

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
      updated: false,
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