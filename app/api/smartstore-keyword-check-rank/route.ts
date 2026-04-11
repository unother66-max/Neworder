import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  findProductRankViaNaverShopOpenApi,
  isNaverOpenApiConfiguredForShopping,
} from "@/lib/naver-openapi-shopping-rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 쇼핑 API 다회 페이징 (최대 ~10회) */
export const maxDuration = 60;

/**
 * POST /api/smartstore-keyword-check-rank
 * body: { keywordId: string, maxResults?: number }
 * 네이버 오픈API shop.json 으로 키워드 검색 후 상품 productId(또는 link) 일치 순위 계산 → SmartstoreRankHistory 저장
 */
export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (!isNaverOpenApiConfiguredForShopping()) {
      return NextResponse.json(
        {
          error:
            "네이버 쇼핑 검색 API를 쓰려면 NAVER_CLIENT_ID·NAVER_CLIENT_SECRET을 설정하고, 개발자센터에서 검색 API(쇼핑) 사용을 켜주세요.",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const keywordId = String(body?.keywordId ?? "").trim();
    const maxResults = Math.min(
      Math.max(Number(body?.maxResults) || 1000, 10),
      1000
    );

    if (!keywordId) {
      return NextResponse.json({ error: "keywordId가 필요합니다." }, { status: 400 });
    }

    const kw = await prisma.smartstoreKeyword.findFirst({
      where: { id: keywordId },
      include: {
        product: { select: { id: true, userId: true, productId: true } },
      },
    });

    if (!kw || kw.product.userId !== userId) {
      return NextResponse.json({ error: "키워드를 찾을 수 없습니다." }, { status: 404 });
    }

    const naverProductId = kw.product.productId?.trim();
    if (!naverProductId) {
      return NextResponse.json({ error: "상품 번호가 없습니다." }, { status: 400 });
    }

    console.log("[smartstore-keyword-check-rank] OpenAPI 쇼핑 순위 조회", {
      keywordId,
      keyword: kw.keyword,
      naverProductId,
      maxResults,
    });

    const rankResult = await findProductRankViaNaverShopOpenApi(kw.keyword, naverProductId, {
      maxResults,
      sort: "sim",
    });

    console.log("[smartstore-keyword-check-rank] 결과", {
      ...rankResult,
      smartstoreProductId: kw.product.id,
    });

    const history = await prisma.smartstoreRankHistory.create({
      data: {
        productId: kw.product.id,
        keyword: kw.keyword,
        rank: rankResult.rank,
        pageNum: rankResult.pageNum,
        position: rankResult.position,
        rankLabel: rankResult.rankLabel,
      },
    });

    return NextResponse.json({
      ok: true,
      source: rankResult.source,
      history,
      rank: rankResult.rank,
      pageNum: rankResult.pageNum,
      position: rankResult.position,
      rankLabel: rankResult.rankLabel,
      notFound: rankResult.notFound,
      scannedCount: rankResult.scannedCount,
      totalHint: rankResult.totalHint,
    });
  } catch (e) {
    console.error("[smartstore-keyword-check-rank]", e);
    const msg = e instanceof Error ? e.message : "순위 조회 실패";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
