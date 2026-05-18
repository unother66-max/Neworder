import type { BlogAnalysisRecentPost, BlogPostTitleListFetchDiagnostics } from "./blog-analysis-types";
import { makePostMatchKey } from "./naver";

export type ScrapedPost = {
  title: string;
  link: string;
  date: string;
};

const NAVER_BLOG_HOSTS = new Set(["blog.naver.com", "m.blog.naver.com"]);

function isValidBlogIdSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_-]{2,}$/.test(segment);
}

/** URL 경로 `[blogId]` 검증용 (extractBlogId 결과와 동일 규칙) */
export function isValidNaverBlogId(id: string): boolean {
  return isValidBlogIdSegment(id.trim());
}

/**
 * 네이버 블로그 식별자 추출 (아이디 단독 입력·각종 URL·글 번호 경로 지원).
 * 공백 trim, URL 끝 슬래시 제거, /PostView.naver?blogId= 형태는 쿼리에서 보조 추출.
 */
export function extractBlogId(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  if (!trimmed) return "";

  const noTrailingSlashes = trimmed.replace(/\/+$/, "");

  const lower = noTrailingSlashes.toLowerCase();
  const looksLikePlainBlogId =
    !noTrailingSlashes.includes("/") &&
    !noTrailingSlashes.includes(":") &&
    !lower.includes("naver") &&
    isValidBlogIdSegment(noTrailingSlashes);
  if (looksLikePlainBlogId) return noTrailingSlashes;

  let href = noTrailingSlashes;
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${href}`;
  }

  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();

    if (NAVER_BLOG_HOSTS.has(host)) {
      const pathname = url.pathname.replace(/^\/+|\/+$/g, "");
      const segments = pathname.split("/").filter(Boolean);
      const first = segments[0];
      if (first && isValidBlogIdSegment(first)) {
        return first;
      }
      const fromQuery = url.searchParams.get("blogId")?.trim();
      if (fromQuery && isValidBlogIdSegment(fromQuery)) {
        return fromQuery;
      }
    }

    const blogIdParam = url.searchParams.get("blogId")?.trim();
    if (blogIdParam && isValidBlogIdSegment(blogIdParam)) {
      return blogIdParam;
    }
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

function extractTextFromDescription(descriptionRaw: string): string | null {
  if (!descriptionRaw) return null;
  const decoded = decodeXmlText(descriptionRaw.trim())
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decoded || null;
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
    const categoryRaw = getTagValue(item, "category").trim();
    const tagRaw = getTagValue(item, "tag").trim();

    if (!title || !link) continue;

    const createdAt = pubRaw ? isoFromPubDate(decodeXmlText(pubRaw.trim())) : null;
    const thumbnail =
      extractMediaThumbnail(item) ?? extractThumbnailFromDescription(descriptionRaw);

    const tagPieces = tagRaw
      ? tagRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const categoryNorm = categoryRaw
      ? categoryRaw.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
      : "";
    const tagSet = new Set<string>();
    if (categoryNorm) tagSet.add(categoryNorm);
    for (const t of tagPieces) tagSet.add(t);
    const tags = tagSet.size ? [...tagSet] : null;

    out.push({
      title,
      url: link,
      createdAt,
      thumbnail,
      description: extractTextFromDescription(descriptionRaw),
      tags,
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

type PostTitleListApiRow = {
  logNo?: string;
  title?: string;
  addDate?: string;
};

function decodePostTitleParam(encoded: string): string {
  const normalized = String(encoded ?? "").replace(/\+/g, "%20");
  try {
    return decodeURIComponent(normalized).normalize("NFKC").trim();
  } catch {
    return normalized.replace(/\+/g, " ").trim();
  }
}

function parseNaverPostListAddDateIso(addDate: string | undefined): string | null {
  const raw = String(addDate ?? "").trim();
  const m = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  const t = new Date(`${y}-${mo}-${d}`).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const TITLE_LIST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

/**
 * 네이버 PostTitleListAsync 응답은 pagingHtml 등에 JSON 표준 밖의 `\'` 이스케이프가 섞여
 * `JSON.parse` 가 실패한다. 홀수 개의 연속 `\` 뒤의 `'` 에 대해서만 앞의 `\` 를 제거한다.
 */
function fixNaverPostTitleListJsonEscapes(raw: string): string {
  return raw.replace(/(\\+)(')/g, (full, slashes: string, quote: string) => {
    if (slashes.length % 2 === 1) return slashes.slice(0, -1) + quote;
    return full;
  });
}

function parsePostTitleListAsyncPayload(raw: string): {
  postList: PostTitleListApiRow[];
  totalCount: number | null;
  resultCode?: string;
} {
  const fixed = fixNaverPostTitleListJsonEscapes(raw);
  const data = JSON.parse(fixed) as {
    postList?: PostTitleListApiRow[];
    totalCount?: string | number;
    resultCode?: string;
  };
  const tc = data.totalCount;
  let totalCount: number | null = null;
  if (typeof tc === "number" && Number.isFinite(tc)) totalCount = Math.floor(tc);
  else if (typeof tc === "string") {
    const n = Number(tc.trim());
    totalCount = Number.isFinite(n) ? Math.floor(n) : null;
  }
  return {
    postList: Array.isArray(data.postList) ? data.postList : [],
    totalCount,
    resultCode: data.resultCode,
  };
}

/** 노출 스냅샷에 남은 글 제목·URL로 후보 풀 보강 (URL로 logNo 매칭 가능한 행만) */
export function postsFromKeywordExposureSnapshotTitles(
  rows: { sourcePostUrl: string | null; sourcePostTitle: string | null }[]
): BlogAnalysisRecentPost[] {
  const seen = new Set<string>();
  const out: BlogAnalysisRecentPost[] = [];
  for (const row of rows) {
    const title = String(row.sourcePostTitle ?? "").trim();
    const url = String(row.sourcePostUrl ?? "").trim();
    if (!title || !url) continue;
    const key = makePostMatchKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url, createdAt: null });
  }
  return out;
}

