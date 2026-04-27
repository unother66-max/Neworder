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

    // Ensure the session userId exists in DB (avoid P2003 FK crash)
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
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
          select: { id: true },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          // race: created by another request
          user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
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

    // Scraping-only URL:
    // - If user pasted mobile host, convert to PC host
    // - Drop ALL query params / fragments to avoid WAF/captcha triggers (NaPm, nl-*, etc.)
    // IMPORTANT: we still save the original normalizedUrl into DB (productUrl field).
    const pcUrl = (() => {
      try {
        const u = new URL(normalizedUrl);
        if (u.hostname === "m.smartstore.naver.com") u.hostname = "smartstore.naver.com";
        if (u.hostname === "m.brand.naver.com") u.hostname = "brand.naver.com";
        return `${u.protocol}//${u.hostname}${u.pathname}`;
      } catch {
        // fallback: best-effort strip query/hash + m. host
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

    // 2nd attempt: shopping search API (shop.json) meta boost (0425 fallback)
    if (!skipMetaFetch && !gotServerMeta) {
      const shoppingConfigured = isSmartstoreShoppingSearchConfigured();
      console.log(`${SMARTSTORE_TRACE_LOG} [save] meta 비어있음 → 쇼핑검색 보강 시도`, {
        shoppingConfigured,
        productId: naverProductId,
      });
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
          // shop.json 429는 bot-shield에서 SmartstoreNaverRateLimitedError로 올라옴
          if (isSmartstoreNaverRateLimitedError(e)) {
            throw e;
          }
          console.error(`${SMARTSTORE_TRACE_LOG} [save] 쇼핑검색 보강 실패`, e);
        }
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

    // Final fail-fast: after HTML + shopping search boost, still no meta.
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
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        return NextResponse.json(
          { error: "로그인이 필요합니다." },
          { status: 401 }
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