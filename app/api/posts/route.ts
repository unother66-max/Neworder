import { getRecentLinksFromPage } from "@/lib/scraper";

function sortPostsByDate(
  posts: { title: string; link: string; date: string }[]
) {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const blogUrl = body.blogUrl as string;

    if (!blogUrl?.trim()) {
      return Response.json({
        posts: [
          {
            title: "블로그 주소가 비어 있어요",
            date: "",
            link: "#",
            rank: "오류",
            keyword: "",
            searchVolume: "-",
          },
        ],
      });
    }

    const scrapedLinks = await getRecentLinksFromPage(blogUrl);

    if (!scrapedLinks.length) {
      return Response.json({
        posts: [
          {
            title: "RSS에서 최근글을 찾지 못했어요",
            date: "",
            link: blogUrl,
            rank: "0개",
            keyword: "",
            searchVolume: "-",
          },
        ],
      });
    }

    const dateSorted = sortPostsByDate(scrapedLinks);

    const posts = dateSorted.map((item) => ({
      title: item.title,
      date: item.date,
      link: item.link,
      rank: "-",
      keyword: "",
      searchVolume: "-",
    }));

    return Response.json({ posts });
  } catch (error) {
    console.error("route error:", error);

    return Response.json({
      posts: [
        {
          title:
            error instanceof Error
              ? `오류: ${error.message}`
              : "페이지를 읽는 중 오류가 났어요",
          date: "",
          link: "#",
          rank: "오류",
          keyword: "",
          searchVolume: "-",
        },
      ],
    });
  }
}