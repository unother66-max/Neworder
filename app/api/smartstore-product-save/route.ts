import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SMARTSTORE_TRACE_LOG } from "@/lib/fetch-smartstore-product-meta";
import {
  fetchSmartstoreMetaFromPlaywrightService,
  isSmartstorePlaywrightServiceConfigured,
} from "@/lib/fetch-smartstore-playwright-service";
import { getSmartstoreProductSnapshot } from "@/lib/get-smartstore-product-snapshot";
import {
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Playwright + 네이버 상세 로딩 여유 (Vercel 플랜 상한 내에서 조정) */
export const maxDuration = 60;

/**
 * POST /api/smartstore-product-save
 * - productUrl 수신 → productId 추출 → 메타(name, image, category) 수집
 *   - SMARTSTORE_PLAYWRIGHT_URL 설정 시: 별도 Playwright HTTP 서버 POST /extract 1회 (맥+Tunnel URL 등)
 *   - 미설정 시: 기존처럼 서버에서 getSmartstoreProductSnapshot (로컬/Vercel Chromium)
 * - skipMetaFetch·name/category/imageUrl 오버라이드는 기존 호환용
 */
export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
      return NextResponse.json({ error: "상품 URL을 입력해주세요." }, { status: 400 });
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

    const channelUid =
      normalizedUrl.match(/brand\.naver\.com\/([^/?#]+)/)?.[1] ?? null;
    console.log("[channelUid]", channelUid);

    const fallbackName = `상품 #${naverProductId}`;

    let meta: {
      name: string | null;
      imageUrl: string | null;
      category: string | null;
    } = { name: null, imageUrl: null, category: null };

    let productPageFetch: {
      requestUrl?: string;
      status?: number;
      responseUrl?: string;
      contentType?: string;
      bodyHeadSample?: string;
    } | null = null;

    if (!skipMetaFetch) {
      console.log(`${SMARTSTORE_TRACE_LOG} 단계=메타수집시작`, {
        입력URL: normalizedUrl,
        playwright서비스사용: isSmartstorePlaywrightServiceConfigured(),
        SMARTSTORE_PLAYWRIGHT_URL: process.env.SMARTSTORE_PLAYWRIGHT_URL?.trim() ?? "(미설정)",
      });

      if (isSmartstorePlaywrightServiceConfigured()) {
        try {
          const cr = await fetchSmartstoreMetaFromPlaywrightService(normalizedUrl);
          meta = {
            name: cr.name,
            imageUrl: cr.imageUrl,
            category: cr.category,
          };
          productPageFetch = {
            requestUrl: normalizedUrl,
            status: 200,
            responseUrl: normalizedUrl,
            contentType: "remote-playwright-http",
            bodyHeadSample: "[collected by playwright service]",
          };

          console.log(`${SMARTSTORE_TRACE_LOG} Playwright서비스 직후(저장 전)`, {
            snapshotName: meta.name,
            snapshotImageUrl: meta.imageUrl,
            snapshotCategory: meta.category,
          });

          if (!meta.imageUrl?.trim()) {
            console.warn(`${SMARTSTORE_TRACE_LOG} Playwright서비스 imageUrl=null`, {
              productId: naverProductId,
              requestUrl: normalizedUrl,
            });
          }

          if (!meta.category?.trim()) {
            console.log(`${SMARTSTORE_TRACE_LOG} 저장 API: category 없음(Playwright서비스)`, {
              productId: naverProductId,
              requestUrl: normalizedUrl,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`${SMARTSTORE_TRACE_LOG} 단계=Playwright서비스실패`, {
            입력URL: normalizedUrl,
            error: msg,
          });
          return NextResponse.json(
            {
              error:
                msg ||
                "상품 정보를 가져오지 못했습니다. 맥 Playwright 서버·Tunnel·SMARTSTORE_PLAYWRIGHT_URL 을 확인해주세요.",
            },
            { status: 502 }
          );
        }
      } else {
        const snapshot = await getSmartstoreProductSnapshot(normalizedUrl);
        meta = {
          name: snapshot.name || null,
          imageUrl: snapshot.imageUrl || null,
          category: snapshot.category || null,
        };
        productPageFetch = {
          requestUrl: normalizedUrl,
          status: 200,
          responseUrl: snapshot.finalUrl || normalizedUrl,
          contentType: "playwright",
          bodyHeadSample: "[collected by playwright]",
        };

        console.log(`${SMARTSTORE_TRACE_LOG} 스냅샷 직후(저장 전)`, {
          runtime: "nodejs",
          platform: process.platform,
          arch: process.arch,
          NODE_ENV: process.env.NODE_ENV ?? "(unset)",
          VERCEL: process.env.VERCEL ?? "(unset)",
          finalUrl: snapshot.finalUrl,
          snapshotName: snapshot.name,
          snapshotImageUrl: snapshot.imageUrl,
          snapshotCategory: snapshot.category,
          launchMode: snapshot.launchMode ?? "(unknown)",
          lastError: snapshot.lastError ?? null,
          imageDiag: snapshot.imageDiag ?? null,
        });

        if (!snapshot.imageUrl?.trim()) {
          console.warn(`${SMARTSTORE_TRACE_LOG} 스냅샷 imageUrl=null`, {
            productId: naverProductId,
            requestUrl: normalizedUrl,
            finalUrl: snapshot.finalUrl,
            launchMode: snapshot.launchMode,
            lastError: snapshot.lastError,
            imageDiag: snapshot.imageDiag,
          });
        }

        if (!meta.category?.trim()) {
          console.log(`${SMARTSTORE_TRACE_LOG} 저장 API: category 없음(스냅샷)`, {
            productId: naverProductId,
            requestUrl: normalizedUrl,
            finalUrl: snapshot.finalUrl,
            note: "JSON-LD·DOM·meta에서 breadcrumb 미수집 — 페이지 구조 또는 로딩 시간 확인",
          });
        }
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

    const thumbFromMeta = skipMetaFetch ? "" : (meta.imageUrl?.trim() || "").trim();
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
      console.log(`${SMARTSTORE_TRACE_LOG} ⑧ list API와 동일 필드 확인(DB 재조회)`, {
        name: listShape?.name,
        thumbnailLink: listShape?.thumbnailLink ?? null,
        imageUrl: listShape?.imageUrl ?? null,
        category: listShape?.category ?? null,
      });
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
    console.log(`${SMARTSTORE_TRACE_LOG} ⑧ list API와 동일 필드 확인(DB 재조회)`, {
      name: listShape?.name,
      thumbnailLink: listShape?.thumbnailLink ?? null,
      imageUrl: listShape?.imageUrl ?? null,
      category: listShape?.category ?? null,
    });

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
