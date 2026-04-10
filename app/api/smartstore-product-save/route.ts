import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SMARTSTORE_TRACE_LOG } from "@/lib/fetch-smartstore-product-meta";


import {
  extractNaverSmartstoreProductId,
  isLikelySmartstoreProductUrl,
} from "@/lib/smartstore-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/smartstore-product-save
 * - productUrl 수신 → productId 추출 → 네이버 상품 JSON API 호출(HTML 없음)
 * - name, category(wholeCategoryName 등), thumbnail(representImage·productImages) 추출 후 DB 저장
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



// 1️⃣ 채널 UID 가져오기
// 🔥 채널 UID 추출 (확실한 방식)
let channelUid = null;

try {
 const res = await fetch(
  `https://search.shopping.naver.com/api/product/${naverProductId}`,
  {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
    },
  }
);

  const text = await res.text();

  try {
    const json = JSON.parse(text);
    channelUid = json?.product?.mallPcUrl
  ? json.product.mallPcUrl.match(/brand\.naver\.com\/([^\/]+)/)?.[1]
  : null;
  } catch {}

  console.log("[channelUid]", channelUid);

  if (!channelUid) {
  const match = normalizedUrl.match(/brand\.naver\.com\/([^\/]+)/);
  if (match) {
    channelUid = match[1];
    console.log("[channelUid fallback]", channelUid);
  }
}
} catch (e) {
  console.error("[channelUid 추출 실패]", e);
}

    if (!skipMetaFetch) {
      // 🔥 네이버 JSON API 직접 호출 (핵심 수정)

      if (!channelUid) {
  console.log("[channelUid 없음]");
  return NextResponse.json(
    { error: "channelUid 추출 실패" },
    { status: 400 }
  );
}

const apiUrl = `https://brand.naver.com/n/v2/channels/${channelUid}/products/${naverProductId}?withWindow=false`;

let json: any = null;

try {
 const res = await fetch(apiUrl, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": normalizedUrl,
    "Origin": "https://brand.naver.com",
  },
});

  const text = await res.text();

  productPageFetch = {
  requestUrl: apiUrl,
  status: res.status,
  responseUrl: res.url,
  contentType: res.headers.get("content-type") || "",
  bodyHeadSample: text.slice(0, 200),
};

  try {
    json = JSON.parse(text);
  } catch {
    console.log("[JSON parse 실패]", text.slice(0, 200));
  }

  console.log("[smartstore] JSON status:", res.status);

} catch (e) {
  console.error("[smartstore] API fetch 실패", e);
}

// 🔥 여기서 값 추출
meta = {
  name: json?.dispName || json?.name || null,
  imageUrl:
    json?.representImage?.url ||
    json?.productImages?.[0]?.url ||
    null,
  category: json?.category?.categoryName || null,
};
    
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
