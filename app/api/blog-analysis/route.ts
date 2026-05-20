import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import type {
  BlogAnalysisRecentPost,
  BlogAnalysisResult,
  BlogVisitorChartPoint,
} from "@/lib/blog-analysis-types";
import {
  deleteBlogKeywordExposureSnapshotsNotInKeywordList,
  upsertDirtyBlogKeywordExposureSnapshots,
} from "@/lib/blog-keyword-exposure-db";
import { computeBlogKeywordInsights } from "@/lib/blog-keyword-insight";
import { isBlogtalkValidKeyword } from "@/lib/blog-keyword-blogtalk";
import { prismaExposureSnapshotToBlogKeyword } from "@/lib/map-blog-keyword-snapshot";
import { buildExposureValidKeywords, compareBlogtalkValidKeywordSort, dedupeValidKeywordsForDisplay, normalizeKeywordKey } from "@/lib/blog-valid-keywords";
import { computeRepresentativeValidKeywords } from "@/lib/blog-representative-keywords";
import { computeBlogScore } from "@/lib/blog-score";
import { inferBlogTopic } from "@/lib/blog-topic";
import { prisma } from "@/lib/prisma";
import type { BlogKeywordExposureSnapshot } from "@prisma/client";
import { analyzeBlogPostPatterns } from "@/lib/blog-post-pattern";
import { withBlogPostMetricIdentity } from "@/lib/blog-post-metric-cache";
import { computeBlogTopicAverageComparison } from "@/lib/blog-topic-average";
import {
  BLOG_RECENT_POSTS_INITIAL_DISPLAY_LIMIT,
  BLOG_RECENT_POSTS_INITIAL_METRIC_FETCH_LIMIT,
  BLOG_RECENT_POSTS_INITIAL_TITLE_LIST_PAGES,
  BLOG_RECENT_POSTS_TITLE_LIST_PAGE_SIZE,
} from "@/lib/blog-recent-posts-config";
import { mergeRecentPostsWithMetricCache } from "@/lib/merge-recent-posts-with-metric-cache";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  computePostingFrequency7d,
  extractBlogId,
  fetchBlogPostTitleListPostsWithDiagnostics,
  parseBlogRssItems,
} from "@/lib/scraper";

const fetchHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const KEYWORD_REVALIDATE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** 기본 `/api/blog-analysis`는 대량 키워드 작업을 건너뜁니다. 무거운 작업은 `/api/blog-analysis/keyword-refresh` 로 분리합니다. */
const SKIP_HEAVY_KEYWORD_INGEST = true;
const FAST_KEYWORD_NEW_RANK_LIMIT = 25;
const FAST_KEYWORD_VOLUME_LIMIT = 8;
const FAST_KEYWORD_CANDIDATE_LIMIT = 90;
const FAST_RSS_KEYWORD_PARSE_LIMIT = 48;
const FAST_RECENT_POST_TITLE_LIST_PAGES = BLOG_RECENT_POSTS_INITIAL_TITLE_LIST_PAGES;
const FAST_RECENT_POST_TITLE_LIST_PAGE_SIZE = BLOG_RECENT_POSTS_TITLE_LIST_PAGE_SIZE;
const RECENT_POST_DISPLAY_LIMIT = BLOG_RECENT_POSTS_INITIAL_DISPLAY_LIMIT;
const RECENT_POST_METRIC_FETCH_LIMIT = BLOG_RECENT_POSTS_INITIAL_METRIC_FETCH_LIMIT;

const NAVER_OFFICIAL_BLOG_TOPICS = [
  "일상·생각",
  "비즈니스·경제",
  "맛집",
  "건강·의학",
  "패션·미용",
  "상품리뷰",
  "교육·학문",
  "여행",
  "육아·결혼",
  "반려동물",
  "IT·컴퓨터",
  "자동차",
  "스포츠",
  "공연·전시",
  "문학·책",
  "영화",
  "음악",
  "게임",
  "요리·레시피",
  "인테리어·DIY",
  "원예·재배",
  "사진",
  "세계여행",
  "국내여행",
  "미술·디자인",
  "좋은글·이미지",
  "방송",
  "스타·연예인",
  "만화·애니",
  "사회·정치",
  "어학·외국어",
  "취미",
  "공예",
  "문화·예술",
  "시사·인문·경제",
] as const;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&middot;/g, "·")
    .replace(/&#183;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeOfficialTopicCandidate(value: string): string | null {
  const normalized = decodeHtmlEntities(value)
    .replace(/\\u002F/g, "/")
    .replace(/ㆍ/g, "·")
    .replace(/[|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const topic of NAVER_OFFICIAL_BLOG_TOPICS) {
    if (normalized === topic || normalized.includes(topic)) return topic;
  }
  return null;
}

function parseOfficialBlogTopicFromHtml(html: string): string | null {
  const patterns = [
    /<span[^>]*class=["'][^"']*subject[^"']*["'][^>]*>([\s\S]{0,80}?)<\/span>/i,
    /"subject"\s*:\s*"([^"]+)"/i,
    /"blogDirectoryName"\s*:\s*"([^"]+)"/i,
    /"directoryName"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const topic = normalizeOfficialTopicCandidate(match[1].replace(/<[^>]*>/g, ""));
    if (topic) return topic;
  }
  return null;
}

