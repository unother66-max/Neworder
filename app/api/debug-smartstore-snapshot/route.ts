import { NextResponse } from "next/server";
import { getSmartstoreProductSnapshot } from "@/lib/get-smartstore-product-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/debug-smartstore-snapshot?url=https://smartstore.naver.com/.../products/123
 * - 로컬에서 스마트스토어 스냅샷 추출 결과를 빠르게 확인하기 위한 디버그 엔드포인트
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
  try {
    const prevCookie = process.env.NAVER_COOKIE;
    const prevSmartstoreCookie = process.env.SMARTSTORE_COOKIE;
    if (cookie) {
      process.env.NAVER_COOKIE = cookie;
      process.env.SMARTSTORE_COOKIE = cookie;
    }
    const snap = await getSmartstoreProductSnapshot(url);
    if (cookie) {
      process.env.NAVER_COOKIE = prevCookie;
      process.env.SMARTSTORE_COOKIE = prevSmartstoreCookie;
    }
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      snapshot: snap,
    });
  } catch (e) {
    if (cookie) {
      process.env.NAVER_COOKIE = undefined;
      process.env.SMARTSTORE_COOKIE = undefined;
    }
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