/**
 * PostTitleListAsync JSON으로 최근·과거 글 제목을 넓게 수집 (RSS보다 깊은 페이지).
 * 페이지별 로그·진단 객체 포함.
 */
export async function fetchBlogPostTitleListPostsWithDiagnostics(
  blogId: string,
  opts?: {
    maxPages?: number;
    countPerPage?: number;
    /** true면 1페이지 응답의 totalCount 기준으로 페이지 수를 늘림(최대 80). keyword-refresh 전용 권장 */
    expandPagesToReportedTotal?: boolean;
  }
): Promise<{ posts: BlogAnalysisRecentPost[]; diagnostics: BlogPostTitleListFetchDiagnostics }> {
  const requestedMaxPages = opts?.maxPages ?? 15;
  const countPerPage = opts?.countPerPage ?? 30;
  const expandPagesToReportedTotal = opts?.expandPagesToReportedTotal === true;
  const bid = blogId.trim();

  const emptyDiag = (): BlogPostTitleListFetchDiagnostics => ({
    titleListAsyncRequestCount: 0,
    titleListAsyncSuccessPages: 0,
    titleListAsyncFailedPages: 0,
    titleListAsyncTotalParsedPosts: 0,
    titleListAsyncReportedTotalPostCount: null,
    titleListAsyncFirstError: null,
    titleListAsyncSampleTitles: [],
  });

  if (!bid) {
    return {
      posts: [],
      diagnostics: {
        ...emptyDiag(),
        titleListAsyncFirstError: "empty_blog_id",
      },
    };
  }
  if (requestedMaxPages <= 0) {
    return {
      posts: [],
      diagnostics: {
        ...emptyDiag(),
        titleListAsyncFirstError: "max_pages_lte_0",
      },
    };
  }

  const out: BlogAnalysisRecentPost[] = [];
  const seenLog = new Set<string>();
  let reportedTotal: number | null = null;
  let effectiveMaxPages = requestedMaxPages;
  let firstError: string | null = null;

  const diagBase = emptyDiag();

  for (let page = 1; page <= effectiveMaxPages; page += 1) {
    const url =
      `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(bid)}` +
      `&viewdate=&currentPage=${page}&categoryNo=0&parentCategoryNo=0&countPerPage=${countPerPage}`;

    diagBase.titleListAsyncRequestCount += 1;

    try {
      const res = await fetch(url, {
        headers: {
          ...TITLE_LIST_HEADERS,
          Referer: `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(bid)}`,
        },
        cache: "no-store",
      });

      const text = await res.text();
      const preview = text.slice(0, 300);

      if (!res.ok) {
        diagBase.titleListAsyncFailedPages += 1;
        const err = `http_${res.status}`;
        if (!firstError) firstError = err;
        console.warn("[PostTitleListAsync]", {
          blogId: bid,
          requestedMaxPages,
          effectiveMaxPages,
          countPerPage,
          page,
          requestUrl: url,
          responseStatus: res.status,
          responsePreview300: preview,
          parsedCountThisPage: 0,
          accumulatedParsedPosts: out.length,
          errorReason: err,
        });
        break;
      }

      let payload: ReturnType<typeof parsePostTitleListAsyncPayload>;
      try {
        payload = parsePostTitleListAsyncPayload(text);
      } catch (parseErr) {
        diagBase.titleListAsyncFailedPages += 1;
        const err =
          parseErr instanceof Error ? `json_parse:${parseErr.message}` : "json_parse:unknown";
        if (!firstError) firstError = err;
        console.warn("[PostTitleListAsync]", {
          blogId: bid,
          requestedMaxPages,
          effectiveMaxPages,
          countPerPage,
          page,
          requestUrl: url,
          responseStatus: res.status,
          responsePreview300: preview,
          parsedCountThisPage: 0,
          accumulatedParsedPosts: out.length,
          errorReason: err,
        });
        break;
      }

      if (page === 1 && payload.totalCount !== null && payload.totalCount > 0) {
        reportedTotal = payload.totalCount;
        if (expandPagesToReportedTotal) {
          const needed = Math.ceil(payload.totalCount / countPerPage);
          effectiveMaxPages = Math.min(Math.max(requestedMaxPages, needed), 80);
        }
      }

      if (payload.resultCode && payload.resultCode !== "S") {
        diagBase.titleListAsyncFailedPages += 1;
        const err = `resultCode:${payload.resultCode}`;
        if (!firstError) firstError = err;
        console.warn("[PostTitleListAsync]", {
          blogId: bid,
          requestedMaxPages,
          effectiveMaxPages,
          countPerPage,
          page,
          requestUrl: url,
          responseStatus: res.status,
          responsePreview300: preview,
          parsedCountThisPage: 0,
          accumulatedParsedPosts: out.length,
          errorReason: err,
        });
        break;
      }

      const list = payload.postList ?? [];
      let addedThisPage = 0;

      for (const row of list) {
        const logNo = String(row.logNo ?? "").trim();
        if (!logNo || seenLog.has(logNo)) continue;
        seenLog.add(logNo);

        const title = decodePostTitleParam(String(row.title ?? ""));
        const postUrl = `https://m.blog.naver.com/${encodeURIComponent(bid)}/${logNo}`;
        const createdAt = parseNaverPostListAddDateIso(row.addDate);

        out.push({
          title: title || `글 ${logNo}`,
          url: postUrl,
          createdAt,
        });
        addedThisPage += 1;
      }

      diagBase.titleListAsyncSuccessPages += 1;

      console.log("[PostTitleListAsync]", {
        blogId: bid,
        requestedMaxPages,
        effectiveMaxPages,
        countPerPage,
        page,
        requestUrl: url,
        responseStatus: res.status,
        responsePreview300: preview,
        parsedCountThisPage: list.length,
        newUniquePostsThisPage: addedThisPage,
        accumulatedParsedPosts: out.length,
        errorReason: null,
      });

      if (list.length === 0) break;
    } catch (e) {
      diagBase.titleListAsyncFailedPages += 1;
      const err = e instanceof Error ? `fetch:${e.message}` : "fetch:unknown";
      if (!firstError) firstError = err;
      console.warn("[PostTitleListAsync]", {
        blogId: bid,
        requestedMaxPages,
        effectiveMaxPages,
        countPerPage,
        page,
        requestUrl: url,
        responseStatus: null,
        responsePreview300: null,
        parsedCountThisPage: 0,
        accumulatedParsedPosts: out.length,
        errorReason: err,
      });
      break;
    }
  }

  const diagnostics: BlogPostTitleListFetchDiagnostics = {
    titleListAsyncRequestCount: diagBase.titleListAsyncRequestCount,
    titleListAsyncSuccessPages: diagBase.titleListAsyncSuccessPages,
    titleListAsyncFailedPages: diagBase.titleListAsyncFailedPages,
    titleListAsyncTotalParsedPosts: out.length,
    titleListAsyncReportedTotalPostCount: reportedTotal,
    titleListAsyncFirstError: firstError,
    titleListAsyncSampleTitles: out.slice(0, 20).map((p) => p.title),
  };

  return { posts: out, diagnostics };
}

/**
 * PostTitleListAsync JSON으로 최근·과거 글 제목을 넓게 수집 (RSS보다 깊은 페이지).
 */
export async function fetchBlogPostTitleListPosts(
  blogId: string,
  opts?: { maxPages?: number; countPerPage?: number; expandPagesToReportedTotal?: boolean }
): Promise<BlogAnalysisRecentPost[]> {
  const r = await fetchBlogPostTitleListPostsWithDiagnostics(blogId, opts);
  return r.posts;
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