function parsePostCountFromHtml(html: string): number | null {
  const patterns = [
    /"blogContentsCount"[\s\S]{0,2000}?"postCount"\s*:\s*"?([\d,]+)"?/,
    /<strong>\s*전체보기\s*<\/strong>[\s\S]{0,80}?([\d,]+)\s*개의\s*글/i,
    /([\d,]+)\s*개의\s*글/i,
    /"totalPostCount":\s*(\d+)/,
    /"total_post_count":\s*(\d+)/i,
    /totalPostCount["']?\s*:\s*(\d+)/,
    /"(?:postCount|logCount|totalLogCount|articleCount|postingCount)"\s*:\s*"?([\d,]+)"?/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return parseInt(m[1].replace(/,/g, ""), 10);
  }

  if (/"postList"\s*:\s*\[/.test(html) || /"countPerPage"\s*:/.test(html)) {
    const m = html.match(/"totalCount"\s*:\s*"?([\d,]+)"?/i);
    if (m) return parseInt(m[1].replace(/,/g, ""), 10);
  }
  return null;
}

function parseScrapCountFromHtml(html: string): number | null {
  const patterns = [
    /글\s*스크랩[\s\S]{0,120}?<em[^>]*>\s*([\d,]+)\s*<\/em>/i,
    /class=["'][^"']*_viewScrap[^"']*["'][\s\S]*?<em[^>]*>([\d,]+)<\/em>/i,
    /"totalScrapCount"\s*:\s*"?([\d,]+)"?/i,
    /"scrapCount"\s*:\s*"?([\d,]+)"?/i,
    /"scrapCnt"\s*:\s*"?([\d,]+)"?/i,
    /"scrap_count"\s*:\s*"?([\d,]+)"?/i,
    /"sharedCount"\s*:\s*"?([\d,]+)"?/i,
    /"bookmarkCount"\s*:\s*"?([\d,]+)"?/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return parseInt(m[1].replace(/,/g, ""), 10);
  }
  return null;
}

function parseSelectCategoryNoFromHtml(html: string): string | null {
  const patterns = [
    /var\s+selectCategoryNo\s*=\s*["']([^"']*)["']/,
    /selectCategoryNo["']?\s*[:=]\s*["']?(\d+)["']?/i,
    /categoryNo["']?\s*[:=]\s*["']?(\d+)["']?/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1] !== undefined) return match[1];
  }
  return null;
}

function buildWidgetListAsyncUrl(blogId: string, selectCategoryNo: string): string {
  const params = new URLSearchParams({
    blogId,
    listNumVisitor: "5",
    isVisitorOpen: "false",
    isBuddyOpen: "false",
    selectCategoryNo,
    skinId: "0",
    skinType: "C",
    isCategoryOpen: "true",
    isEnglish: "false",
    listNumComment: "5",
    areaCode: "11B20203",
    weatherType: "0",
    currencySign: "ALL",
    enableWidgetKeys: "profile,stat,rss,search,buddyconnect,currency,visitorgp,title,menu,content,gnb,externalwidget",
    writingMaterialListType: "1",
    callType: "",
  });
  return `https://blog.naver.com/prologue/WidgetListAsync.naver?${params.toString()}`;
}

function parseSubscriberCountFromHtml(html: string): number | null {
  const m = html.match(/"subscriberCount":\s*(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function parseCountLike(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

function parseTotalVisitorFromHtml(html: string): number | null {
  const patterns = [
    /"totalVisitorCount"\s*:\s*"?([\d,]+)"?/i,
    /"totalVisitCount"\s*:\s*"?([\d,]+)"?/i,
    /"cumulativeVisitCount"\s*:\s*"?([\d,]+)"?/i,
    /"cumulativeVisitors"\s*:\s*"?([\d,]+)"?/i,
    /"visitorTotal"\s*:\s*"?([\d,]+)"?/i,
    /"totalVisits"\s*:\s*"?([\d,]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const count = parseCountLike(match?.[1]);
    if (count !== null) return count;
  }
  return null;
}

type NaverMobileBlogInfo = {
  dayVisitorCount: number | null;
  totalVisitorCount: number | null;
  subscriberCount: number | null;
  blogDirectoryName: string | null;
  rawPreview: {
    dayVisitorCount?: unknown;
    totalVisitorCount?: unknown;
    subscriberCount?: unknown;
    blogDirectoryName?: unknown;
  };
};

async function fetchNaverMobileBlogInfo(blogId: string): Promise<NaverMobileBlogInfo | null> {
  try {
    const res = await fetch(`https://m.blog.naver.com/api/blogs/${encodeURIComponent(blogId)}`, {
      headers: {
        ...fetchHeaders,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Referer: `https://m.blog.naver.com/${blogId}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { result?: Record<string, unknown> } | Record<string, unknown>;
    const result = ("result" in json && json.result ? json.result : json) as Record<string, unknown>;
    const totalVisitorCount =
      parseCountLike(result.totalVisitorCount) ??
      parseCountLike(result.totalVisitCount) ??
      parseCountLike(result.cumulativeVisitCount) ??
      parseCountLike(result.cumulativeVisitors) ??
      parseCountLike(result.visitorTotal) ??
      parseCountLike(result.totalVisits);

    return {
      dayVisitorCount: parseCountLike(result.dayVisitorCount),
      totalVisitorCount,
      subscriberCount: parseCountLike(result.subscriberCount),
      blogDirectoryName: typeof result.blogDirectoryName === "string" ? result.blogDirectoryName : null,
      rawPreview: {
        dayVisitorCount: result.dayVisitorCount,
        totalVisitorCount: result.totalVisitorCount,
        subscriberCount: result.subscriberCount,
        blogDirectoryName: result.blogDirectoryName,
      },
    };
  } catch (e) {
    console.warn("[blog-analysis] 네이버 모바일 블로그 정보 수집 실패:", e);
    return null;
  }
}

function sanitizeStoredInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function sanitizeStoredFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function averageRecentPostNumber(
  posts: BlogAnalysisResult["recentPosts"],
  field: "wordCount" | "imageCount" | "videoCount" | "commentCount" | "sympathyCount" | "shareCount"
): number | null {
  const values = (posts ?? [])
    .map((post) => post[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeRecentActivityScore(postingFrequency: number | null | undefined): number | null {
  const frequency = sanitizeStoredFloat(postingFrequency);
  if (frequency === null) return null;
  return Math.min(100, Math.max(0, frequency * 100));
}

function recentPostSortTime(post: BlogAnalysisRecentPost): number {
  const raw = post.publishedAt ?? post.createdAt ?? null;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeRecentPostSources(input: {
  titleListPosts: BlogAnalysisRecentPost[];
  rssPosts: BlogAnalysisRecentPost[];
  metricPosts: BlogAnalysisRecentPost[];
}): BlogAnalysisRecentPost[] {
  const seen = new Set<string>();
  const merged: BlogAnalysisRecentPost[] = [];

  const add = (post: BlogAnalysisRecentPost) => {
    const withIdentity = withBlogPostMetricIdentity(post);
    const key = withIdentity.postKey || withIdentity.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(withIdentity);
  };

  for (const post of input.titleListPosts) add(post);
  for (const post of input.rssPosts) add(post);
  for (const post of input.metricPosts) add(post);

  return merged
    .sort((a, b) => recentPostSortTime(b) - recentPostSortTime(a))
    .slice(0, RECENT_POST_DISPLAY_LIMIT);
}

function visitorDateFromNaverId(rawDate: string): { date: string; label: string } | null {
  const digits = rawDate.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return {
    date: `${year}-${month}-${day}`,
    label: `${month}.${day}`,
  };
}

function parseVisitorGraphXml(xml: string): BlogVisitorChartPoint[] {
  const matches = [...xml.matchAll(/<visitorcnt\s+id="([^"]+)"\s+cnt="([^"]+)"\s*\/>/g)];
  return matches.flatMap((match) => {
    const date = visitorDateFromNaverId(match[1]);
    const visitorCount = parseCountLike(match[2]);
    if (!date || visitorCount === null) return [];
    return [{
      ...date,
      rawDate: match[1],
      visitorCount,
      source: "naver",
    }];
  });
}

async function fetchVisitorGraphData(blogId: string): Promise<{
  latestVisitor: number | null;
  chartData: BlogVisitorChartPoint[];
  rawPreview: string | null;
}> {
  try {
    const res = await fetch(
      `https://blog.naver.com/NVisitorgp4Ajax.naver?blogId=${encodeURIComponent(blogId)}`,
      {
        headers: {
          ...fetchHeaders,
          Accept: "*/*",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: `https://blog.naver.com/${blogId}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return { latestVisitor: null, chartData: [], rawPreview: null };
    const xml = await res.text();
    const chartData = parseVisitorGraphXml(xml);
    const latest = chartData.length ? chartData[chartData.length - 1] : null;
    return {
      latestVisitor: latest?.visitorCount ?? null,
      chartData,
      rawPreview: xml.slice(0, 500),
    };
  } catch {
    return { latestVisitor: null, chartData: [], rawPreview: null };
  }
}

async function fetchText(url: string, extraHeaders?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { ...fetchHeaders, ...extraHeaders },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const requestStartedAt = Date.now();
  const perf = {
    totalMs: 0,
    profileMs: 0,
    visitorMs: 0,
    patternMs: 0,
    cachedKeywordMs: 0,
    newRankCheckMs: 0,
    volumeBackfillMs: 0,
    usedCachedKeywordCount: 0,
    newRankCheckLimit: FAST_KEYWORD_NEW_RANK_LIMIT,
    volumeBackfillLimit: FAST_KEYWORD_VOLUME_LIMIT,
    skippedHeavyKeywordRefresh: SKIP_HEAVY_KEYWORD_INGEST,
  };

  try {
    const body = (await request.json()) as {
      blogUrl?: unknown;
      /** 개발 전용: 캐시가 신선해도 keywordRefreshNeeded 를 강제로 true */
      forceKeywordRefresh?: unknown;
    };
    const blogUrl = body.blogUrl;
    const forceKeywordRefreshDevOnly =
      process.env.NODE_ENV === "development" && Boolean(body.forceKeywordRefresh);
    const blogId = extractBlogId(String(blogUrl || ""));

    if (!blogId) {
      return NextResponse.json({ error: "올바른 네이버 블로그 아이디 또는 주소를 입력해주세요." }, { status: 400 });
    }

    const tProfile = Date.now();
    const mHtml =
      (await fetchText(`https://m.blog.naver.com/${blogId}`, {
        Referer: `https://blog.naver.com/${blogId}`,
      })) ?? "";
    perf.profileMs = Date.now() - tProfile;

    let nickname = blogId;
    const nicknameMatch =
      mHtml.match(/"blogName":"([^"]+)"/) || mHtml.match(/<meta property="og:title" content="([^"]+)"/);
    if (nicknameMatch) {
      nickname = nicknameMatch[1].replace(" : 네이버 블로그", "").replace(" 네이버 블로그", "").trim();
    }

    let subscriberCount = mHtml ? parseSubscriberCountFromHtml(mHtml) : null;
    let postCount = mHtml ? parsePostCountFromHtml(mHtml) : null;
    let scrapCount = mHtml ? parseScrapCountFromHtml(mHtml) : null;
    const selectCategoryNo = parseSelectCategoryNoFromHtml(mHtml) ?? "45";

    let visitorFetchMs = 0;
    const visitorGraphPromise = (async () => {
      const tv = Date.now();
      const r = await fetchVisitorGraphData(blogId);
      visitorFetchMs = Date.now() - tv;
      return r;
    })();

    const rssKeywordParseLimit = SKIP_HEAVY_KEYWORD_INGEST ? FAST_RSS_KEYWORD_PARSE_LIMIT : 120;

    const [
      visitorGraph,
      mobileBlogInfo,
      pcHtml,
      postTitleListHtml,
      widgetListHtml,
      prologueListHtml,
      rssBundle,
      titleListBundle,
    ] = await Promise.all([
      visitorGraphPromise,
      fetchNaverMobileBlogInfo(blogId),
      fetchText(`https://blog.naver.com/${blogId}`, {
        Referer: `https://blog.naver.com/`,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      }),
      fetchText(
        `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&viewdate=&currentPage=1&categoryNo=0&parentCategoryNo=0&countPerPage=5`,
        {
          Referer: `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}`,
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        }
      ),
      fetchText(
        buildWidgetListAsyncUrl(blogId, selectCategoryNo),
        {
          Referer: `https://blog.naver.com/${blogId}`,
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        }
      ),
      fetchText(`https://blog.naver.com/prologue/PrologueList.naver?blogId=${encodeURIComponent(blogId)}`, {
        Referer: `https://blog.naver.com/${blogId}`,
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      }),
      (async (): Promise<{ ui: BlogAnalysisRecentPost[]; keywords: BlogAnalysisRecentPost[] }> => {
        try {
          const rssResponse = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
            headers: {
              ...fetchHeaders,
              Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
              Referer: `https://blog.naver.com/${blogId}`,
            },
            cache: "no-store",
          });
          if (!rssResponse.ok) return { ui: [], keywords: [] };
          const rssText = await rssResponse.text();
          return {
            ui: parseBlogRssItems(rssText, 28),
            keywords: parseBlogRssItems(rssText, rssKeywordParseLimit),
          };
        } catch {
          return { ui: [], keywords: [] };
        }
      })(),
      fetchBlogPostTitleListPostsWithDiagnostics(
        blogId,
        SKIP_HEAVY_KEYWORD_INGEST
          ? {
              maxPages: FAST_RECENT_POST_TITLE_LIST_PAGES,
              countPerPage: FAST_RECENT_POST_TITLE_LIST_PAGE_SIZE,
            }
          : { maxPages: 15, countPerPage: 30 }
      ),
    ]);

    const titleListPostsForKeywords = titleListBundle.posts;
    const titleListDiagnostics = titleListBundle.diagnostics;

    perf.visitorMs = visitorFetchMs;
    if (subscriberCount === null) {
      subscriberCount = mobileBlogInfo?.subscriberCount ?? null;
    }

    const htmlTotalVisitor =
      parseTotalVisitorFromHtml(mHtml) ?? (pcHtml ? parseTotalVisitorFromHtml(pcHtml) : null);
    const totalVisitCount = mobileBlogInfo?.totalVisitorCount ?? htmlTotalVisitor;
    const totalVisitor = totalVisitCount ?? 0;
    const visitorChartData = visitorGraph.chartData;
    const dailyVisitor = visitorGraph.latestVisitor ?? mobileBlogInfo?.dayVisitorCount ?? null;

    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis] visitor source", {
        blogId,
        naverMobileBlogInfo: mobileBlogInfo?.rawPreview ?? null,
        naverVisitorGraphRawPreview: visitorGraph.rawPreview,
        naverVisitorGraphData: visitorChartData,
        parsedDailyVisitCount: dailyVisitor,
        parsedAverageVisitCount: null,
        parsedTotalVisitCount: totalVisitCount,
        htmlTotalVisitCount: htmlTotalVisitor,
      });
    }

    if (postTitleListHtml) {
      postCount = parsePostCountFromHtml(postTitleListHtml) ?? postCount;
      scrapCount = parseScrapCountFromHtml(postTitleListHtml) ?? scrapCount;
    }

    if (widgetListHtml) {
      scrapCount = parseScrapCountFromHtml(widgetListHtml) ?? scrapCount;
      if (process.env.NODE_ENV === "development") {
        console.log("[blog-analysis] widget scrap response", {
          blogId,
          hasScrapText: widgetListHtml.includes("글 스크랩"),
          hasViewScrap: widgetListHtml.includes("_viewScrap"),
          scrapCount,
          preview: widgetListHtml.slice(0, 500),
        });
      }
    }

    if (postCount === null && pcHtml) {
      postCount = parsePostCountFromHtml(pcHtml);
    }
    if (scrapCount === null && pcHtml) {
      scrapCount = parseScrapCountFromHtml(pcHtml);
    }

    let metricSnapshotRecentPosts: BlogAnalysisRecentPost[] = [];
    try {
      const metricRows = await prisma.blogPostMetricSnapshot.findMany({
        where: { blogId },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
        take: RECENT_POST_DISPLAY_LIMIT,
        select: {
          title: true,
          postUrl: true,
          orgUrl: true,
          logNo: true,
          publishedAt: true,
          thumbnail: true,
          wordCount: true,
          imageCount: true,
          videoCount: true,
          commentCount: true,
          sympathyCount: true,
          shareCount: true,
          potentialScore: true,
          reactivityScore: true,
          relatednessScore: true,
          postLevel: true,
          exposureStatus: true,
          foundOnSearch: true,
          keywordAnalyzedAt: true,
        },
      });
      metricSnapshotRecentPosts = metricRows.map((row) =>
        withBlogPostMetricIdentity({
          title: row.title || "-",
          url: row.postUrl,
          orgUrl: row.orgUrl ?? row.postUrl,
          logNo: row.logNo,
          publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          createdAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          thumbnail: row.thumbnail,
          wordCount: row.wordCount,
          imageCount: row.imageCount,
          videoCount: row.videoCount,
          commentCount: row.commentCount,
          sympathyCount: row.sympathyCount,
          shareCount: row.shareCount,
          potentialScore: row.potentialScore,
          reactivityScore: row.reactivityScore,
          relatednessScore: row.relatednessScore,
          postLevel: row.postLevel,
          exposureStatus: row.exposureStatus,
          foundOnSearch: row.foundOnSearch,
          keywordAnalyzedAt: row.keywordAnalyzedAt ? row.keywordAnalyzedAt.toISOString() : null,
        })
      );
    } catch (e) {
      console.warn("[blog-analysis] 최근 포스팅 메트릭 스냅샷 조회 실패:", e);
    }

    const recentPostSources = mergeRecentPostSources({
      titleListPosts: titleListPostsForKeywords,
      rssPosts: rssBundle.ui,
      metricPosts: metricSnapshotRecentPosts,
    });
    const recentPosts = await mergeRecentPostsWithMetricCache(blogId, recentPostSources, {
      metricFetchLimit: RECENT_POST_METRIC_FETCH_LIMIT,
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis recent-posts]", {
        blogId,
        rssRecentCount: rssBundle.ui.length,
        titleListRecentCount: titleListPostsForKeywords.length,
        metricSnapshotRecentCount: metricSnapshotRecentPosts.length,
        mergedRecentPostCount: recentPosts.length,
        sampleRecentPostTitles: recentPosts.slice(0, 12).map((post) => post.title),
        newestPublishedAt: recentPosts[0]?.publishedAt ?? recentPosts[0]?.createdAt ?? null,
        oldestDisplayedPublishedAt:
          recentPosts[recentPosts.length - 1]?.publishedAt ??
          recentPosts[recentPosts.length - 1]?.createdAt ??
          null,
      });
    }

    const postingFrequency = computePostingFrequency7d(recentPosts);

    let patternAnalysis: BlogAnalysisResult["patternAnalysis"] = null;
    // 방문자/최근글/기본 정보는 요청 시점에 실시간으로 수집합니다.
    // 전체 순위·주제 순위·유효키워드 히스토리는 내부 DB 스냅샷 기준이며,
    // 추후 1~2주 단위 batch job으로 주기적 재계산하는 구조로 확장할 예정입니다.
    const tPattern = Date.now();
    try {
      patternAnalysis = await analyzeBlogPostPatterns(recentPosts);
      if (process.env.NODE_ENV === "development") {
        console.log("[blog-analysis] pattern api response", {
          blogId,
          analyzedPostCount: recentPosts.slice(0, 5).length,
          postUrls: recentPosts.slice(0, 5).map((post) => post.url),
          averageTitleLength: patternAnalysis?.averageTitleLength ?? null,
          averageContentLength: patternAnalysis?.averageContentLength ?? null,
          averageImageCount: patternAnalysis?.averageImageCount ?? null,
        });
      }
    } catch (e) {
      console.warn("[blog-analysis] 포스팅 패턴 분석 실패:", e);
      patternAnalysis = null;
    }
    perf.patternMs = Date.now() - tPattern;

    let validKeywords: BlogAnalysisResult["validKeywords"] = [];
    let validKeywordCount: number | null = null;
    let allExposureSnapshots: BlogKeywordExposureSnapshot[] = [];

    try {
      const cacheCutoff = new Date(Date.now() - KEYWORD_REVALIDATE_WINDOW_MS);

      const tCachedKw = Date.now();
      allExposureSnapshots = await prisma.blogKeywordExposureSnapshot.findMany({
        where: { blogId },
        orderBy: [{ checkedAt: "desc" }],
        take: 700,
      });

      const preloadSnapshots = allExposureSnapshots.map(prismaExposureSnapshotToBlogKeyword);
      perf.usedCachedKeywordCount = preloadSnapshots.length;
      perf.cachedKeywordMs = Date.now() - tCachedKw;

      if (SKIP_HEAVY_KEYWORD_INGEST) {
        validKeywords = dedupeValidKeywordsForDisplay(
          preloadSnapshots.filter(isBlogtalkValidKeyword).sort(compareBlogtalkValidKeywordSort)
        );
        validKeywordCount = validKeywords.length;
        perf.newRankCheckMs = 0;
        perf.volumeBackfillMs = 0;
      } else {
        const metricSnapshotsForKeywords = await prisma.blogPostMetricSnapshot.findMany({
          where: { blogId },
          orderBy: { publishedAt: "desc" },
          take: 160,
          select: {
            title: true,
            postUrl: true,
            publishedAt: true,
          },
        });

        const historicExposureKeywords = allExposureSnapshots
          .filter((row) => row.checkedAt < cacheCutoff)
          .slice(0, 400)
          .map(prismaExposureSnapshotToBlogKeyword);

        const metricPostsForKeywords: BlogAnalysisRecentPost[] = metricSnapshotsForKeywords.map((row) => ({
          title: row.title || "",
          url: row.postUrl,
          createdAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        }));

        const exposureKeywords = await buildExposureValidKeywords({
          blogId,
          recentPosts,
          postsForKeywordCandidates: [...rssBundle.keywords, ...titleListPostsForKeywords, ...metricPostsForKeywords],
          preloadSnapshots,
          historicExposureKeywords,
          rankRefreshCutoffMs: cacheCutoff.getTime(),
          rankCheckLimit: FAST_KEYWORD_NEW_RANK_LIMIT,
          volumeCheckLimit: FAST_KEYWORD_VOLUME_LIMIT,
          candidateLimit: FAST_KEYWORD_CANDIDATE_LIMIT,
        });
        perf.newRankCheckMs = exposureKeywords.timingsMs.rankCheckMs;
        perf.volumeBackfillMs = exposureKeywords.timingsMs.volumeBackfillMs;
        perf.newRankCheckLimit = FAST_KEYWORD_NEW_RANK_LIMIT;
        perf.volumeBackfillLimit = FAST_KEYWORD_VOLUME_LIMIT;

        validKeywords = exposureKeywords.validKeywords;
        validKeywordCount = exposureKeywords.validKeywordCount;

        await upsertDirtyBlogKeywordExposureSnapshots(
          blogId,
          exposureKeywords.persistableKeywords,
          exposureKeywords.dirtyNormalizedKeywordKeys,
          normalizeKeywordKey
        );

        if (exposureKeywords.persistableKeywords.length > 0) {
          await deleteBlogKeywordExposureSnapshotsNotInKeywordList(blogId, exposureKeywords.persistableKeywords);
        }

        if (process.env.NODE_ENV === "development") {
          console.log(
            "[blog-analysis] exposure valid keyword debug",
            JSON.stringify(exposureKeywords.debug, null, 2)
          );
        }
      }
    } catch (e) {
      console.warn("[blog-analysis] 유효 키워드 수집 실패:", e);
      validKeywords = [];
      validKeywordCount = null;
    }

    const cacheCutoffMsForKeywordRefresh = Date.now() - KEYWORD_REVALIDATE_WINDOW_MS;
    const usedCachedKeywordCountTop = allExposureSnapshots.length;
    let latestKeywordCheckedAtMs = 0;
    for (const row of allExposureSnapshots) {
      const t = row.checkedAt.getTime();
      if (Number.isFinite(t) && t > latestKeywordCheckedAtMs) latestKeywordCheckedAtMs = t;
    }
    const latestKeywordCheckedAtIso =
      latestKeywordCheckedAtMs > 0 ? new Date(latestKeywordCheckedAtMs).toISOString() : null;
    const keywordCacheAgeDaysComputed =
      latestKeywordCheckedAtMs > 0
        ? Math.floor((Date.now() - latestKeywordCheckedAtMs) / 86400000)
        : null;

    const keywordAutoRefreshReasons: string[] = [];
    if (usedCachedKeywordCountTop === 0) keywordAutoRefreshReasons.push("no_keyword_snapshots");
    if (validKeywordCount === null) keywordAutoRefreshReasons.push("keyword_block_failed");
    else if (validKeywordCount === 0) keywordAutoRefreshReasons.push("zero_valid_keywords");
    if (latestKeywordCheckedAtMs === 0 || latestKeywordCheckedAtMs < cacheCutoffMsForKeywordRefresh) {
      keywordAutoRefreshReasons.push("cache_older_than_14d");
    }

    let keywordRefreshNeeded = keywordAutoRefreshReasons.length > 0;
    if (forceKeywordRefreshDevOnly) {
      keywordRefreshNeeded = true;
      keywordAutoRefreshReasons.push("dev_force_keyword_refresh");
    }

    console.log(
      "[blog-analysis keyword-refresh auto-check]",
      JSON.stringify({
        blogId,
        refreshNeeded: keywordRefreshNeeded,
        reason: keywordAutoRefreshReasons.length ? keywordAutoRefreshReasons.join("|") : "none",
        latestKeywordCheckedAt: latestKeywordCheckedAtIso,
        validKeywordCount,
        usedCachedKeywordCount: usedCachedKeywordCountTop,
        devForceKeywordRefresh: forceKeywordRefreshDevOnly,
      })
    );

    let keywordInsights: BlogAnalysisResult["keywordInsights"] = [];
    try {
      keywordInsights = computeBlogKeywordInsights(recentPosts, validKeywords);
    } catch (e) {
      console.warn("[blog-analysis] 키워드 인사이트 계산 실패:", e);
      keywordInsights = [];
    }

    const representativeValidKeywords = computeRepresentativeValidKeywords({
      validKeywords,
      recentPosts,
      keywordInsights,
    });
    const representativeValidKeywordCount =
      validKeywordCount === null ? null : representativeValidKeywords.length;

    let inferredBlogTopic: string | null = null;
    try {
      inferredBlogTopic = inferBlogTopic(recentPosts, validKeywords);
    } catch {
      inferredBlogTopic = null;
    }

    const officialBlogTopic =
      parseOfficialBlogTopicFromHtml(mHtml) ??
      (prologueListHtml ? parseOfficialBlogTopicFromHtml(prologueListHtml) : null) ??
      (widgetListHtml ? parseOfficialBlogTopicFromHtml(widgetListHtml) : null) ??
      (pcHtml ? parseOfficialBlogTopicFromHtml(pcHtml) : null);
    const blogTopic = officialBlogTopic ?? inferredBlogTopic;

    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis] topic source", {
        blogId,
        officialBlogTopic,
        inferredBlogTopic,
        displayBlogTopic: blogTopic,
        source: officialBlogTopic ? "official" : inferredBlogTopic ? "inferred" : "none",
      });
    }

    let profileImageUrl: string | null = null;
    let profileImageBase64: string | null = null;

    const profileImgMatch = mHtml.match(/"profileImage":"([^"]+)"/);
    if (profileImgMatch) {
      profileImageUrl = profileImgMatch[1].replace(/\\u002F/g, "/").replace(/\\/g, "");
    } else {
      const rawImgMatch = mHtml.match(/https?:\/\/blogpfthumb[-.]phinf\.pstatic\.net[^"'\s<>\\]+/i);
      if (rawImgMatch) profileImageUrl = rawImgMatch[0];
    }

    if (
      profileImageUrl &&
      !profileImageUrl.includes("default") &&
      !profileImageUrl.includes("blog.naver.com/profile/img")
    ) {
      try {
        const imgRes = await fetch(profileImageUrl, {
          headers: {
            Referer: `https://blog.naver.com/${blogId}`,
            "User-Agent": fetchHeaders["User-Agent"],
          },
        });
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          profileImageBase64 = `data:${contentType};base64,${buffer.toString("base64")}`;
        }
      } catch (e) {
        console.error("이미지 다운로드 실패:", e);
      }
    }

    const blogScorePayload = computeBlogScore({
      blogId,
      visitorCount: dailyVisitor,
      totalVisitCount,
      visitorChartData,
      postCount,
      postingFrequency,
      subscriberCount,
      recentPosts,
      patternAnalysis,
      validKeywords,
      keywordInsights,
      validKeywordCount,
    });

    let totalRank: number | null = null;
    let topicRank: number | null = null;
    let totalBlogsCount: number | null = null;
    let topicBlogsCount: number | null = null;
    let rankSource: "postlabs" | null = null;

    try {
      const latestRankSnapshot = await prisma.blogRankSnapshot.findFirst({
        where: {
          blogId,
          rankSource: "postlabs",
        },
        select: {
          overallRank: true,
          topicRank: true,
          totalBlogsCount: true,
          topicBlogsCount: true,
          rankSource: true,
        },
        orderBy: { calculatedAt: "desc" },
      });

      if (latestRankSnapshot) {
        totalRank = latestRankSnapshot.overallRank ?? null;
        topicRank = latestRankSnapshot.topicRank ?? null;
        totalBlogsCount = latestRankSnapshot.totalBlogsCount ?? null;
        topicBlogsCount = latestRankSnapshot.topicBlogsCount ?? null;
        rankSource = latestRankSnapshot.rankSource === "postlabs" ? "postlabs" : null;
      }
    } catch (e) {
      console.warn("[blog-analysis] PostLabs 랭킹 스냅샷 조회 실패:", e);
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis] postlabs rank source", {
        blogId,
        postlabsOverallRank: totalRank,
        postlabsTopicRank: topicRank,
        totalBlogsCount,
        topicBlogsCount,
        topicName: officialBlogTopic,
        rankSource: rankSource ?? "postlabs",
        message: rankSource
          ? "PostLabs 자체 랭킹 스냅샷 기준 순위를 표시합니다."
          : "PostLabs 자체 랭킹 스냅샷이 없으면 순위는 표시하지 않습니다.",
      });
    }

    let analyzedAtIso: string | null = null;

    try {
      let sessionUserId: string | null = null;
      try {
        const session = (await getServerSession(authOptions as never)) as {
          user?: { id?: string };
        } | null;
        const uid = session?.user?.id;
        sessionUserId = typeof uid === "string" && uid.trim() ? uid.trim() : null;
      } catch {
        sessionUserId = null;
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[blog-analysis] visitor db save input", {
          blogId,
          dailyVisitCount: dailyVisitor,
          averageVisitCount: null,
          totalVisitCount,
          totalVisitCountStorage: "response-only",
        });
      }

      const historyRow = await prisma.blogAnalysisHistory.create({
        data: {
          userId: sessionUserId,
          blogId,
          blogName: nickname || null,
          nickname: nickname || null,
          profileImage: profileImageBase64 ?? null,
          blogTopic,
          visitorCount: sanitizeStoredInt(dailyVisitor),
          postCount: sanitizeStoredInt(postCount),
          subscriberCount: sanitizeStoredInt(subscriberCount),
          postingFrequency: sanitizeStoredFloat(postingFrequency),
          validKeywordCount: sanitizeStoredInt(validKeywordCount),
          level: sanitizeStoredInt(blogScorePayload.level),
          grade: blogScorePayload.grade,
          totalScore: sanitizeStoredFloat(blogScorePayload.totalScore),
          influenceScore: sanitizeStoredFloat(blogScorePayload.influenceScore),
          keywordInfluenceScore: sanitizeStoredFloat(blogScorePayload.keywordInfluenceScore),
          contentInfluenceScore: sanitizeStoredFloat(blogScorePayload.contentInfluenceScore),
          averageTitleLength: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.averageTitleLength) : null,
          averageContentLength: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.averageContentLength) : null,
          averageImageCount: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.averageImageCount) : null,
          titleLengthScore: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.titleLengthScore) : null,
          contentLengthScore: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.contentLengthScore) : null,
          imageCountScore: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.imageCountScore) : null,
        },
        select: { id: true, analyzedAt: true },
      });

      analyzedAtIso = historyRow.analyzedAt.toISOString();

      try {
        if (process.env.NODE_ENV === "development") {
          console.log("[blog-analysis] visitor db save", {
            blogId,
            dailyVisitCount: dailyVisitor,
            averageVisitCount: null,
            totalVisitCount,
            totalVisitCountStorage: "response-only",
          });
        }

        await prisma.blogProfile.upsert({
          where: { blogId },
          create: {
            blogId,
            blogUrl: `https://blog.naver.com/${blogId}`,
            blogName: nickname || null,
            nickname: nickname || null,
            profileImage: profileImageBase64 ?? null,
            officialBlogTopic: officialBlogTopic ?? null,
            postCount: sanitizeStoredInt(postCount),
            scrapCount: sanitizeStoredInt(scrapCount),
            neighborCount: sanitizeStoredInt(subscriberCount),
            postingFrequency: sanitizeStoredFloat(postingFrequency),
            lastAnalyzedAt: historyRow.analyzedAt,
          },
          update: {
            blogUrl: `https://blog.naver.com/${blogId}`,
            blogName: nickname || null,
            nickname: nickname || null,
            profileImage: profileImageBase64 ?? null,
            officialBlogTopic: officialBlogTopic ?? null,
            postCount: sanitizeStoredInt(postCount),
            scrapCount: sanitizeStoredInt(scrapCount),
            neighborCount: sanitizeStoredInt(subscriberCount),
            postingFrequency: sanitizeStoredFloat(postingFrequency),
            lastAnalyzedAt: historyRow.analyzedAt,
          },
        });

        await prisma.blogMetricSnapshot.create({
          data: {
            blogId,
            influenceScore: sanitizeStoredFloat(blogScorePayload.influenceScore),
            keywordInfluenceScore: sanitizeStoredFloat(blogScorePayload.keywordInfluenceScore),
            contentInfluenceScore: sanitizeStoredFloat(blogScorePayload.contentInfluenceScore),
            validKeywordCount: sanitizeStoredInt(validKeywordCount),
            recentActivityScore: computeRecentActivityScore(postingFrequency),
            avgWordCount: averageRecentPostNumber(recentPosts, "wordCount"),
            avgImageCount: averageRecentPostNumber(recentPosts, "imageCount"),
            avgVideoCount: averageRecentPostNumber(recentPosts, "videoCount"),
            avgCommentCount: averageRecentPostNumber(recentPosts, "commentCount"),
            avgSympathyCount: averageRecentPostNumber(recentPosts, "sympathyCount"),
            avgShareCount: averageRecentPostNumber(recentPosts, "shareCount"),
            totalScore: sanitizeStoredFloat(blogScorePayload.totalScore),
            analyzedAt: historyRow.analyzedAt,
          },
        });
      } catch (e) {
        console.warn("[blog-analysis] PostLabs 랭킹용 프로필/메트릭 저장 실패:", e);
      }

      try {
        const existingSaved = sessionUserId
          ? await prisma.blogAnalysisSaved.findFirst({
              where: { userId: sessionUserId, blogId },
              orderBy: { updatedAt: "desc" },
            })
          : await prisma.blogAnalysisSaved.findFirst({
              where: { blogId },
              orderBy: { updatedAt: "desc" },
            });

        const savedProfile = profileImageBase64 ?? null;
        if (existingSaved) {
          await prisma.blogAnalysisSaved.update({
            where: { id: existingSaved.id },
            data: {
              nickname: nickname || null,
              blogName: nickname || null,
              profileImage: savedProfile,
              blogTopic,
            },
          });
        } else {
          await prisma.blogAnalysisSaved.create({
            data: {
              userId: sessionUserId,
              blogId,
              nickname: nickname || null,
              blogName: nickname || null,
              profileImage: savedProfile,
              blogTopic,
              autoTracking: true,
              isPinned: false,
            },
          });
        }
      } catch (e) {
        console.warn("[blog-analysis] 저장 목록 갱신 실패:", e);
      }

      await prisma.blogAnalysisHistory.update({
        where: { id: historyRow.id },
        data: {
          totalRank,
          topicRank,
        },
      });
    } catch (e) {
      console.warn("[blog-analysis] 히스토리 저장 또는 순위 계산 실패:", e);
    }

    let topicAverageComparison: BlogAnalysisResult["topicAverageComparison"] = null;
    try {
      topicAverageComparison = await computeBlogTopicAverageComparison({
        blogTopic,
        myBlogId: blogId,
        mySnapshot: {
          totalScore: sanitizeStoredFloat(blogScorePayload.totalScore),
          validKeywordCount,
          visitorCount: dailyVisitor,
          postingFrequency: sanitizeStoredFloat(postingFrequency),
          averageTitleLength: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.averageTitleLength) : null,
          averageContentLength: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.averageContentLength) : null,
          averageImageCount: patternAnalysis ? sanitizeStoredFloat(patternAnalysis.averageImageCount) : null,
        },
      });
    } catch (e) {
      console.warn("[blog-analysis] 주제 평균 비교 계산 실패:", e);
      topicAverageComparison = null;
    }

    perf.totalMs = Date.now() - requestStartedAt;
    console.log("[blog-analysis performance]", JSON.stringify(perf));

    const payload: BlogAnalysisResult = {
      nickname,
      blogId,
      visitor: dailyVisitor,
      totalVisitor,
      totalVisitCount,
      visitorChartData,
      subscriberCount,
      postCount,
      scrapCount,
      recentPosts,
      postingFrequency,
      profileImage: profileImageBase64,
      validKeywords,
      representativeValidKeywords,
      keywordInsights,
      validKeywordCount,
      blogTopic,
      totalRank,
      topicRank,
      totalBlogsCount,
      topicBlogsCount,
      rankSource,
      rankSourceLabel: rankSource === "postlabs" ? "PostLabs 기준" : null,
      analyzedAt: analyzedAtIso,
      patternAnalysis,
      topicAverageComparison,
      performance: perf,
      keywordRefreshNeeded,
      keywordCacheAgeDays: keywordCacheAgeDaysComputed,
      latestKeywordCheckedAt: latestKeywordCheckedAtIso,
      usedCachedKeywordCount: usedCachedKeywordCountTop,
      recentPostsPagination: {
        nextTitleListPage: FAST_RECENT_POST_TITLE_LIST_PAGES + 1,
        pageSize: FAST_RECENT_POST_TITLE_LIST_PAGE_SIZE,
        hasMore:
          titleListDiagnostics.titleListAsyncReportedTotalPostCount != null &&
          titleListDiagnostics.titleListAsyncReportedTotalPostCount > 0
            ? titleListDiagnostics.titleListAsyncSuccessPages * FAST_RECENT_POST_TITLE_LIST_PAGE_SIZE <
              titleListDiagnostics.titleListAsyncReportedTotalPostCount
            : titleListPostsForKeywords.length >= FAST_RECENT_POST_TITLE_LIST_PAGE_SIZE,
        totalCount: titleListDiagnostics.titleListAsyncReportedTotalPostCount,
      },
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis] visitor api response", {
        blogId,
        dailyVisitCount: payload.visitor,
        averageVisitCount: null,
        totalVisitCount: payload.totalVisitCount ?? payload.totalVisitor,
        visitorChartData: payload.visitorChartData ?? [],
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("blog-analysis:", error);
    return NextResponse.json({ error: "데이터 수집에 실패했습니다." }, { status: 500 });
  }
}
