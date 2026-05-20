import type { BlogAnalysisRecentPost, BlogValidKeyword } from "@/lib/blog-analysis-types";
import { buildExposureValidKeywords, type BlogValidKeywordDebug } from "@/lib/blog-valid-keywords";
import { prisma } from "@/lib/prisma";
import { prismaExposureSnapshotToBlogKeyword } from "@/lib/map-blog-keyword-snapshot";
import {
  deleteBlogKeywordExposureSnapshotsNotInKeywordList,
  upsertBlogKeywordExposureSnapshotsForKeywords,
} from "@/lib/blog-keyword-exposure-db";
import { withBlogPostMetricIdentity } from "@/lib/blog-post-metric-cache";
import { makePostMatchKey } from "@/lib/naver";
import {
  fetchBlogPostTitleListPostsWithDiagnostics,
  postsFromKeywordExposureSnapshotTitles,
  parseBlogRssItems,
} from "@/lib/scraper";

const fetchHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/** keyword-refresh 전용 — 기본 분석 경로에는 사용하지 않음 */
export const KEYWORD_REFRESH_TITLE_LIST_MAX_PAGES = 23;
export const KEYWORD_REFRESH_TITLE_LIST_COUNT_PER_PAGE = 30;
export const KEYWORD_REFRESH_RSS_WIDE_LIMIT = 200;
export const KEYWORD_REFRESH_METRIC_SNAPSHOT_TAKE = 520;

export const HEAVY_KEYWORD_RANK_LIMIT = 280;
export const HEAVY_KEYWORD_VOLUME_LIMIT = 340;
export const HEAVY_KEYWORD_CANDIDATE_LIMIT = 1400;
/** 순위·통합검색 등 노출 재검사: 스냅샷 stale 초과 후보를 매 실행당 최대 이 개수만 처리 */
export const DEFAULT_STALE_EXPOSURE_RECHECK_LIMIT = 50;

const TITLE_LIST_EXPOSURE_FALLBACK_MIN_POSTS = 350;

export type KeywordRefreshSource = "manual" | "cron" | "post-page";

export type RefreshBlogKeywordsParams = {
  blogId: string;
  /** 개발 환경에서만 의미 있는 수동 강제 플래그 */
  forceKeywordRefreshDevOnly?: boolean;
  source: KeywordRefreshSource;
  strictIncrementalVolumeLookup?: boolean;
  staleExposureRecheckLimit?: number;
  /** 기본 14일 — `rankRefreshCutoffMs` 및 historic 필터에 사용 */
  revalidateWindowMs?: number;
  mode?: "full" | "post-page";
  sourcePosts?: BlogAnalysisRecentPost[];
  page?: number | null;
};

export type RefreshBlogKeywordsSuccess = {
  ok: true;
  blogId: string;
  validKeywords: BlogValidKeyword[];
  validKeywordCount: number;
  persistableKeywords: BlogValidKeyword[];
  refreshMs: number;
  debug: BlogValidKeywordDebug;
};

export type RefreshBlogKeywordsFailure = {
  ok: false;
  blogId: string;
  error: string;
  /** HTTP에 대응할 때만 사용 */
  httpStatus?: number;
};

export type RefreshBlogKeywordsResult = RefreshBlogKeywordsSuccess | RefreshBlogKeywordsFailure;

