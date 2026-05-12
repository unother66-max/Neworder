import type { BlogAnalysisRecentPost, BlogPostPatternAnalysis } from "@/lib/blog-analysis-types";

const fetchHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/** RSS/PC 포스트 URL → 공개 모바일 글 HTML URL */
export function toMobileBlogPostUrl(postUrl: string): string | null {
  try {
    const u = new URL(postUrl.trim());
    if (!u.hostname.includes("blog.naver.com")) return null;
    const parts = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [bid, logNo] = parts;
    if (!bid || !logNo) return null;
    return `https://m.blog.naver.com/${encodeURIComponent(bid)}/${encodeURIComponent(logNo)}`;
  } catch {
    return null;
  }
}

function decodeBasicEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ");
}

/** `.se-text-paragraph` 블록 텍스트 수집 */
function extractFromSeParagraphs(html: string): string {
  const parts: string[] = [];
  const re = /<div[^>]*\bse-text-paragraph\b[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    parts.push(stripTags(m[1]));
  }
  return parts.join(" ").trim();
}

/** post-view 클래스 영역 */
function extractPostViewLike(html: string): string {
  const re = /<(?:div|section)[^>]*\bpost-view\b[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
  let best = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]).trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

/** `#postViewArea` 근처 본문 (태그 포함 substring으로 이미지 카운트용) */
function extractPostViewAreaFragment(html: string): string | null {
  const marker = /id\s*=\s*["']postViewArea["']/i.exec(html);
  if (!marker || marker.index === undefined) return null;
  const start = marker.index;
  const slice = html.slice(start, start + 900_000);
  const depthStart = slice.indexOf(">");
  if (depthStart === -1) return null;
  let i = depthStart + 1;
  let depth = 1;
  const lower = slice.toLowerCase();
  while (i < slice.length && depth > 0) {
    const nextDiv = lower.indexOf("<div", i);
    const nextClose = lower.indexOf("</div>", i);
    if (nextClose === -1) break;
    if (nextDiv !== -1 && nextDiv < nextClose) {
      depth += 1;
      i = nextDiv + 4;
      continue;
    }
    depth -= 1;
    i = nextClose + 6;
  }
  const fragment = slice.slice(0, i);
  return fragment.length > 50 ? fragment : null;
}

/** 일반 블록 요소에서 텍스트 (fallback) */
function extractFallbackBlocks(html: string): string {
  const innerBody = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const chunks: string[] = [];
  const re = /<(?:p|span|div)[^>]*>([\s\S]*?)<\/(?:p|span|div)>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(innerBody)) !== null && count < 400) {
    count += 1;
    const t = stripTags(m[1]).trim();
    if (t.length >= 8) chunks.push(t);
  }
  return chunks.join(" ").trim();
}

function countImgs(fragment: string): number {
  return (fragment.match(/<img\b/gi) ?? []).length;
}

function extractMainFragment(html: string): { fragment: string; text: string } | null {
  let fragment = "";
  let text = extractFromSeParagraphs(html);
  if (text.length >= 30) {
    const paraHtmlParts: string[] = [];
    const re = /<div[^>]*\bse-text-paragraph\b[^>]*>([\s\S]*?)<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      paraHtmlParts.push(m[0]);
    }
    fragment = paraHtmlParts.join("\n");
  }

  if (text.length < 30) {
    const pv = extractPostViewLike(html);
    if (pv.length > text.length) {
      text = pv;
      const re = /<(?:div|section)[^>]*\bpost-view\b[^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
      let best = "";
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        if (m[0].length > best.length) best = m[0];
      }
      fragment = best || fragment;
    }
  }

  if (text.length < 30) {
    const area = extractPostViewAreaFragment(html);
    if (area) {
      fragment = area;
      text = stripTags(area).trim();
    }
  }

  if (text.length < 30) {
    const fb = extractFallbackBlocks(html);
    if (fb.length > text.length) {
      text = fb;
      fragment = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    }
  }

  if (text.length < 15) return null;

  if (!fragment || fragment.length < 20) {
    fragment = html;
  }

  return { fragment, text };
}

