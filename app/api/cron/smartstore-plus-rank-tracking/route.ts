import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  findProductRankViaNaverShoppingNextData,
  NaverShoppingNextDataHttpError,
} from "@/lib/naver-shopping-nextdata-rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const isValidSecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
  if (!isVercelCron && !isValidSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const keywords = await prisma.smartstoreKeyword.findMany({
    where: {
      isTracking: true,
      product: { autoTracking: true, space: "PLUS_STORE" },
    },
    include: { product: true },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{
    keywordId: string;
    productId: string;
    keyword: string;
    saved: boolean;
    rank: number | null;
    reason: string;
    debugReason: string | null;
  }> = [];

  for (const [index, kw] of keywords.entries()) {
    if (index > 0) await sleep(1_000 + Math.floor(Math.random() * 1_001));
    try {
      const rankResult = await findProductRankViaNaverShoppingNextData({
        keyword: kw.keyword,
        targetProductId: kw.product.productId,
        targetProductUrl: kw.product.productUrl,
        targetProductName: kw.product.name,
        pageSize: 40,
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
      results.push({
        keywordId: kw.id,
        productId: kw.product.id,
        keyword: kw.keyword,
        saved: Boolean(history.id),
        rank: rankResult.rank,
        reason: rankResult.diagnostics.reason,
        debugReason: rankResult.diagnostics.debugReason,
      });
    } catch (error) {
      const reason =
        error instanceof NaverShoppingNextDataHttpError
          ? error.reason
          : "RANK_CHECK_FAILED";
      results.push({
        keywordId: kw.id,
        productId: kw.product.id,
        keyword: kw.keyword,
        saved: false,
        rank: null,
        reason,
        debugReason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const savedCount = results.filter((item) => item.saved).length;
  console.log("[smartstore-plus-rank-tracking cron]", {
    total: results.length,
    savedCount,
    failedCount: results.length - savedCount,
  });
  return NextResponse.json({
    ok: true,
    total: results.length,
    savedCount,
    failedCount: results.length - savedCount,
    results,
  });
}
