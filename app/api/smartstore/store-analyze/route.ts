import { NextResponse } from "next/server";
import { ADMIN_ONLY_FEATURE_ERROR, requireAdminApi } from "@/lib/require-admin-api";
import { analyzeSmartstoreStore } from "@/lib/smartstore-store-analyze";
import { isSmartstoreNaverRateLimitedError } from "@/lib/smartstore-bot-shield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await requireAdminApi({ errorMessage: ADMIN_ONLY_FEATURE_ERROR });
  if (!admin.ok) return admin.response;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      url?: unknown;
      limit?: unknown;
    };
    const url = String(body.url ?? "").trim();
    const limit =
      typeof body.limit === "number" || typeof body.limit === "string"
        ? Number(body.limit)
        : undefined;

    const result = await analyzeSmartstoreStore({
      url,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json({
      ok: true,
      storeName: result.storeName,
      inputUrl: result.inputUrl,
      normalizedStoreUrl: result.normalizedStoreUrl,
      productId: result.productId,
      analyzedFromProductUrl: result.analyzedFromProductUrl,
      items: result.items,
      warning: result.warning,
    });
  } catch (e) {
    console.error("[smartstore-store-analyze]", e);
    const status = isSmartstoreNaverRateLimitedError(e) ? 429 : 502;
    const fallbackMessage =
      status === 429
        ? "네이버 요청이 잠시 제한되었습니다. 잠시 후 다시 시도하거나 상품 URL로 분석해 주세요."
        : "스마트스토어 분석에 실패했습니다.";
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error && e.message ? e.message : fallbackMessage,
      },
      { status }
    );
  }
}
