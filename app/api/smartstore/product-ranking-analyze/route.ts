import { NextResponse } from "next/server";
import { analyzeSmartstoreProductRanking } from "@/lib/smartstore-product-ranking-analyze";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      keyword?: unknown;
      limit?: unknown;
    };
    const keyword = String(body.keyword ?? "").trim();
    const limit =
      typeof body.limit === "number" || typeof body.limit === "string"
        ? Number(body.limit)
        : undefined;

    const result = await analyzeSmartstoreProductRanking({
      keyword,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json({ ok: true, keyword: result.keyword, items: result.items });
  } catch (e) {
    console.error("[smartstore-product-ranking-analyze]", e);
    const status = isSmartstoreNaverRateLimitedError(e) ? 429 : 502;
    const fallbackMessage =
      status === 429
        ? "네이버 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요."
        : "상품 순위 분석에 실패했습니다.";
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error && e.message ? e.message : fallbackMessage,
      },
      { status }
    );
  }
}
