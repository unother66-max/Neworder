import { NextResponse } from "next/server";
import { mergeRecentPostsWithMetricCache } from "@/lib/merge-recent-posts-with-metric-cache";
import { extractBlogId, fetchBlogPostTitleListPage } from "@/lib/scraper";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const blogIdRaw = searchParams.get("blogId")?.trim() ?? "";
    const blogId = extractBlogId(blogIdRaw) ?? blogIdRaw;
    if (!blogId) {
      return NextResponse.json({ ok: false, error: "blogId가 필요합니다." }, { status: 400 });
    }

    const page = Math.max(1, Number.parseInt(String(searchParams.get("page") ?? "1"), 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(String(searchParams.get("limit") ?? "30"), 10) || 30)
    );

    const titleListPage = await fetchBlogPostTitleListPage(blogId, page, limit);
    const posts = await mergeRecentPostsWithMetricCache(blogId, titleListPage.posts, {
      metricFetchLimit: limit,
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis recent-posts load-more]", {
        blogId,
        requestedPage: page,
        requestedLimit: limit,
        beforePostCount: null,
        fetchedPostCount: titleListPage.posts.length,
        afterDedupePostCount: posts.length,
        hasMore: titleListPage.hasMore,
        totalCount: titleListPage.totalCount,
        sampleFetchedTitles: posts.slice(0, 5).map((post) => post.title),
      });
    }

    return NextResponse.json({
      ok: true,
      posts,
      page,
      limit,
      hasMore: titleListPage.hasMore,
      totalCount: titleListPage.totalCount,
    });
  } catch (e) {
    console.warn("[blog-analysis/posts] load-more 실패:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "포스팅 목록 조회 실패" },
      { status: 500 }
    );
  }
}
