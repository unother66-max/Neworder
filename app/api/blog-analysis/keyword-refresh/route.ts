import { NextResponse } from "next/server";
import type { BlogAnalysisRecentPost } from "@/lib/blog-analysis-types";
import { requireAdminApi } from "@/lib/require-admin-api";
import { extractBlogId } from "@/lib/scraper";
import { refreshBlogKeywords } from "@/lib/blog-keyword-refresh-service";
import { buildBlogPostMetricIdentity, publishedAtDate, withBlogPostMetricIdentity } from "@/lib/blog-post-metric-cache";
import { prisma } from "@/lib/prisma";

type PostPageSourcePost = BlogAnalysisRecentPost & {
  isPopularRecheckCandidate?: boolean;
  popularRank?: number | null;
};

function postKeywordAnalysisStaleDays(): { days: number; source: "default" | "env" } {
  const raw = process.env.BLOG_POST_KEYWORD_ANALYSIS_STALE_DAYS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return { days: Math.min(90, Math.max(1, Math.floor(parsed))), source: "env" };
  }
  return { days: 14, source: "default" };
}

function popularPostRecheckLimit(): { limit: number; source: "default" | "env" } {
  const raw = process.env.BLOG_POPULAR_POST_RECHECK_LIMIT;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return { limit: Math.min(20, Math.max(1, Math.floor(parsed))), source: "env" };
  }
  return { limit: 10, source: "default" };
}

