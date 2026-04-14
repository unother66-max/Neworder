import { NextResponse } from "next/server";
import { fetchSmartstoreMetaFromPlaywrightService } from "@/lib/fetch-smartstore-playwright-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/debug-smartstore-playwright?url=https://smartstore.naver.com/.../products/123
 * - 로그인 없이 Playwright 서비스 메타 추출 경로만 빠르게 확인
 * - cookie는 서버 환경변수 NAVER_COOKIE/SMARTSTORE_COOKIE 에서 읽어 전송
 * - production에서는 비활성화
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const url = String(searchParams.get("url") ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  const started = Date.now();
  const cookie = process.env.NAVER_COOKIE?.trim() || process.env.SMARTSTORE_COOKIE?.trim() || "";
  try {
    const meta = await fetchSmartstoreMetaFromPlaywrightService(url, {
      timeoutMs: 80_000,
    });
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      cookieProvided: Boolean(cookie),
      cookieLength: cookie.length,
      meta,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        cookieProvided: Boolean(cookie),
        cookieLength: cookie.length,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

