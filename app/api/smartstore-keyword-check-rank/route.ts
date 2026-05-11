import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  findProductRankViaNaverShopOpenApi,
  isNaverOpenApiConfiguredForShopping,
} from "@/lib/naver-openapi-shopping-rank";
import {
  findProductRankViaNaverShoppingNextData,
  NaverShoppingNextDataHttpError,
} from "@/lib/naver-shopping-nextdata-rank";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let kwForFailure: { keyword: string; product: { id: string } } | null = null;
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    const body = await req.json();
    const keywordId = body?.keywordId;

    const kw = await prisma.smartstoreKeyword.findFirst({
      where: { id: keywordId },
      include: { product: true },
    });

    if (!kw || kw.product.userId !== userId) {
      return NextResponse.json({ error: "권한 없음" }, { status: 404 });
    }
    kwForFailure = { keyword: kw.keyword, product: { id: kw.product.id } };

    let result;
    let rankSource: "PLUS_STORE_ORGANIC_NS_PORTAL" | "search/all";

    if (kw.product.space === "PLUS_STORE") {
      rankSource = "PLUS_STORE_ORGANIC_NS_PORTAL";
      try {
        result = await findProductRankViaNaverShoppingNextData({
          keyword: kw.keyword,
          targetProductId: kw.product.productId as string,
          targetProductUrl: kw.product.productUrl as string | null,
          pageSize: 40,
        });
      } catch (e) {
        if (
          isSmartstoreNaverRateLimitedError(e) ||
          (e instanceof NaverShoppingNextDataHttpError && e.status === 429)
        ) {
          return NextResponse.json(
            { error: "네이버 요청이 일시적으로 제한(HTTP 429)되었습니다." },
            { status: 429 }
          );
        }
        throw e;
      }
    } else {
      rankSource = "search/all";
      result = await findProductRankViaNaverShopOpenApi(kw.keyword, kw.product.productId as string, {
        maxResults: 1000,
        space: "NAVER_PRICE",
      });
    }

    console.log("[smartstore-keyword-check-rank]", {
      rankSource,
      keyword: kw.keyword,
      productUrl: kw.product.productUrl,
      productId: kw.product.productId,
      matchedRank: result?.rank ?? null,
      matchedName:
        "matchedName" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).matchedName === "string"
          ? ((result as Record<string, unknown>).matchedName as string)
          : null,
      parserSource:
        "parserSource" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).parserSource === "string"
          ? ((result as Record<string, unknown>).parserSource as string)
          : null,
      requestUrl:
        "requestUrl" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).requestUrl === "string"
          ? ((result as Record<string, unknown>).requestUrl as string)
          : null,
      responseStatus:
        "responseStatus" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).responseStatus === "number"
          ? ((result as Record<string, unknown>).responseStatus as number)
          : null,
      responsePreview:
        "responsePreview" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).responsePreview === "string"
          ? ((result as Record<string, unknown>).responsePreview as string)
          : null,
      totalProductCount:
        "totalProductCount" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).totalProductCount === "number"
          ? ((result as Record<string, unknown>).totalProductCount as number)
          : null,
      matchedProductNo:
        "matchedProductNo" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).matchedProductNo === "string"
          ? ((result as Record<string, unknown>).matchedProductNo as string)
          : null,
      matchedProductId:
        "matchedProductNo" in (result as Record<string, unknown>) &&
        typeof (result as Record<string, unknown>).matchedProductNo === "string"
          ? ((result as Record<string, unknown>).matchedProductNo as string)
          : null,
    });

    await prisma.smartstoreRankHistory.create({
      data: {
        productId: kw.product.id,
        keyword: kw.keyword,
        rank: result.rank,
        pageNum: result.pageNum ?? null,
        position: result.position ?? null,
        rankLabel: result.rankLabel,
      },
    });

    return NextResponse.json({ ok: true, ...result, rankSource });
  } catch (e) {
    if (e instanceof NaverShoppingNextDataHttpError) {
      if (kwForFailure?.product.id && kwForFailure.keyword) {
        try {
          await prisma.smartstoreRankHistory.create({
            data: {
              productId: kwForFailure.product.id,
              keyword: kwForFailure.keyword,
              rank: null,
              pageNum: null,
              position: null,
              rankLabel: "조회 실패",
            },
          });
        } catch (historyError) {
          console.error("[smartstore-keyword-check-rank:history-save-failed]", historyError);
        }
      }

      console.error("[smartstore-keyword-check-rank:plus-store-failed]", {
        rankSource: "PLUS_STORE_ORGANIC_NS_PORTAL",
        parserSource: "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot",
        requestUrl: e.requestUrl,
        responseStatus: e.status,
        responsePreview: e.responsePreview,
      });
      return NextResponse.json(
        { error: "플러스스토어 순위 조회 실패 (광고 제외 기준 API 실패)" },
        { status: 502 }
      );
    }

    if (isSmartstoreNaverRateLimitedError(e)) {
      return NextResponse.json(
        { error: "네이버 요청이 일시적으로 제한(HTTP 429)되었습니다." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "조회 실패" }, { status: 502 });
  }
}