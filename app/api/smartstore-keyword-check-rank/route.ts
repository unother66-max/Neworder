import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  findProductRankViaNaverShopOpenApi,
} from "@/lib/naver-openapi-shopping-rank";
import {
  findProductRankViaNaverShoppingNextData,
  NaverShoppingNextDataHttpError,
} from "@/lib/naver-shopping-nextdata-rank";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
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
    let result;
    let rankSource: "PLUS_STORE_ORGANIC_NS_PORTAL" | "search/all";

    if (kw.product.space === "PLUS_STORE") {
      rankSource = "PLUS_STORE_ORGANIC_NS_PORTAL";
      try {
        result = await findProductRankViaNaverShoppingNextData({
          keyword: kw.keyword,
          targetProductId: kw.product.productId as string,
          targetProductUrl: kw.product.productUrl as string | null,
          targetProductName: kw.product.name,
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

    const diagnostics =
      "diagnostics" in result ? result.diagnostics : null;
    console.log("[smartstore-keyword-check-rank]", {
      rankSource,
      keyword: kw.keyword,
      productName: kw.product.name,
      productUrl: kw.product.productUrl,
      storedProductId: kw.product.productId,
      storedChannelProductId: diagnostics?.storedChannelProductId ?? null,
      storedMallProductId: diagnostics?.storedMallProductId ?? null,
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
      matchedChannelProductId: diagnostics?.matchedChannelProductId ?? null,
      matchedMallProductId: diagnostics?.matchedMallProductId ?? null,
      productType:
        kw.product.space === "PLUS_STORE" ? "plus-store" : "naver-price",
      ranking: result.rank,
      page: result.pageNum,
      indexInPage: result.position,
      searchApiSource: diagnostics?.searchApiSource ?? rankSource,
      totalFetchedCount:
        diagnostics?.totalFetchedCount ??
        ("scannedCount" in result ? result.scannedCount : null),
      dedupedCount: diagnostics?.dedupedCount ?? null,
      isMatched: result.rank != null,
      reason:
        diagnostics?.reason ?? (result.rank != null ? "FOUND" : "NOT_FOUND"),
      debugReason: diagnostics?.debugReason ?? null,
    });

    let history;
    try {
      history = await prisma.smartstoreRankHistory.create({
        data: {
          productId: kw.product.id,
          keyword: kw.keyword,
          rank: result.rank,
          pageNum: result.pageNum ?? null,
          position: result.position ?? null,
          rankLabel: result.rankLabel,
        },
      });
    } catch (historyError) {
      console.error("[smartstore-keyword-check-rank:history-save-failed]", {
        keyword: kw.keyword,
        productId: kw.product.id,
        reason: "HISTORY_SAVE_FAILED",
        debugReason:
          historyError instanceof Error ? historyError.message : String(historyError),
      });
      return NextResponse.json(
        {
          ok: false,
          reason: "HISTORY_SAVE_FAILED",
          debugReason: "순위 조회는 완료됐지만 히스토리 저장에 실패했습니다.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      saved: true,
      historyId: history.id,
      reason: diagnostics?.reason ?? (result.rank != null ? "FOUND" : "NOT_FOUND"),
      debugReason: diagnostics?.debugReason ?? null,
      ...result,
      rankSource,
    });
  } catch (e) {
    if (e instanceof NaverShoppingNextDataHttpError) {
      console.error("[smartstore-keyword-check-rank:plus-store-failed]", {
        rankSource: "PLUS_STORE_ORGANIC_NS_PORTAL",
        parserSource: "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot",
        requestUrl: e.requestUrl,
        responseStatus: e.status,
        reason: e.reason,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "플러스스토어 순위 조회 실패 (기존 순위 유지)",
          reason: e.reason,
          debugReason: `NS_PORTAL_${e.reason}:HTTP_${e.status}`,
        },
        { status: 502 }
      );
    }

    if (isSmartstoreNaverRateLimitedError(e)) {
      return NextResponse.json(
        { error: "네이버 요청이 일시적으로 제한(HTTP 429)되었습니다." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "조회 실패",
        reason: "RANK_CHECK_FAILED",
        debugReason: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
}
