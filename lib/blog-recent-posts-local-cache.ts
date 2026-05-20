import type { BlogAnalysisRecentPost } from "@/lib/blog-analysis-types";
import {
  mergeApiAndCachedRecentPosts,
  sortRecentPostsByPublishedAtDesc,
} from "@/lib/blog-recent-posts-dedupe";

export const RECENT_POSTS_LOCAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RECENT_POSTS_LOCAL_CACHE_MAX = 300;

const RECENT_POST_MAX_PAGE_SIZE = 30;
const RECENT_POST_PAGE_SIZE_STEPS = [5, 10, 20, 30] as const;
const RECENT_POST_INITIAL_PAGE_SIZE = RECENT_POST_PAGE_SIZE_STEPS[0];

export type BlogRecentPostsLocalCache = {
  blogId: string;
  posts: BlogAnalysisRecentPost[];
  nextTitleListPage: number;
  hasMore: boolean;
  totalCount: number | null;
  currentPage: number;
  pageSize: number;
  savedAt: number;
};

export type RecentPostsLocalCacheReadResult =
  | { status: "miss" }
  | { status: "expired"; cache: BlogRecentPostsLocalCache }
  | { status: "hit"; cache: BlogRecentPostsLocalCache };

export function getRecentPostsLocalCacheKey(blogId: string): string {
  return `blog_analysis_recent_posts_${blogId.trim().toLowerCase()}`;
}

function getRecentPostsPaginationPageCount(loadedCount: number, hasMore: boolean): number {
  const loadedPages = Math.max(1, Math.ceil(loadedCount / RECENT_POST_MAX_PAGE_SIZE));
  return loadedPages + (hasMore ? 1 : 0);
}

function isValidRestoredPageSize(page: number, pageSize: number): boolean {
  if (page > 1) return pageSize === RECENT_POST_MAX_PAGE_SIZE;
  return (RECENT_POST_PAGE_SIZE_STEPS as readonly number[]).includes(pageSize);
}

export function resolveRestoredRecentPostsPagination(
  currentPage: number,
  pageSize: number,
  mergedCount: number,
  hasMore: boolean
): { currentPage: number; pageSize: number } {
  const totalPages = getRecentPostsPaginationPageCount(mergedCount, hasMore);
  const safePage = Math.min(Math.max(1, Math.floor(currentPage) || 1), totalPages);
  let safePageSize = pageSize;
  if (safePage > 1) {
    safePageSize = RECENT_POST_MAX_PAGE_SIZE;
  } else if (!isValidRestoredPageSize(safePage, safePageSize)) {
    safePageSize = RECENT_POST_INITIAL_PAGE_SIZE;
  }
  return { currentPage: safePage, pageSize: safePageSize };
}

function trimPostsForCache(posts: BlogAnalysisRecentPost[]): BlogAnalysisRecentPost[] {
  return posts.slice(0, RECENT_POSTS_LOCAL_CACHE_MAX);
}

function isCacheFresh(savedAt: number, now = Date.now()): boolean {
  return Number.isFinite(savedAt) && now - savedAt < RECENT_POSTS_LOCAL_CACHE_TTL_MS;
}

function parseCache(raw: string, expectedBlogId: string): BlogRecentPostsLocalCache | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BlogRecentPostsLocalCache>;
    if (!parsed || typeof parsed !== "object") return null;
    if (String(parsed.blogId ?? "").trim().toLowerCase() !== expectedBlogId.trim().toLowerCase()) {
      return null;
    }
    if (!Array.isArray(parsed.posts)) return null;
    const savedAt = Number(parsed.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    return {
      blogId: String(parsed.blogId).trim(),
      posts: parsed.posts,
      nextTitleListPage: Math.max(1, Number(parsed.nextTitleListPage) || 2),
      hasMore: Boolean(parsed.hasMore),
      totalCount:
        parsed.totalCount === null || parsed.totalCount === undefined
          ? null
          : Number(parsed.totalCount),
      currentPage: Math.max(1, Number(parsed.currentPage) || 1),
      pageSize: Number(parsed.pageSize) || RECENT_POST_INITIAL_PAGE_SIZE,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function logRecentPostsLocalCache(
  action: "restore" | "save" | "expired" | "merge",
  payload: Record<string, unknown>
): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log("[blog-analysis recent-posts local-cache]", { action, ...payload });
}

export function readRecentPostsLocalCache(blogId: string): RecentPostsLocalCacheReadResult {
  if (typeof window === "undefined") return { status: "miss" };
  const normalizedId = blogId.trim();
  if (!normalizedId) return { status: "miss" };

  try {
    const raw = localStorage.getItem(getRecentPostsLocalCacheKey(normalizedId));
    if (!raw) return { status: "miss" };
    const cache = parseCache(raw, normalizedId);
    if (!cache) {
      localStorage.removeItem(getRecentPostsLocalCacheKey(normalizedId));
      return { status: "miss" };
    }
    if (!isCacheFresh(cache.savedAt)) {
      return { status: "expired", cache };
    }
    return { status: "hit", cache };
  } catch {
    return { status: "miss" };
  }
}

export function clearRecentPostsLocalCache(blogId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getRecentPostsLocalCacheKey(blogId));
  } catch {
    /* ignore */
  }
}

