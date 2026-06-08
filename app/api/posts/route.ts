import {
  extractBlogId,
  fetchBlogPostTitleListPage,
  getRecentLinksFromPage,
} from "@/lib/scraper";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

type SessionWithUserId = {
  user?: {
    id?: string | null;
  } | null;
} | null;

function sortPostsByDate(
  posts: { title: string; link: string; date: string }[]
) {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
}

function formatDateLabel(date: string | null | undefined) {
  if (!date) return "";
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTopBlogPosts(posts: { title: string; link: string; date: string }[]) {
  return posts.map((item) => ({
    title: item.title,
    date: item.date,
    link: item.link,
    rank: "-",
    keyword: "",
    searchVolume: "-",
  }));
}

export async function POST(request: Request) {
  try {
    console.log("[top-blog] request received");

    const session = (await getServerSession(authOptions)) as SessionWithUserId;
    if (!session?.user?.id) {
      return Response.json(
        { ok: false, posts: [], error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const blogUrl = body.blogUrl as string;

    if (!blogUrl?.trim()) {
      return Response.json(
        { ok: false, posts: [], error: "블로그 주소를 입력해주세요." },
        { status: 400 }
      );
    }

    const blogId = extractBlogId(blogUrl);
    console.log("[top-blog] normalized blog url/blogId", { blogId });

    if (!blogId) {
      return Response.json(
        { ok: false, posts: [], error: "네이버 블로그 URL을 확인해주세요." },
        { status: 400 }
      );
    }

    let scrapedLinks: { title: string; link: string; date: string }[] = [];
    let rssError: string | null = null;

    try {
      scrapedLinks = await getRecentLinksFromPage(blogUrl);
    } catch (error) {
      rssError = error instanceof Error ? error.message : "rss_fetch_failed";
      console.log("[top-blog] error reason", { source: "rss", reason: rssError });
    }

    if (!scrapedLinks.length) {
      const titleListPage = await fetchBlogPostTitleListPage(blogId, 1, 20);
      scrapedLinks = titleListPage.posts.map((post) => ({
        title: post.title,
        link: post.url,
        date: formatDateLabel(post.createdAt ?? post.publishedAt),
      }));
    }

    if (!scrapedLinks.length) {
      console.log("[top-blog] recent posts count", { blogId, count: 0 });
      return Response.json(
        {
          ok: false,
          posts: [],
          error:
            "블로그 최신 글을 불러오지 못했습니다. URL을 확인하거나 잠시 후 다시 시도해주세요.",
        },
        { status: 404 }
      );
    }

    const dateSorted = sortPostsByDate(scrapedLinks);
    const posts = toTopBlogPosts(dateSorted);

    console.log("[top-blog] recent posts count", {
      blogId,
      count: posts.length,
      rssFallbackUsed: Boolean(rssError),
    });

    return Response.json({ ok: true, posts, blogId });
  } catch (error) {
    console.error("[top-blog] error reason", error);

    return Response.json(
      {
        ok: false,
        posts: [],
        error:
          "블로그 최신 글을 불러오지 못했습니다. URL을 확인하거나 잠시 후 다시 시도해주세요.",
      },
      { status: 500 }
    );
  }
}
