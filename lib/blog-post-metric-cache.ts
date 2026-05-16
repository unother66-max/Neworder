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

function draftPotentialScore(titleScore: number, contentLengthScore: number, imageScore: number): number {
  return clampScore(titleScore * 0.25 + contentLengthScore * 0.45 + imageScore * 0.30);
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

  const titleScore = clampScore(scoreTitleLength(metrics.titleLength));
  const contentLengthScore = clampScore(scoreContentLength(metrics.contentLength));
  const imageScore = clampScore(scoreImageCount(metrics.imageCount));

  return {
    wordCount: metrics.contentLength,
    imageCount: metrics.imageCount,
    videoCount: null,
    titleScore,
    contentLengthScore,
    imageScore,
    potentialScore: draftPotentialScore(titleScore, contentLengthScore, imageScore),
    relatednessScore: null,
    exposureStatus: "analyzed",
    foundOnSearch: null,
  };
}
