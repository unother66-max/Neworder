import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/require-auth-api";
import {
  SMARTSTORE_KEYWORD_ANALYZE_LIMIT,
  analyzeSmartstoreKeyword,
} from "@/lib/smartstore-keyword-analyze";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

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
    const result = await analyzeSmartstoreKeyword({
      keyword,
      limit: Number.isFinite(limit) ? limit : SMARTSTORE_KEYWORD_ANALYZE_LIMIT,
    });

    return NextResponse.json({
      ok: true,
      keyword: result.keyword,
      summary: result.summary,
      items: result.items,
      warning: result.warning,
    });
  } catch (e) {
    console.error("[smartstore-keyword-analyze]", e);
    const status = isSmartstoreNaverRateLimitedError(e) ? 429 : 502;
    const fallbackMessage =
      status === 429
        ? "네이버 요청이 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요."
        : "상품 키워드 분석에 실패했습니다.";
    return NextResponse.json(
      { ok: false, error: e instanceof Error && e.message ? e.message : fallbackMessage },
      { status }
    );
  }
}