export function saveRecentPostsLocalCache(
  entry: Omit<BlogRecentPostsLocalCache, "savedAt"> & { savedAt?: number }
): void {
  if (typeof window === "undefined") return;
  const normalizedId = entry.blogId.trim();
  if (!normalizedId) return;

  const savedAt = entry.savedAt ?? Date.now();
  const posts = trimPostsForCache(
    sortRecentPostsByPublishedAtDesc(entry.posts)
  );
  const payload: BlogRecentPostsLocalCache = {
    blogId: normalizedId,
    posts,
    nextTitleListPage: Math.max(1, entry.nextTitleListPage),
    hasMore: entry.hasMore,
    totalCount: entry.totalCount,
    currentPage: Math.max(1, entry.currentPage),
    pageSize: entry.pageSize,
    savedAt,
  };

  try {
    localStorage.setItem(getRecentPostsLocalCacheKey(normalizedId), JSON.stringify(payload));
    logRecentPostsLocalCache("save", {
      blogId: normalizedId,
      restoredCount: posts.length,
      currentPage: payload.currentPage,
      pageSize: payload.pageSize,
      savedAt: payload.savedAt,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[blog-analysis recent-posts local-cache] save failed", error);
    }
  }
}

export type ApplyRecentPostsLocalCacheInput = {
  blogId: string;
  apiPosts: BlogAnalysisRecentPost[];
  apiNextTitleListPage: number;
  apiHasMore: boolean;
  apiTotalCount: number | null;
};

export type ApplyRecentPostsLocalCacheResult = {
  posts: BlogAnalysisRecentPost[];
  nextTitleListPage: number;
  hasMore: boolean;
  totalCount: number | null;
  currentPage: number;
  pageSize: number;
  restoredFromCache: boolean;
};

export function applyRecentPostsLocalCacheOnLoad(
  input: ApplyRecentPostsLocalCacheInput
): ApplyRecentPostsLocalCacheResult {
  const {
    blogId,
    apiPosts,
    apiNextTitleListPage,
    apiHasMore,
    apiTotalCount,
  } = input;

  const base = {
    posts: apiPosts,
    nextTitleListPage: apiNextTitleListPage,
    hasMore: apiHasMore,
    totalCount: apiTotalCount,
    currentPage: 1,
    pageSize: RECENT_POST_INITIAL_PAGE_SIZE,
    restoredFromCache: false,
  };

  const cacheRead = readRecentPostsLocalCache(blogId);
  if (cacheRead.status === "expired") {
    clearRecentPostsLocalCache(blogId);
    logRecentPostsLocalCache("expired", {
      blogId,
      savedAt: cacheRead.cache.savedAt,
    });
    return base;
  }
  if (cacheRead.status !== "hit") {
    return base;
  }

  const cache = cacheRead.cache;
  const mergedPosts = mergeApiAndCachedRecentPosts(apiPosts, cache.posts, blogId);
  const hasMore = apiHasMore || cache.hasMore;
  const { currentPage, pageSize } = resolveRestoredRecentPostsPagination(
    cache.currentPage,
    cache.pageSize,
    mergedPosts.length,
    hasMore
  );

  logRecentPostsLocalCache("merge", {
    blogId,
    apiCount: apiPosts.length,
    restoredCount: cache.posts.length,
    mergedCount: mergedPosts.length,
    currentPage,
    pageSize,
    savedAt: cache.savedAt,
  });

  logRecentPostsLocalCache("restore", {
    blogId,
    restoredCount: cache.posts.length,
    apiCount: apiPosts.length,
    mergedCount: mergedPosts.length,
    currentPage,
    pageSize,
    savedAt: cache.savedAt,
  });

  return {
    posts: mergedPosts,
    nextTitleListPage: Math.max(apiNextTitleListPage, cache.nextTitleListPage),
    hasMore,
    totalCount: apiTotalCount ?? cache.totalCount,
    currentPage,
    pageSize,
    restoredFromCache: true,
  };
}
