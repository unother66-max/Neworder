import crypto from "crypto";
import type { BlogAnalysisRecentPost } from "@/lib/blog-analysis-types";
import {
  extractMetricsFromPostHtml,
  scoreContentLength,
  scoreImageCount,
  scoreTitleLength,
  toMobileBlogPostUrl,
} from "@/lib/blog-post-pattern";

const RECENT_POST_TTL_MS = 24 * 60 * 60 * 1000;
const OLD_POST_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type BlogPostMetricSnapshotLike = {
  blogId: string;
  postKey: string;
  postUrl: string;
  orgUrl?: string | null;
  logNo?: string | null;
  title: string;
  publishedAt?: Date | null;
  thumbnail?: string | null;
  wordCount?: number | null;
  imageCount?: number | null;
  videoCount?: number | null;
  commentCount?: number | null;
  sympathyCount?: number | null;
  shareCount?: number | null;
  titleScore?: number | null;
  contentLengthScore?: number | null;
  imageScore?: number | null;
  potentialScore?: number | null;
  reactivityScore?: number | null;
  relatednessScore?: number | null;
  postLevel?: number | null;
  exposureStatus?: string | null;
  foundOnSearch?: boolean | null;
  analyzedAt?: Date | null;
  updatedAt?: Date | null;
};

export type BlogPostMetricDraft = {
  wordCount?: number | null;
  imageCount?: number | null;
  videoCount?: number | null;
  commentCount?: number | null;
  sympathyCount?: number | null;
  shareCount?: number | null;
  titleScore?: number | null;
  contentLengthScore?: number | null;
  imageScore?: number | null;
  potentialScore?: number | null;
  reactivityScore?: number | null;
  relatednessScore?: number | null;
  exposureStatus?: string | null;
  foundOnSearch?: boolean | null;
};

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return String(raw ?? "").trim();
  }
}

function hashPostUrl(url: string): string {
  return crypto.createHash("sha256").update(normalizeUrl(url)).digest("hex").slice(0, 32);
}