function popularPostRecheckCooldownHours(): { hours: number; source: "default" | "env" } {
  const raw = process.env.BLOG_POPULAR_POST_RECHECK_COOLDOWN_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return { hours: Math.min(168, Math.max(1, Math.floor(parsed))), source: "env" };
  }
  return { hours: 24, source: "default" };
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  try {
    const body = (await request.json()) as {
      blogUrl?: unknown;
      blogId?: unknown;
      force?: unknown;
      mode?: unknown;
      page?: unknown;
      sourcePosts?: unknown;
    };
    const forceKeywordRefreshDevOnly =
      process.env.NODE_ENV === "development" && Boolean(body.force);
    const blogId = extractBlogId(String(body.blogUrl ?? body.blogId ?? ""));
    if (!blogId) {
      return NextResponse.json(
        { ok: false, error: "올바른 네이버 블로그 아이디 또는 주소를 입력해주세요." },
        { status: 400 }
      );
    }

    const mode = body.mode === "post-page" ? "post-page" : "full";
    const sourcePosts =
      mode === "post-page" && Array.isArray(body.sourcePosts)
        ? body.sourcePosts
            .slice(0, 30)
            .map((post): PostPageSourcePost | null => {
              if (!post || typeof post !== "object") return null;
              const row = post as Record<string, unknown>;
              const title = String(row.title ?? "").trim();
              const url = String(row.url ?? row.postUrl ?? "").trim();
              const popularRank = Number(row.popularRank);
              if (!title || !url) return null;
              return {
                title,
                url,
                orgUrl: typeof row.orgUrl === "string" ? row.orgUrl : url,
                logNo: typeof row.logNo === "string" || typeof row.logNo === "number" ? String(row.logNo) : null,
                isPopularRecheckCandidate: Boolean(row.isPopularRecheckCandidate),
                popularRank: Number.isFinite(popularRank) && popularRank > 0 ? Math.floor(popularRank) : null,
                createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
                publishedAt: typeof row.publishedAt === "string" ? row.publishedAt : null,
                description: typeof row.description === "string" ? row.description : null,
                tags: Array.isArray(row.tags)
                  ? row.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20)
                  : null,
              };
            })
            .filter((post): post is PostPageSourcePost => post !== null)
        : [];

    if (mode === "post-page" && sourcePosts.length === 0) {
      return NextResponse.json(
        { ok: false, error: "추가 분석할 포스팅 목록이 없습니다." },
        { status: 400 }
      );
    }

    let postPageMeta:
      | {
          requestedPosts: PostPageSourcePost[];
          skippedFreshPostCount: number;
          stalePostCount: number;
          newPostCount: number;
          popularRecheckPostCount: number;
          keywordAnalyzedAtCutoff: Date;
          popularRecheckCutoff: Date;
          popularRecheckLimit: number;
          popularRecheckCooldownHours: number;
          samplePopularRecheckTitles: string[];
          sampleSkippedPostTitles: string[];
          validKeywordCountBefore: number;
        }
      | null = null;

    if (mode === "post-page") {
      const staleConfig = postKeywordAnalysisStaleDays();
      const popularLimitConfig = popularPostRecheckLimit();
      const popularCooldownConfig = popularPostRecheckCooldownHours();
      const cutoff = new Date(Date.now() - staleConfig.days * 24 * 60 * 60 * 1000);
      const popularCutoff = new Date(Date.now() - popularCooldownConfig.hours * 60 * 60 * 1000);
      const postsWithKeys = sourcePosts.map((post) => withBlogPostMetricIdentity(post) as PostPageSourcePost);
      const postKeys = postsWithKeys.map((post) => post.postKey).filter((key): key is string => Boolean(key));
      const cachedRows =
        postKeys.length > 0
          ? await prisma.blogPostMetricSnapshot.findMany({
              where: { blogId, postKey: { in: postKeys } },
              select: {
                postKey: true,
                keywordAnalyzedAt: true,
                title: true,
              },
            })
          : [];
      const validKeywordCountBefore = await prisma.blogKeywordExposureSnapshot.count({
        where: { blogId, keywordValidationStatus: "valid" },
      });
      const cacheByKey = new Map(cachedRows.map((row) => [row.postKey, row]));
      const requestedPosts: PostPageSourcePost[] = [];
      const skippedPosts: PostPageSourcePost[] = [];
      const popularRecheckPosts: PostPageSourcePost[] = [];
      let stalePostCount = 0;
      let newPostCount = 0;
      let popularRecheckPostCount = 0;

      for (const post of postsWithKeys) {
        const key = post.postKey;
        const cached = key ? cacheByKey.get(key) : null;
        if (!cached?.keywordAnalyzedAt) {
          newPostCount += 1;
          requestedPosts.push(post);
          continue;
        }
        if (cached.keywordAnalyzedAt < cutoff) {
          stalePostCount += 1;
          requestedPosts.push(post);
          continue;
        }
        const isPopularRecheckCandidate =
          post.isPopularRecheckCandidate === true &&
          post.popularRank != null &&
          post.popularRank >= 1 &&
          post.popularRank <= popularLimitConfig.limit;
        if (isPopularRecheckCandidate && cached.keywordAnalyzedAt < popularCutoff) {
          popularRecheckPostCount += 1;
          popularRecheckPosts.push(post);
          requestedPosts.push(post);
          continue;
        }
        if (cached.keywordAnalyzedAt >= cutoff) {
          skippedPosts.push(post);
          continue;
        }
      }

      postPageMeta = {
        requestedPosts,
        skippedFreshPostCount: skippedPosts.length,
        stalePostCount,
        newPostCount,
        popularRecheckPostCount,
        keywordAnalyzedAtCutoff: cutoff,
        popularRecheckCutoff: popularCutoff,
        popularRecheckLimit: popularLimitConfig.limit,
        popularRecheckCooldownHours: popularCooldownConfig.hours,
        samplePopularRecheckTitles: popularRecheckPosts.slice(0, 10).map((post) => post.title),
        sampleSkippedPostTitles: skippedPosts.slice(0, 10).map((post) => post.title),
        validKeywordCountBefore,
      };

      if (requestedPosts.length === 0) {
        console.log("[blog-post-page-auto-keyword-refresh]", {
          blogId,
          currentPage: Number.isFinite(Number(body.page)) ? Number(body.page) : null,
          displayedPostCount: sourcePosts.length,
          candidatePostCount: 0,
          skippedFreshPostCount: skippedPosts.length,
          stalePostCount,
          newPostCount,
          popularRecheckPostCount,
          popularRecheckLimit: popularLimitConfig.limit,
          popularRecheckCooldownHours: popularCooldownConfig.hours,
          requestedPostCount: 0,
          refreshedPostCount: 0,
          keywordAnalyzedAtCutoff: cutoff.toISOString(),
          popularRecheckCutoff: popularCutoff.toISOString(),
          searchAdAttemptedCount: 0,
          searchAd429Stopped: false,
          validKeywordCountBefore,
          validKeywordCountAfter: validKeywordCountBefore,
          sampleRequestedPostTitles: [],
          samplePopularRecheckTitles: [],
          sampleSkippedPostTitles: skippedPosts.slice(0, 10).map((post) => post.title),
          staleDays: staleConfig.days,
          staleSource: staleConfig.source,
          popularRecheckLimitSource: popularLimitConfig.source,
          popularRecheckCooldownSource: popularCooldownConfig.source,
          skippedReason: "fresh_within_stale_window",
        });
        return NextResponse.json({
          ok: true,
          blogId,
          validKeywords: [],
          validKeywordCount: validKeywordCountBefore,
          refreshMs: 0,
          skipped: true,
          debug: {
            candidateKeywordCount: 0,
            confirmedVolumeKeywordCount: 0,
            displayedPostCount: sourcePosts.length,
            candidatePostCount: 0,
            searchAdAttemptedCount: 0,
            searchAd429Stopped: false,
            skippedFreshPostCount: skippedPosts.length,
            stalePostCount,
            newPostCount,
            popularRecheckPostCount,
            popularRecheckLimit: popularLimitConfig.limit,
            popularRecheckCooldownHours: popularCooldownConfig.hours,
            requestedPostCount: 0,
            refreshedPostCount: 0,
            sampleRequestedPostTitles: [],
            samplePopularRecheckTitles: [],
            sampleSkippedPostTitles: skippedPosts.slice(0, 10).map((post) => post.title),
            keywordAnalyzedAtCutoff: cutoff.toISOString(),
            popularRecheckCutoff: popularCutoff.toISOString(),
          },
        });
      }

      sourcePosts.splice(0, sourcePosts.length, ...requestedPosts);
    }

    const result = await refreshBlogKeywords({
      blogId,
      source: mode === "post-page" ? "post-page" : "manual",
      forceKeywordRefreshDevOnly,
      mode,
      sourcePosts,
      page: Number.isFinite(Number(body.page)) ? Number(body.page) : null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 }
      );
    }

    if (mode === "post-page" && postPageMeta) {
      const now = new Date();
      await Promise.allSettled(
        postPageMeta.requestedPosts.map((post) => {
          const identity = buildBlogPostMetricIdentity(post);
          return prisma.blogPostMetricSnapshot.upsert({
            where: {
              blogId_postKey: {
                blogId,
                postKey: identity.postKey,
              },
            },
            create: {
              blogId,
              postKey: identity.postKey,
              postUrl: post.url,
              orgUrl: post.orgUrl ?? post.url,
              logNo: identity.logNo,
              title: post.title || "-",
              publishedAt: publishedAtDate(post),
              keywordAnalyzedAt: now,
            },
            update: {
              postUrl: post.url,
              orgUrl: post.orgUrl ?? post.url,
              logNo: identity.logNo,
              title: post.title || "-",
              publishedAt: publishedAtDate(post),
              keywordAnalyzedAt: now,
            },
          });
        })
      );

      console.log("[blog-post-page-auto-keyword-refresh]", {
        blogId,
        currentPage: Number.isFinite(Number(body.page)) ? Number(body.page) : null,
        displayedPostCount: sourcePosts.length + postPageMeta.skippedFreshPostCount,
        candidatePostCount: sourcePosts.length,
        skippedFreshPostCount: postPageMeta.skippedFreshPostCount,
        stalePostCount: postPageMeta.stalePostCount,
        newPostCount: postPageMeta.newPostCount,
        popularRecheckPostCount: postPageMeta.popularRecheckPostCount,
        popularRecheckLimit: postPageMeta.popularRecheckLimit,
        popularRecheckCooldownHours: postPageMeta.popularRecheckCooldownHours,
        requestedPostCount: postPageMeta.requestedPosts.length,
        refreshedPostCount: postPageMeta.requestedPosts.length,
        keywordAnalyzedAtCutoff: postPageMeta.keywordAnalyzedAtCutoff.toISOString(),
        popularRecheckCutoff: postPageMeta.popularRecheckCutoff.toISOString(),
        searchAdAttemptedCount: result.debug.searchAdAttemptedCount ?? null,
        searchAd429Stopped: result.debug.searchAd429Stopped ?? null,
        validKeywordCountBefore: postPageMeta.validKeywordCountBefore,
        validKeywordCountAfter: result.validKeywordCount,
        sampleRequestedPostTitles: postPageMeta.requestedPosts.slice(0, 10).map((post) => post.title),
        samplePopularRecheckTitles: postPageMeta.samplePopularRecheckTitles,
        sampleSkippedPostTitles: postPageMeta.sampleSkippedPostTitles,
      });
    }

    const postPageDebug =
      mode === "post-page" && postPageMeta
        ? {
            displayedPostCount: sourcePosts.length + postPageMeta.skippedFreshPostCount,
            candidatePostCount: sourcePosts.length,
            skippedFreshPostCount: postPageMeta.skippedFreshPostCount,
            stalePostCount: postPageMeta.stalePostCount,
            newPostCount: postPageMeta.newPostCount,
            popularRecheckPostCount: postPageMeta.popularRecheckPostCount,
            popularRecheckLimit: postPageMeta.popularRecheckLimit,
            popularRecheckCooldownHours: postPageMeta.popularRecheckCooldownHours,
            requestedPostCount: postPageMeta.requestedPosts.length,
            refreshedPostCount: postPageMeta.requestedPosts.length,
            sampleRequestedPostTitles: postPageMeta.requestedPosts.slice(0, 10).map((post) => post.title),
            samplePopularRecheckTitles: postPageMeta.samplePopularRecheckTitles,
            sampleSkippedPostTitles: postPageMeta.sampleSkippedPostTitles,
            keywordAnalyzedAtCutoff: postPageMeta.keywordAnalyzedAtCutoff.toISOString(),
            popularRecheckCutoff: postPageMeta.popularRecheckCutoff.toISOString(),
          }
        : null;

    return NextResponse.json({
      ok: true,
      blogId: result.blogId,
      validKeywords: result.validKeywords,
      validKeywordCount: result.validKeywordCount,
      refreshMs: result.refreshMs,
      debug: {
        ...result.debug,
        ...(postPageDebug ?? {}),
      },
    });
  } catch (e) {
    console.error("[blog-analysis keyword-refresh]", e);
    return NextResponse.json({ ok: false, error: "유효 키워드 갱신에 실패했습니다." }, { status: 500 });
  }
}
