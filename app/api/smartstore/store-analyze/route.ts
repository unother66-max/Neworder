import { NextResponse } from "next/server";
import { ADMIN_ONLY_FEATURE_ERROR, requireAdminApi } from "@/lib/require-admin-api";
import { analyzeSmartstoreStore } from "@/lib/smartstore-store-analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 입력값 검증 단계에서만 throw 되는 메시지들 */
const INPUT_ERROR_MESSAGES = [
  "분석할 스마트스토어 또는 상품 URL을 입력해 주세요.",
  "스마트스토어 또는 브랜드스토어 URL 형식으로 입력해 주세요.",
  "smartstore.naver.com 또는 brand.naver.com URL만 분석할 수 있습니다.",
  "URL에서 스토어명을 찾지 못했습니다.",
];

function isInputValidationError(message: string): boolean {
  return INPUT_ERROR_MESSAGES.includes(message);
}

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
    const message = e instanceof Error && e.message ? e.message : "스마트스토어 분석에 실패했습니다.";

    if (e instanceof Error && isInputValidationError(message)) {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    console.error("[smartstore-store-analyze]", e);
    return NextResponse.json(
      {
        ok: true,
        storeName: "",
        inputUrl: "",
        normalizedStoreUrl: "",
        productId: null,
        analyzedFromProductUrl: false,
        items: [],
        warning:
          "스마트스토어 분석 중 일시적인 문제로 결과를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 200 }
    );
  }
}
