import type { BlogAnalysisRecentPost } from "@/lib/blog-analysis-types";

export function recentPostPublishedTime(post: BlogAnalysisRecentPost): number {
  const raw = post.publishedAt ?? post.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function recentPostDedupeKey(post: BlogAnalysisRecentPost, blogId: string): string {
  const logNo = String(post.logNo ?? "").trim();
  if (logNo) return `${blogId}::logNo::${logNo}`;
  const url = String(post.url ?? post.orgUrl ?? "").trim();
  if (url) return `${blogId}::url::${url}`;
  const title = String(post.title ?? "").trim();
  const publishedAt = String(post.publishedAt ?? post.createdAt ?? "").trim();
  return `${blogId}::title::${title}::${publishedAt}`;
}

export function dedupeRecentPosts(
  posts: BlogAnalysisRecentPost[],
  blogId: string
): BlogAnalysisRecentPost[] {
  const seen = new Set<string>();
  const unique: BlogAnalysisRecentPost[] = [];
  for (const post of posts) {
    const key = recentPostDedupeKey(post, blogId);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(post);
  }
  return unique;
}

export function sortRecentPostsByPublishedAtDesc(
  posts: BlogAnalysisRecentPost[]
): BlogAnalysisRecentPost[] {
  return [...posts].sort((a, b) => recentPostPublishedTime(b) - recentPostPublishedTime(a));
}

/** API 최신글 우선 — 동일 키는 apiPosts 쪽이 유지됩니다. */
export function mergeApiAndCachedRecentPosts(
  apiPosts: BlogAnalysisRecentPost[],
  cachedPosts: BlogAnalysisRecentPost[],
  blogId: string
): BlogAnalysisRecentPost[] {
  return sortRecentPostsByPublishedAtDesc(dedupeRecentPosts([...apiPosts, ...cachedPosts], blogId));
}
