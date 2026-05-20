import type { BlogAnalysisRecentPost } from "@/lib/blog-analysis-types";
import {
  fetchBlogPostMetricDraft,
  isBlogPostMetricCacheFresh,
  mergeBlogPostMetricSnapshot,
  publishedAtDate,
  withBlogPostMetricIdentity,
} from "@/lib/blog-post-metric-cache";
import { BLOG_RECENT_POSTS_INITIAL_METRIC_FETCH_LIMIT } from "@/lib/blog-recent-posts-config";
import { prisma } from "@/lib/prisma";

export async function mergeRecentPostsWithMetricCache(
  blogId: string,
  posts: BlogAnalysisRecentPost[] | null | undefined,
  options?: { metricFetchLimit?: number }
): Promise<BlogAnalysisRecentPost[]> {
  const postsWithKeys = (posts ?? []).map(withBlogPostMetricIdentity);
  const postKeys = postsWithKeys.map((post) => post.postKey).filter((key): key is string => Boolean(key));
  if (postKeys.length === 0) return postsWithKeys;

  try {
    const cachedRows = await prisma.blogPostMetricSnapshot.findMany({
      where: {
        blogId,
        postKey: { in: postKeys },
      },
    });
    const cacheByKey = new Map(cachedRows.map((row) => [row.postKey, row]));
    const now = new Date();
    const enriched: BlogAnalysisRecentPost[] = [];
    const metricFetchLimit = options?.metricFetchLimit ?? BLOG_RECENT_POSTS_INITIAL_METRIC_FETCH_LIMIT;
    let metricFetchCount = 0;

    for (const post of postsWithKeys) {
      const cached = post.postKey ? cacheByKey.get(post.postKey) : null;
      if (cached && isBlogPostMetricCacheFresh(cached, now)) {
        enriched.push(mergeBlogPostMetricSnapshot(post, cached));
        continue;
      }

      if (metricFetchCount >= metricFetchLimit) {
        enriched.push(cached ? mergeBlogPostMetricSnapshot(post, cached) : post);
        continue;
      }
      metricFetchCount += 1;

      const draft = await fetchBlogPostMetricDraft(post);
      if (!draft || !post.postKey) {
        enriched.push(cached ? mergeBlogPostMetricSnapshot(post, cached) : post);
        continue;
      }

      try {
        const saved = await prisma.blogPostMetricSnapshot.upsert({
          where: {
            blogId_postKey: {
              blogId,
              postKey: post.postKey,
            },
          },
          create: {
            blogId,
            postKey: post.postKey,
            postUrl: post.url,
            orgUrl: post.orgUrl ?? post.url,
            logNo: post.logNo ?? null,
            title: post.title || "-",
            publishedAt: publishedAtDate(post),
            thumbnail: post.thumbnail ?? null,
            wordCount: draft.wordCount ?? null,
            imageCount: draft.imageCount ?? null,
            videoCount: draft.videoCount ?? null,
            commentCount: draft.commentCount ?? 0,
            sympathyCount: draft.sympathyCount ?? 0,
            shareCount: draft.shareCount ?? 0,
            titleScore: draft.titleScore ?? null,
            contentLengthScore: draft.contentLengthScore ?? null,
            imageScore: draft.imageScore ?? null,
            potentialScore: draft.potentialScore ?? null,
            reactivityScore: draft.reactivityScore ?? null,
            relatednessScore: draft.relatednessScore ?? null,
            exposureStatus: draft.exposureStatus ?? "analyzed",
            foundOnSearch: draft.foundOnSearch ?? null,
            analyzedAt: now,
          },
          update: {
            postUrl: post.url,
            orgUrl: post.orgUrl ?? post.url,
            logNo: post.logNo ?? null,
            title: post.title || "-",
            publishedAt: publishedAtDate(post),
            thumbnail: post.thumbnail ?? null,
            wordCount: draft.wordCount ?? null,
            imageCount: draft.imageCount ?? null,
            videoCount: draft.videoCount ?? null,
            commentCount: draft.commentCount ?? 0,
            sympathyCount: draft.sympathyCount ?? 0,
            shareCount: draft.shareCount ?? 0,
            titleScore: draft.titleScore ?? null,
            contentLengthScore: draft.contentLengthScore ?? null,
            imageScore: draft.imageScore ?? null,
            potentialScore: draft.potentialScore ?? null,
            reactivityScore: draft.reactivityScore ?? null,
            relatednessScore: draft.relatednessScore ?? null,
            exposureStatus: draft.exposureStatus ?? "analyzed",
            foundOnSearch: draft.foundOnSearch ?? null,
            analyzedAt: now,
          },
        });
        enriched.push(mergeBlogPostMetricSnapshot(post, saved));
      } catch (e) {
        console.warn("[blog-analysis] 포스팅 메트릭 캐시 저장 실패:", e);
        enriched.push(cached ? mergeBlogPostMetricSnapshot(post, cached) : { ...post, ...draft });
      }
    }

    return enriched;
  } catch (e) {
    console.warn("[blog-analysis] 포스팅 메트릭 캐시 조회 실패:", e);
    return postsWithKeys;
  }
}
