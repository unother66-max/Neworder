import { NextResponse } from "next/server";
import { fetchSmartstoreProductMeta } from "@/lib/fetch-smartstore-product-meta";
import { extractNaverSmartstoreProductId } from "@/lib/smartstore-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/debug-smartstore-meta?url=https://smartstore.naver.com/.../products/123
 * - JSON API 기반 메타 추출(fetchSmartstoreProductMeta) 결과를 확인하기 위한 디버그 엔드포인트
 * - production에서는 비활성화
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const url = String(searchParams.get("url") ?? "").trim();
  const cookie = String(searchParams.get("cookie") ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  const started = Date.now();
  const pid = extractNaverSmartstoreProductId(url);

  const prevCookie = process.env.NAVER_COOKIE;
  const prevSmartstoreCookie = process.env.SMARTSTORE_COOKIE;
  if (cookie) {
    process.env.NAVER_COOKIE = cookie;
    process.env.SMARTSTORE_COOKIE = cookie;
  }

  try {
    const fetched = await fetchSmartstoreProductMeta(url, pid);
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      productId: pid,
      meta: fetched.meta,
      productPageFetch: fetched.productPageFetch,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        productId: pid,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  } finally {
    process.env.NAVER_COOKIE = prevCookie;
    process.env.SMARTSTORE_COOKIE = prevSmartstoreCookie;
  }
}