export function extractBlogPostLogNo(postUrl: string): string | null {
  try {
    const url = new URL(postUrl.trim());
    const queryLogNo = url.searchParams.get("logNo");
    if (queryLogNo && /^\d+$/.test(queryLogNo)) return queryLogNo;

    const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
  } catch {
    return null;
  }

  const match = String(postUrl ?? "").match(/(?:logNo=|\/)(\d{6,})(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

export function buildBlogPostMetricIdentity(post: BlogAnalysisRecentPost): {
  postKey: string;
  logNo: string | null;
} {
  const logNo = extractBlogPostLogNo(post.url);
  return {
    postKey: logNo ? `log:${logNo}` : `url:${hashPostUrl(post.url)}`,
    logNo,
  };
}

export function withBlogPostMetricIdentity(post: BlogAnalysisRecentPost): BlogAnalysisRecentPost {
  const { postKey, logNo } = buildBlogPostMetricIdentity(post);
  return {
    ...post,
    postKey,
    logNo,
    orgUrl: post.orgUrl ?? post.url,
    publishedAt: post.publishedAt ?? post.createdAt ?? null,
  };
}

function dateFromIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoFromDate(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function publishedAtDate(post: BlogAnalysisRecentPost): Date | null {
  return dateFromIso(post.publishedAt ?? post.createdAt);
}

export function isBlogPostMetricCacheFresh(
  row: Pick<BlogPostMetricSnapshotLike, "analyzedAt" | "updatedAt" | "publishedAt">,
  now = new Date()
): boolean {
  const checkedAt = row.analyzedAt ?? row.updatedAt ?? null;
  if (!checkedAt) return false;

  const publishedAt = row.publishedAt ?? null;
  const isRecentPost =
    publishedAt !== null && now.getTime() - publishedAt.getTime() <= RECENT_POST_WINDOW_MS;
  const ttl = isRecentPost ? RECENT_POST_TTL_MS : OLD_POST_TTL_MS;

  return now.getTime() - checkedAt.getTime() <= ttl;
}

export function mergeBlogPostMetricSnapshot(
  post: BlogAnalysisRecentPost,
  row: BlogPostMetricSnapshotLike
): BlogAnalysisRecentPost {
  return {
    ...post,
    postKey: row.postKey,
    logNo: row.logNo ?? post.logNo ?? null,
    orgUrl: row.orgUrl ?? post.orgUrl ?? post.url,
    publishedAt: isoFromDate(row.publishedAt) ?? post.publishedAt ?? post.createdAt ?? null,
    thumbnail: row.thumbnail ?? post.thumbnail ?? null,
    wordCount: row.wordCount ?? post.wordCount ?? null,
    imageCount: row.imageCount ?? post.imageCount ?? null,
    videoCount: row.videoCount ?? post.videoCount ?? null,
    commentCount: row.commentCount ?? post.commentCount ?? null,
    sympathyCount: row.sympathyCount ?? post.sympathyCount ?? null,
    shareCount: row.shareCount ?? post.shareCount ?? null,
    titleScore: row.titleScore ?? post.titleScore ?? null,
    contentLengthScore: row.contentLengthScore ?? post.contentLengthScore ?? null,
    imageScore: row.imageScore ?? post.imageScore ?? null,
    potentialScore: row.potentialScore ?? post.potentialScore ?? null,
    reactivityScore: row.reactivityScore ?? post.reactivityScore ?? null,
    relatednessScore: row.relatednessScore ?? post.relatednessScore ?? null,
    postLevel: row.postLevel ?? post.postLevel ?? null,
    exposureStatus: row.exposureStatus ?? post.exposureStatus ?? null,
    foundOnSearch: row.foundOnSearch ?? post.foundOnSearch ?? null,
  };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

const TITLE_TOKEN_STOPWORDS = new Set([
  "후기",
  "추천",
  "방법",
  "예약",
  "여행",
  "맛집",
  "카페",
  "일상",
  "정보",
  "리뷰",
  "방문",
  "솔직",
  "완벽",
  "가이드",
  "포인트",
  "가족",
  "오늘",
  "이번",
  "진짜",
  "제대로",
  "그리고",
  "네이버",
  "블로그",
]);

function tokenizeContent(raw: string): string[] {
  return Array.from(
    new Set(
      String(raw ?? "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .match(/[가-힣a-z0-9]{2,}/g) ?? []
    )
  ).filter((token) => !TITLE_TOKEN_STOPWORDS.has(token));
}

function scoreRelatedness(title: string, contentText: string): number {
  const titleText = String(title ?? "").trim();
  const titleTokens = tokenizeContent(titleText);
  if (titleText.length < 4 || titleTokens.length === 0) return 25;

  const contentTokens = tokenizeContent(contentText);
  if (contentTokens.length === 0) return 20;

  const contentSet = new Set(contentTokens);
  const matchedTitleTokens = titleTokens.filter((token) => contentSet.has(token));
  const tokenCoverage = matchedTitleTokens.length / titleTokens.length;

  const normalizedContent = String(contentText ?? "").toLowerCase();
  const appearanceScores = titleTokens.map((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (normalizedContent.match(new RegExp(escaped, "g")) ?? []).length;
    return Math.min(1, count / 3);
  });
  const appearanceScore =
    appearanceScores.reduce((sum, value) => sum + value, 0) / Math.max(1, appearanceScores.length);

  const rawScore = 25 + tokenCoverage * 50 + appearanceScore * 25;
  const conservativeCap = titleText.length < 8 || titleTokens.length <= 1 ? 60 : 100;
  return clampScore(Math.min(rawScore, conservativeCap));
}

function draftPotentialScore(
  titleScore: number,
  contentLengthScore: number,
  imageScore: number,
  relatednessScore: number
): number {
  return clampScore(
    titleScore * 0.22 +
      contentLengthScore * 0.34 +
      imageScore * 0.22 +
      relatednessScore * 0.22
  );
}

function parseCountValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function firstCountFromPatterns(html: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = parseCountValue(match?.[1]);
    if (value !== null) return value;
  }
  return null;
}

function extractEngagementCountsFromHtml(html: string): {
  commentCount: number;
  shareCount: number;
  likeContentsId: string | null;
} {
  const commentCount =
    firstCountFromPatterns(html, [
      /\bcommentCount\s*=\s*["'](\d+)["']/i,
      /["']commentCount["']\s*:\s*["']?(\d+)["']?/i,
      /["']commentCnt["']\s*:\s*["']?(\d+)["']?/i,
      /["']comment_count["']\s*:\s*["']?(\d+)["']?/i,
      /["']replyCount["']\s*:\s*["']?(\d+)["']?/i,
    ]) ?? 0;

  const shareCount =
    firstCountFromPatterns(html, [
      /\\"shareCount\\"\s*:\s*(\d+)/i,
      /["']shareCount["']\s*:\s*["']?(\d+)["']?/i,
      /["']shareCnt["']\s*:\s*["']?(\d+)["']?/i,
      /["']sharedCount["']\s*:\s*["']?(\d+)["']?/i,
    ]) ?? 0;

  const likeContentsId =
    html.match(/\bdata-likeContentsId\s*=\s*["']([^"']+)["']/i)?.[1] ??
    html.match(/\bdata-cid\s*=\s*["']([^"']+)["']/i)?.[1] ??
    null;

  return { commentCount, shareCount, likeContentsId };
}

function extractSympathyCountFromLikeResponse(data: unknown): number {
  const content = Array.isArray((data as { contents?: unknown[] })?.contents)
    ? (data as { contents: unknown[] }).contents[0]
    : data;
  if (!content || typeof content !== "object") return 0;

  const row = content as Record<string, unknown>;
  const direct = firstCountFromUnknown(row, [
    "sympathyCount",
    "sympathyCnt",
    "likeCount",
    "reactionCount",
    "count",
    "totalCount",
  ]);
  if (direct !== null) return direct;

  const reactions = Array.isArray(row.reactions) ? row.reactions : [];
  for (const reaction of reactions) {
    if (!reaction || typeof reaction !== "object") continue;
    const reactionRow = reaction as Record<string, unknown>;
    const reactionType = String(reactionRow.reactionType ?? reactionRow.type ?? "").toLowerCase();
    if (reactionType && reactionType !== "like") continue;
    const count = firstCountFromUnknown(reactionRow, ["count", "reactionCount", "likeCount"]);
    if (count !== null) return count;
  }

  const reactionMap = row.reactionMap;
  if (reactionMap && typeof reactionMap === "object") {
    const like = (reactionMap as Record<string, unknown>).like;
    if (like && typeof like === "object") {
      const count = firstCountFromUnknown(like as Record<string, unknown>, ["count", "reactionCount", "likeCount"]);
      if (count !== null) return count;
    }
  }

  return 0;
}

function firstCountFromUnknown(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string") {
      const count = parseCountValue(value);
      if (count !== null) return count;
    }
  }
  return null;
}

function fallbackLikeContentsId(post: BlogAnalysisRecentPost): string | null {
  const { logNo } = buildBlogPostMetricIdentity(post);
  if (!logNo) return null;
  try {
    const url = new URL(post.url);
    const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const blogId = parts[0];
    return blogId ? `${blogId}_${logNo}` : null;
  } catch {
    return null;
  }
}

function extractBlogPostIdentity(post: BlogAnalysisRecentPost): { blogId: string; logNo: string } | null {
  const { logNo } = buildBlogPostMetricIdentity(post);
  if (!logNo) return null;
  try {
    const url = new URL(post.url);
    const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const blogId = parts[0];
    return blogId ? { blogId, logNo } : null;
  } catch {
    return null;
  }
}

async function fetchSympathyCountFromHistory(
  identity: { blogId: string; logNo: string } | null,
  referer: string
): Promise<number | null> {
  if (!identity) return null;

  try {
    const url =
      `https://blog.naver.com/api/blogs/${encodeURIComponent(identity.blogId)}` +
      `/posts/${encodeURIComponent(identity.logNo)}/sympathy-users?itemCount=1&timeStamp=${Date.now() + 3000}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: referer,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { isSuccess?: boolean; result?: { totalCount?: unknown } };
    if (data.isSuccess === false) return null;
    const count = firstCountFromUnknown({ totalCount: data.result?.totalCount }, ["totalCount"]);
    return count ?? null;
  } catch {
    return null;
  }
}

async function fetchSympathyCountFromLike(contentsId: string | null, referer: string): Promise<number | null> {
  if (!contentsId) return null;

  try {
    const q = encodeURIComponent(`BLOG[${contentsId}]`);
    const url = `https://blog.like.naver.com/v1/search/contents?suppress_response_codes=true&q=${q}&isDuplication=true&displayId=BLOG&cssIds=BASIC_MOBILE`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: referer,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return extractSympathyCountFromLikeResponse(data);
  } catch {
    return null;
  }
}

async function fetchSympathyCount(post: BlogAnalysisRecentPost, likeContentsId: string | null, referer: string): Promise<number> {
  const identity = extractBlogPostIdentity(post);
  const historyCount = await fetchSympathyCountFromHistory(identity, referer);
  if (historyCount !== null) return historyCount;

  const likeCount = await fetchSympathyCountFromLike(likeContentsId ?? fallbackLikeContentsId(post), referer);
  return likeCount ?? 0;
}

async function fetchPostHtml(url: string, referer: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: referer,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchBlogPostMetricDraft(
  post: BlogAnalysisRecentPost
): Promise<BlogPostMetricDraft | null> {
  const mobileUrl = toMobileBlogPostUrl(post.url);
  if (!mobileUrl) return null;

  const html = await fetchPostHtml(mobileUrl, post.url);
  if (!html) return null;

  const metrics = extractMetricsFromPostHtml(html, post.title);
  if (!metrics) return null;
  const engagement = extractEngagementCountsFromHtml(html);
  const sympathyCount = await fetchSympathyCount(post, engagement.likeContentsId, mobileUrl);

  const titleScore = clampScore(scoreTitleLength(metrics.titleLength));
  const contentLengthScore = clampScore(scoreContentLength(metrics.contentLength));
  const imageScore = clampScore(scoreImageCount(metrics.imageCount));
  const relatednessScore = scoreRelatedness(post.title, metrics.contentText);

  return {
    wordCount: metrics.contentLength,
    imageCount: metrics.imageCount,
    videoCount: metrics.videoCount,
    commentCount: engagement.commentCount,
    sympathyCount,
    shareCount: engagement.shareCount,
    titleScore,
    contentLengthScore,
    imageScore,
    potentialScore: draftPotentialScore(titleScore, contentLengthScore, imageScore, relatednessScore),
    relatednessScore,
    exposureStatus: "analyzed",
    foundOnSearch: null,
  };
}
