import { NextResponse } from "next/server";
import { extractBlogId } from "@/lib/scraper";
import { refreshBlogKeywords } from "@/lib/blog-keyword-refresh-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { blogUrl?: unknown; force?: unknown };
    const forceKeywordRefreshDevOnly =
      process.env.NODE_ENV === "development" && Boolean(body.force);
    const blogId = extractBlogId(String(body.blogUrl ?? ""));
    if (!blogId) {
      return NextResponse.json(
        { ok: false, error: "올바른 네이버 블로그 아이디 또는 주소를 입력해주세요." },
        { status: 400 }
      );
    }

    const result = await refreshBlogKeywords({
      blogId,
      source: "manual",
      forceKeywordRefreshDevOnly,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      blogId: result.blogId,
      validKeywords: result.validKeywords,
      validKeywordCount: result.validKeywordCount,
      refreshMs: result.refreshMs,
      debug: result.debug,
    });
  } catch (e) {
    console.error("[blog-analysis keyword-refresh]", e);
    return NextResponse.json({ ok: false, error: "유효 키워드 갱신에 실패했습니다." }, { status: 500 });
  }
}