function dedupePostsByMatchKey(posts: BlogAnalysisRecentPost[]): BlogAnalysisRecentPost[] {
  const seen = new Set<string>();
  const out: BlogAnalysisRecentPost[] = [];
  for (const p of posts) {
    const k = makePostMatchKey(p.url);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * `/api/blog-analysis/keyword-refresh` 및 크론에서 공통 사용하는 유효 키워드 갱신 파이프라인.
 */
export async function refreshBlogKeywords(params: RefreshBlogKeywordsParams): Promise<RefreshBlogKeywordsResult> {
  const {
    blogId,
    forceKeywordRefreshDevOnly = false,
    source,
    strictIncrementalVolumeLookup = true,
    staleExposureRecheckLimit = DEFAULT_STALE_EXPOSURE_RECHECK_LIMIT,
    revalidateWindowMs = 14 * 24 * 60 * 60 * 1000,
    mode = "full",
    sourcePosts = [],
    page = null,
  } = params;

  const started = Date.now();

  if (process.env.NODE_ENV === "development" && forceKeywordRefreshDevOnly) {
    console.log("[blog-analysis keyword-refresh auto-check]", {
      blogId,
      refreshNeeded: true,
      reason: "dev_force_keyword_refresh_api",
      force: true,
      source,
    });
  }

  const cacheCutoff = new Date(Date.now() - revalidateWindowMs);

  const normalizedSourcePosts = dedupePostsByMatchKey(sourcePosts.map(withBlogPostMetricIdentity));
  const isPostPageMode = mode === "post-page" && normalizedSourcePosts.length > 0;

  const [allExposureSnapshots, metricSnapshotsForKeywords] = await Promise.all([
    prisma.blogKeywordExposureSnapshot.findMany({
      where: { blogId },
      orderBy: [{ checkedAt: "desc" }],
      take: 700,
    }),
    prisma.blogPostMetricSnapshot.findMany({
      where: { blogId },
      orderBy: { publishedAt: "desc" },
      take: KEYWORD_REFRESH_METRIC_SNAPSHOT_TAKE,
      select: {
        title: true,
        postUrl: true,
        publishedAt: true,
      },
    }),
  ]);

  let recentPosts: BlogAnalysisRecentPost[] = [];
  let rssWidePosts: BlogAnalysisRecentPost[] = [];
  let titleListAsyncPosts: BlogAnalysisRecentPost[] = [];
  let titleListDiagnostics = null as Awaited<ReturnType<typeof fetchBlogPostTitleListPostsWithDiagnostics>>["diagnostics"] | null;

  if (isPostPageMode) {
    recentPosts = normalizedSourcePosts;
    rssWidePosts = [];
    titleListAsyncPosts = normalizedSourcePosts;
  } else {
    const rssResponse = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
      headers: {
        ...fetchHeaders,
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        Referer: `https://blog.naver.com/${blogId}`,
      },
      cache: "no-store",
    });
    if (!rssResponse.ok) {
      return {
        ok: false,
        blogId,
        error: "RSS를 불러오지 못했습니다.",
        httpStatus: 502,
      };
    }

    const rssText = await rssResponse.text();
    recentPosts = parseBlogRssItems(rssText, 28).map(withBlogPostMetricIdentity);
    rssWidePosts = parseBlogRssItems(rssText, KEYWORD_REFRESH_RSS_WIDE_LIMIT);

    const titleListBundle = await fetchBlogPostTitleListPostsWithDiagnostics(blogId, {
      maxPages: KEYWORD_REFRESH_TITLE_LIST_MAX_PAGES,
      countPerPage: KEYWORD_REFRESH_TITLE_LIST_COUNT_PER_PAGE,
      expandPagesToReportedTotal: true,
    });
    titleListAsyncPosts = titleListBundle.posts;
    titleListDiagnostics = titleListBundle.diagnostics;
  }

  const exposureFallbackPosts = postsFromKeywordExposureSnapshotTitles(allExposureSnapshots);
  const needExposureFallback =
    !isPostPageMode &&
    (titleListDiagnostics?.titleListAsyncFirstError != null ||
      titleListAsyncPosts.length < TITLE_LIST_EXPOSURE_FALLBACK_MIN_POSTS);

  const titleListPostsForKeywords = dedupePostsByMatchKey([
    ...titleListAsyncPosts,
    ...(needExposureFallback ? exposureFallbackPosts : []),
  ]);

  const preloadSnapshots = allExposureSnapshots.map(prismaExposureSnapshotToBlogKeyword);
  const historicExposureKeywords = allExposureSnapshots
    .filter((row) => row.checkedAt < cacheCutoff)
    .slice(0, 400)
    .map(prismaExposureSnapshotToBlogKeyword);

  const metricPostsForKeywords = metricSnapshotsForKeywords.map((row) => ({
    title: row.title || "",
    url: row.postUrl,
    createdAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }));

  const exposureKeywords = await buildExposureValidKeywords({
    blogId,
    recentPosts,
    postsForKeywordCandidates: [...titleListPostsForKeywords, ...rssWidePosts, ...metricPostsForKeywords],
    postPoolSourceBatches: {
      rssRecent: recentPosts,
      rssWide: rssWidePosts,
      titleListAsync: titleListAsyncPosts,
      metricSnapshot: metricPostsForKeywords,
    },
    preloadSnapshots,
    historicExposureKeywords,
    rankRefreshCutoffMs: cacheCutoff.getTime(),
    rankCheckLimit: isPostPageMode ? 40 : HEAVY_KEYWORD_RANK_LIMIT,
    volumeCheckLimit: isPostPageMode ? 24 : HEAVY_KEYWORD_VOLUME_LIMIT,
    candidateLimit: isPostPageMode ? 220 : HEAVY_KEYWORD_CANDIDATE_LIMIT,
    keywordRefreshTitleListDiagnostics: titleListDiagnostics,
    strictIncrementalVolumeLookup,
    staleExposureRecheckLimit,
    integratedSearchCheckLimit: isPostPageMode ? 8 : undefined,
  });

  await upsertBlogKeywordExposureSnapshotsForKeywords(blogId, exposureKeywords.persistableKeywords);
  if (!isPostPageMode) {
    await deleteBlogKeywordExposureSnapshotsNotInKeywordList(blogId, exposureKeywords.persistableKeywords);
  }

  const refreshMs = Date.now() - started;
  const dbg = exposureKeywords.debug;

  console.log(
    "[blog-analysis keyword-refresh performance]",
    JSON.stringify({
      blogId,
      source,
      mode,
      page,
      pagePostCount: isPostPageMode ? normalizedSourcePosts.length : undefined,
      refreshMs,
      titleListAsyncRequestCount: dbg.titleListAsyncRequestCount,
      titleListAsyncSuccessPages: dbg.titleListAsyncSuccessPages,
      titleListAsyncFailedPages: dbg.titleListAsyncFailedPages,
      titleListAsyncTotalParsedPosts: dbg.titleListAsyncTotalParsedPosts,
      titleListAsyncReportedTotalPostCount: dbg.titleListAsyncReportedTotalPostCount,
      titleListAsyncFirstError: dbg.titleListAsyncFirstError,
      titleListAsyncSampleTitles: dbg.titleListAsyncSampleTitles,
      totalPostTitleCount: dbg.totalPostTitleCount,
      rawPostFetchCounts: dbg.rawPostFetchCounts,
      dedupedPostFirstSourceCounts: dbg.dedupedPostFirstSourceCounts,
      historicExposureKeywordSeedRows: dbg.historicExposureKeywordSeedRows,
      exposureSnapshotPreloadRows: dbg.exposureSnapshotPreloadRows,
      candidateSourceCounts: dbg.candidateSourceCounts,
      validKeywordCount: exposureKeywords.validKeywordCount,
      rankCheckedCount: dbg.rankCheckedCount,
      volumeLookupAttemptedCount: dbg.volumeLookupAttemptedCount,
      volumeCacheHitCount: dbg.volumeCacheHitCount,
      volumeCacheMissCount: dbg.volumeCacheMissCount,
      volumeCacheStaleCount: dbg.volumeCacheStaleCount,
      searchAdAttemptedCount: dbg.searchAdAttemptedCount,
      searchAdSuccessCount: dbg.searchAdSuccessCount,
      searchAd429Stopped: dbg.searchAd429Stopped,
      volumeAboveThresholdFromCacheCount: dbg.volumeAboveThresholdFromCacheCount,
      volumeAboveThresholdFromSearchAdCount: dbg.volumeAboveThresholdFromSearchAdCount,
      volumeDeferredDueToBudgetCount: dbg.volumeDeferredDueToBudgetCount,
      volumeCachePrefetchCandidateCount: dbg.volumeCachePrefetchCandidateCount,
      volumeCachePrefetchHitCount: dbg.volumeCachePrefetchHitCount,
      volumeCachePrefetchUnionKeyCount: dbg.volumeCachePrefetchUnionKeyCount,
      volumeCachePrefetchWarmBeforeFindManyCount: dbg.volumeCachePrefetchWarmBeforeFindManyCount,
      volumeCachePrefetchFindManyReturnedCount: dbg.volumeCachePrefetchFindManyReturnedCount,
      volumeCachePrefetchMapEntryCount: dbg.volumeCachePrefetchMapEntryCount,
      volumeCacheSnapshotSyncUpsertCount: dbg.volumeCacheSnapshotSyncUpsertCount,
      volumeCacheSnapshotSyncDuplicateSkipped: dbg.volumeCacheSnapshotSyncDuplicateSkipped,
      strictIncrementalVolumeLookup: dbg.strictIncrementalVolumeLookup,
      confirmedVolumeKeywordCount: dbg.confirmedVolumeKeywordCount,
      remainingVolumeUnknownKeywordCount: dbg.remainingVolumeUnknownKeywordCount,
      ...(dbg.strictIncrementalVolumeLookup
        ? {
            totalCandidateKeywordCount: dbg.volumeLookupPlanTotalEntries,
            confirmedVolumeKeywordCount: dbg.volumeLookupPlanConfirmedVolumeEntries,
            remainingVolumeUnknownKeywordCount: dbg.volumeLookupPlanRemainingUnknownEntries,
            nextVolumeLookupSampleKeywords: dbg.nextVolumeLookupSampleKeywords ?? [],
            volumeCheckLimit: HEAVY_KEYWORD_VOLUME_LIMIT,
          }
        : {}),
      ...(dbg.staleExposureRecheckLimit != null
        ? {
            staleExposureRecheckCandidateCount: dbg.staleExposureRecheckCandidateCount,
            staleExposureRecheckLimit: dbg.staleExposureRecheckLimit,
            staleExposureRecheckedCount: dbg.staleExposureRecheckedCount,
            staleExposureDeferredCount: dbg.staleExposureDeferredCount,
            freshExposureSkippedCount: dbg.freshExposureSkippedCount,
            exposureRankChangedCount: dbg.exposureRankChangedCount,
            sampleExposureRankChangedKeywords: dbg.sampleExposureRankChangedKeywords,
            nextStaleExposureRecheckSampleKeywords: dbg.nextStaleExposureRecheckSampleKeywords,
          }
        : {}),
    })
  );

  if (isPostPageMode) {
    const validCountBefore = preloadSnapshots.filter((row) => row.keywordValidationStatus === "valid").length;
    console.log(
      "[blog-post-page-keyword-refresh]",
      JSON.stringify({
        blogId,
        page,
        pagePostCount: normalizedSourcePosts.length,
        candidateKeywordCount: dbg.candidateKeywordCount,
        confirmedVolumeKeywordCount: dbg.confirmedVolumeKeywordCount,
        validKeywordCountBefore: validCountBefore,
        validKeywordCountAfter: exposureKeywords.validKeywordCount,
        newlyAddedValidKeywordCount: Math.max(0, exposureKeywords.validKeywordCount - validCountBefore),
        searchAdAttemptedCount: dbg.searchAdAttemptedCount,
        searchAd429Stopped: dbg.searchAd429Stopped,
        sampleNewValidKeywords: exposureKeywords.validKeywords
          .filter((row) => !preloadSnapshots.some((prev) => prev.keyword === row.keyword))
          .slice(0, 20)
          .map((row) => row.keyword),
      })
    );
  }

  return {
    ok: true,
    blogId,
    validKeywords: exposureKeywords.validKeywords,
    validKeywordCount: exposureKeywords.validKeywordCount,
    persistableKeywords: exposureKeywords.persistableKeywords,
    refreshMs,
    debug: exposureKeywords.debug,
  };
}

