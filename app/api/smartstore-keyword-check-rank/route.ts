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
} from "../../../lib/naver-shopping-nextdata-rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

    let result;
    let fallbackUsed = false;

    if (kw.product.space === "PLUS_STORE") {
      try {
        result = await findProductRankViaNaverShoppingNextData({
          keyword: kw.keyword,
          targetProductId: kw.product.productId as string,
          pageSize: 40,
        });
      } catch (e) {
        fallbackUsed = true;
        result = await findProductRankViaNaverShopOpenApi(kw.keyword, kw.product.productId as string, {
          maxResults: 1000,
          space: "PLUS_STORE",
        });
      }
    } else {
      result = await findProductRankViaNaverShopOpenApi(kw.keyword, kw.product.productId as string, {
        maxResults: 1000,
        space: "NAVER_PRICE",
      });
    }

    await prisma.smartstoreRankHistory.create({
      data: {
        productId: kw.product.id,
        keyword: kw.keyword,
        rank: result.rank,
        rankLabel: result.rankLabel,
      },
    });

    return NextResponse.json({ ok: true, ...result, fallbackUsed });
  } catch (e) {
    return NextResponse.json({ error: "조회 실패" }, { status: 502 });
  }
}