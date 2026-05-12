import type { BlogAnalysisRecentPost } from "./blog-analysis-types";

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

export function extractBlogId(inputUrl: string) {
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

function getRawTagInner(block: string, tagName: string) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}

function getTagValue(block: string, tagName: string) {
  const inner = getRawTagInner(block, tagName);
  return inner ? decodeXmlText(inner) : "";
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

function normalizeMediaUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  const t = src.trim();
  if (!t) return null;
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return null;
}

function extractMediaThumbnail(item: string): string | null {
  const m = item.match(/<media:thumbnail[^>]*\burl\s*=\s*["']([^"']+)["']/i);
  return m ? normalizeMediaUrl(m[1]) : null;
}

function extractThumbnailFromDescription(descriptionRaw: string): string | null {
  if (!descriptionRaw) return null;
  const decoded = decodeXmlText(descriptionRaw.trim());
  const imgMatch = decoded.match(/<img[^>]+\bsrc\s*=\s*["']([^"']+)["']/i);
  return normalizeMediaUrl(imgMatch?.[1]);
}

function isoFromPubDate(pubRaw: string): string | null {
  const date = new Date(pubRaw.trim());
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Parses public Naver blog RSS XML into up to `limit` posts (no network). */
export function parseBlogRssItems(xmlText: string, limit = 20): BlogAnalysisRecentPost[] {
  const itemBlocks = Array.from(xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)).map(
    (match) => match[1]
  );

  const out: BlogAnalysisRecentPost[] = [];

  for (const item of itemBlocks) {
    const title = getTagValue(item, "title").trim();
    const link = getTagValue(item, "link").trim();
    const pubRaw = getRawTagInner(item, "pubDate");
    const descriptionRaw = getRawTagInner(item, "description");

    if (!title || !link) continue;

    const createdAt = pubRaw ? isoFromPubDate(decodeXmlText(pubRaw.trim())) : null;
    const thumbnail =
      extractMediaThumbnail(item) ?? extractThumbnailFromDescription(descriptionRaw);

    out.push({
      title,
      url: link,
      createdAt,
      thumbnail,
    });

    if (out.length >= limit) break;
  }

  return out;
}

export function computePostingFrequency7d(
  recentPosts: { createdAt?: string | null }[]
): number | null {
  if (!recentPosts.length) return null;

  let validDates = 0;
  let countInWindow = 0;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const p of recentPosts) {
    if (!p.createdAt) continue;
    const t = new Date(p.createdAt).getTime();
    if (isNaN(t)) continue;
    validDates += 1;
    if (t >= cutoff) countInWindow += 1;
  }

  if (validDates === 0) return null;

  return Math.round((countInWindow / 7) * 100) / 100;
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