export type CronKeywordRefreshCandidate = {
  blogId: string;
  lastSnapshotCheckedAt: Date | null;
  latestHistoryValidKeywordCount: number | null;
};

/**
 * 히스토리 또는 노출 스냅샷이 있는 블로그 중,
 * 스냅샷이 없거나 오래됐거나 최근 분석에서 validKeywordCount === 0 인 블로그만 반환.
 */
export async function selectBlogsForKeywordCronRefresh(params: {
  staleDays: number;
  maxProcess: number;
}): Promise<{
  /** 조건을 만족하는 전체 후보 수 (배치 컷 없음) */
  candidateBlogCount: number;
  /** 실제 이번 실행에서 처리할 블로그 목록 */
  selected: CronKeywordRefreshCandidate[];
  /** 유니온에 속했으나 아직 갱신 불필요(신선 + validKeywordCount !== 0) */
  skippedFreshCount: number;
  unionBlogCount: number;
}> {
  const { staleDays, maxProcess } = params;
  const cutoff = new Date(Date.now() - staleDays * 86400000);

  const [histDistinct, snapDistinct, snapMaxRows, latestHistRows] = await Promise.all([
    prisma.blogAnalysisHistory.findMany({ distinct: ["blogId"], select: { blogId: true } }),
    prisma.blogKeywordExposureSnapshot.findMany({ distinct: ["blogId"], select: { blogId: true } }),
    prisma.blogKeywordExposureSnapshot.groupBy({
      by: ["blogId"],
      _max: { checkedAt: true },
    }),
    prisma.$queryRaw<Array<{ blogId: string; validKeywordCount: number | null }>>`
      SELECT DISTINCT ON ("blogId") "blogId", "validKeywordCount"
      FROM "BlogAnalysisHistory"
      ORDER BY "blogId", "analyzedAt" DESC
    `,
  ]);

  const unionIds = new Set<string>();
  for (const r of histDistinct) unionIds.add(r.blogId);
  for (const r of snapDistinct) unionIds.add(r.blogId);

  const snapMaxMap = new Map<string, Date>();
  for (const row of snapMaxRows) {
    const d = row._max.checkedAt;
    if (d) snapMaxMap.set(row.blogId, d);
  }

  const histLatestMap = new Map<string, number | null>();
  for (const r of latestHistRows) {
    histLatestMap.set(r.blogId, r.validKeywordCount);
  }

  const candidates: CronKeywordRefreshCandidate[] = [];
  let skippedFreshCount = 0;

  for (const blogId of unionIds) {
    const lastSnapshotCheckedAt = snapMaxMap.get(blogId) ?? null;
    const latestHistoryValidKeywordCount = histLatestMap.has(blogId)
      ? histLatestMap.get(blogId)!
      : null;

    const staleOrMissing =
      lastSnapshotCheckedAt == null || lastSnapshotCheckedAt.getTime() < cutoff.getTime();
    const zeroValidInLatestHistory = latestHistoryValidKeywordCount === 0;

    if (!staleOrMissing && !zeroValidInLatestHistory) {
      skippedFreshCount += 1;
      continue;
    }

    candidates.push({
      blogId,
      lastSnapshotCheckedAt,
      latestHistoryValidKeywordCount,
    });
  }

  candidates.sort((a, b) => {
    const aNo = a.lastSnapshotCheckedAt == null ? 0 : 1;
    const bNo = b.lastSnapshotCheckedAt == null ? 0 : 1;
    if (aNo !== bNo) return aNo - bNo;
    const ta = a.lastSnapshotCheckedAt?.getTime() ?? 0;
    const tb = b.lastSnapshotCheckedAt?.getTime() ?? 0;
    return ta - tb;
  });

  const candidateBlogCount = candidates.length;
  const selected = candidates.slice(0, Math.max(0, maxProcess));

  return {
    candidateBlogCount,
    selected,
    skippedFreshCount,
    unionBlogCount: unionIds.size,
  };
}
