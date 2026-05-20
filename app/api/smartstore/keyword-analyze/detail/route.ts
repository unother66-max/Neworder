import { NextResponse } from "next/server";
import { analyzeSmartstoreKeywordDetail } from "@/lib/smartstore-keyword-analyze";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keyword?: unknown };
    const keyword = String(body.keyword ?? "").trim();
    const result = await analyzeSmartstoreKeywordDetail({ keyword });

    return NextResponse.json({
      ok: true,
      keyword: result.keyword,
      summary: result.summary,
      relatedKeywords: result.relatedKeywords,
      warning: result.warning,
    });
  } catch (e) {
    console.error("[smartstore-keyword-analyze-detail]", e);
    const status = isSmartstoreNaverRateLimitedError(e) ? 429 : 502;
    const fallbackMessage =
      status === 429
        ? "네이버 요청이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요."
        : "상품 키워드 상세 분석에 실패했습니다.";
    return NextResponse.json(
      { ok: false, error: e instanceof Error && e.message ? e.message : fallbackMessage },
      { status }
    );
  }
}