export type BlogPostPatternMetrics = {
  titleLength: number;
  contentLength: number;
  imageCount: number;
};

export function scoreTitleLength(len: number): number {
  if (!Number.isFinite(len) || len <= 0) return 0;
  if (len < 10) return clampScore((len / 10) * 70);
  if (len <= 30) return 100;
  if (len <= 45) return clampScore(100 - (len - 30) * 2);
  if (len <= 70) return clampScore(70 - (len - 45) * 1.6);
  return clampScore(Math.max(0, 30 - (len - 70) * 0.45));
}

export function scoreContentLength(len: number): number {
  if (!Number.isFinite(len) || len <= 0) return 0;
  if (len < 300) return clampScore((len / 300) * 40);
  if (len < 1500) return clampScore(40 + ((len - 300) / 1200) * 40);
  if (len < 3000) return clampScore(80 + ((len - 1500) / 1500) * 20);
  return 100;
}

export function scoreImageCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 5) return clampScore((n / 5) * 85);
  if (n <= 20) return 100;
  if (n <= 35) return clampScore(100 - (n - 20) * 2.5);
  return clampScore(Math.max(0, 62.5 - (n - 35) * 2));
}

async function fetchHtml(url: string, refererBlogUrl: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        ...fetchHeaders,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: refererBlogUrl,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** 단일 포스트 HTML에서 메트릭 추출 (실패 시 null) */
export function extractMetricsFromPostHtml(html: string, rssTitle: string): BlogPostPatternMetrics | null {
  const titleLen = [...String(rssTitle ?? "").trim()].length;
  const main = extractMainFragment(html);
  if (!main) return null;

  const contentLength = [...main.text.replace(/\s+/g, " ").trim()].length;
  const imageCount = countImgs(main.fragment);

  if (contentLength < 15) return null;

  return {
    titleLength: titleLen,
    contentLength,
    imageCount,
  };
}

/**
 * 최근 RSS 포스트(최대 10개) 모바일 공개 HTML을 받아 평균 패턴·점수 산출.
 * 개별 fetch/파싱 실패는 건너뜀. 성공 0건이면 null.
 */
export async function analyzeBlogPostPatterns(
  posts: BlogAnalysisRecentPost[]
): Promise<BlogPostPatternAnalysis | null> {
  const slice = posts.slice(0, 10);
  if (slice.length === 0) return null;

  const rows = await Promise.all(
    slice.map(async (post) => {
      const mobileUrl = toMobileBlogPostUrl(post.url);
      if (!mobileUrl) return null;
      const referer = post.url.startsWith("http") ? post.url : `https://blog.naver.com/`;
      const html = await fetchHtml(mobileUrl, referer);
      if (!html) return null;
      return extractMetricsFromPostHtml(html, post.title);
    })
  );

  const ok = rows.filter((r): r is BlogPostPatternMetrics => r != null);
  if (ok.length === 0) return null;

  const n = ok.length;
  const sumTitle = ok.reduce((a, r) => a + r.titleLength, 0);
  const sumContent = ok.reduce((a, r) => a + r.contentLength, 0);
  const sumImg = ok.reduce((a, r) => a + r.imageCount, 0);

  const averageTitleLength = round1(sumTitle / n);
  const averageContentLength = round1(sumContent / n);
  const averageImageCount = round1(sumImg / n);

  return {
    averageTitleLength,
    averageContentLength,
    averageImageCount,
    titleLengthScore: clampScore(scoreTitleLength(averageTitleLength)),
    contentLengthScore: clampScore(scoreContentLength(averageContentLength)),
    imageCountScore: clampScore(scoreImageCount(averageImageCount)),
  };
}
