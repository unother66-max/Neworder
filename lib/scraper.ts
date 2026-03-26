export type ScrapedPost = {
  title: string;
  link: string;
  date: string;
};

function normalizeUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function extractBlogId(inputUrl: string) {
  const safeUrl = normalizeUrl(inputUrl);

  try {
    const url = new URL(safeUrl);

    if (url.hostname.includes("blog.naver.com")) {
      const pathname = url.pathname.replace(/^\/+/, "");
      const firstSegment = pathname.split("/")[0];

      if (firstSegment) {
        return firstSegment;
      }
    }

    const blogId = url.searchParams.get("blogId");
    if (blogId) return blogId;
  } catch {
    return "";
  }

  return "";
}

function buildRssUrl(blogId: string) {
  return `https://rss.blog.naver.com/${blogId}.xml`;
}

function decodeXmlText(text: string) {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getTagValue(block: string, tagName: string) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match ? decodeXmlText(match[1].trim()) : "";
}

function formatPubDate(pubDate: string) {
  const date = new Date(pubDate);

  if (isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function getRecentLinksFromPage(
  inputUrl: string
): Promise<ScrapedPost[]> {
  const blogId = extractBlogId(inputUrl);

  if (!blogId) {
    throw new Error("블로그 주소에서 blogId를 찾지 못했어요.");
  }

  const rssUrl = buildRssUrl(blogId);

  const response = await fetch(rssUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RSS를 불러오지 못했어요. (${response.status})`);
  }

  const xmlText = await response.text();

  const itemBlocks = Array.from(xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map(
    (match) => match[1]
  );

  const posts = itemBlocks
    .map((item) => {
      const title = getTagValue(item, "title");
      const link = getTagValue(item, "link");
      const pubDate = getTagValue(item, "pubDate");

      return {
        title,
        link,
        date: formatPubDate(pubDate),
      };
    })
    .filter((item) => item.title && item.link)
    .slice(0, 20);

  return posts;
}