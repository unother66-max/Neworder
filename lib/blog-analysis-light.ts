/**
 * 히스토리·순위 유지용 경량 블로그 스냅샷 (본문/pattern/프로필 이미지 다운로드 없음).
 * 사용자 정밀 분석 POST(/api/blog-analysis)와 분리합니다.
 */

import {
  isTopicRankingEligible,
  pickLatestHistoryPerBlogId,
  rankPlace1Based,
  sortBlogAnalysisSnapshotsForRank,
} from "@/lib/blog-analysis-history-rank";
import { fetchValidBlogKeywordsFromCandidates } from "@/lib/blog-keyword-volume";
import { extractKeywordCandidatesFromTitles } from "@/lib/blog-keywords";
import { computeBlogScore } from "@/lib/blog-score";
import { inferBlogTopic } from "@/lib/blog-topic";
import type { BlogAnalysisRecentPost, BlogValidKeyword } from "@/lib/blog-analysis-types";
import type { PrismaClient } from "@prisma/client";
import { computePostingFrequency7d, parseBlogRssItems } from "@/lib/scraper";

const fetchHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function parsePostCountFromHtml(html: string): number | null {
  const patterns = [
    /"totalPostCount":\s*(\d+)/,
    /"total_post_count":\s*(\d+)/i,
    /totalPostCount["']?\s*:\s*(\d+)/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function parseSubscriberCountFromHtml(html: string): number | null {
  const m = html.match(/"subscriberCount":\s*(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10);
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

async function fetchLatestVisitorCount(blogId: string): Promise<number | null> {
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
    if (!res.ok) return null;
    const xml = await res.text();
    const matches = [...xml.matchAll(/<visitorcnt\s+id="(\d+)"\s+cnt="(\d+)"\s*\/>/g)];
    const latest = matches.length ? matches[matches.length - 1] : null;
    return latest ? Number(latest[2]) : null;
  } catch {
    return null;
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

async function fetchRecentPostsFromRss(blogId: string): Promise<BlogAnalysisRecentPost[]> {
  try {
    const rssResponse = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
      headers: {
        ...fetchHeaders,
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        Referer: `https://blog.naver.com/${blogId}`,
      },
      cache: "no-store",
    });
    if (!rssResponse.ok) return [];
    const rssText = await rssResponse.text();
    return parseBlogRssItems(rssText, 20);
  } catch {
    return [];
  }
}

export type LightBlogCollectResult = {
  nickname: string;
  visitor: number | null;
  postCount: number | null;
  subscriberCount: number | null;
  postingFrequency: number | null;
  recentPosts: BlogAnalysisRecentPost[];
  validKeywordCount: number | null;
  blogTopic: string | null;
  blogScorePayload: ReturnType<typeof computeBlogScore>;
};

/**
 * 네이버 공개 페이지·RSS만 사용 (본문 글 페이지 fetch·pattern 없음).
 */
export async function collectLightBlogAnalysisSnapshot(blogId: string): Promise<LightBlogCollectResult> {
  const mHtml =
    (await fetchText(`https://m.blog.naver.com/${blogId}`, {
      Referer: `https://blog.naver.com/${blogId}`,
    })) ?? "";

  let nickname = blogId;
  const nicknameMatch =
    mHtml.match(/"blogName":"([^"]+)"/) || mHtml.match(/<meta property="og:title" content="([^"]+)"/);
  if (nicknameMatch) {
    nickname = nicknameMatch[1].replace(" : 네이버 블로그", "").replace(" 네이버 블로그", "").trim();
  }

  const subscriberCount = mHtml ? parseSubscriberCountFromHtml(mHtml) : null;
  let postCount = mHtml ? parsePostCountFromHtml(mHtml) : null;

  const [visitor, pcHtml, recentPosts] = await Promise.all([
    fetchLatestVisitorCount(blogId),
    fetchText(`https://blog.naver.com/${blogId}`, {
      Referer: `https://blog.naver.com/`,
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    }),
    fetchRecentPostsFromRss(blogId),
  ]);

  if (postCount === null && pcHtml) {
    postCount = parsePostCountFromHtml(pcHtml);
  }

  const postingFrequency = computePostingFrequency7d(recentPosts);

  let validKeywords: BlogValidKeyword[] = [];
  let validKeywordCount: number | null = null;
  try {
    const titles = recentPosts.map((p) => p.title).filter((t) => String(t ?? "").trim().length > 0);
    const candidates = extractKeywordCandidatesFromTitles(titles, 30);
    if (candidates.length === 0) {
      validKeywords = [];
      validKeywordCount = null;
    } else {
      validKeywords = await fetchValidBlogKeywordsFromCandidates(candidates);
      validKeywordCount = validKeywords.length;
    }
  } catch {
    validKeywords = [];
    validKeywordCount = null;
  }

  let blogTopic: string | null = null;
  try {
    blogTopic = inferBlogTopic(recentPosts, validKeywords);
  } catch {
    blogTopic = null;
  }

  const blogScorePayload = computeBlogScore({
    visitorCount: visitor,
    postCount,
    postingFrequency,
    subscriberCount,
    recentPosts,
    validKeywordCount,
  });

  return {
    nickname,
    visitor,
    postCount,
    subscriberCount,
    postingFrequency,
    recentPosts,
    validKeywordCount,
    blogTopic,
    blogScorePayload,
  };
}

/** 경량 스냅샷 저장 + 전역 최신 스냅샷 기준 순위 반영 */
export async function persistLightBlogAnalysisHistory(
  prisma: PrismaClient,
  blogId: string,
  snap: LightBlogCollectResult
): Promise<{ totalRank: number | null; topicRank: number | null }> {
  let totalRank: number | null = null;
  let topicRank: number | null = null;

  const historyRow = await prisma.blogAnalysisHistory.create({
    data: {
      userId: null,
      blogId,
      blogName: snap.nickname || null,
      nickname: snap.nickname || null,
      profileImage: null,
      blogTopic: snap.blogTopic,
      visitorCount: sanitizeStoredInt(snap.visitor),
      postCount: sanitizeStoredInt(snap.postCount),
      subscriberCount: sanitizeStoredInt(snap.subscriberCount),
      postingFrequency: sanitizeStoredFloat(snap.postingFrequency),
      validKeywordCount: sanitizeStoredInt(snap.validKeywordCount),
      level: sanitizeStoredInt(snap.blogScorePayload.level),
      grade: snap.blogScorePayload.grade,
      totalScore: sanitizeStoredFloat(snap.blogScorePayload.totalScore),
      influenceScore: sanitizeStoredFloat(snap.blogScorePayload.influenceScore),
      keywordInfluenceScore: sanitizeStoredFloat(snap.blogScorePayload.keywordInfluenceScore),
      contentInfluenceScore: sanitizeStoredFloat(snap.blogScorePayload.contentInfluenceScore),
      averageTitleLength: null,
      averageContentLength: null,
      averageImageCount: null,
      titleLengthScore: null,
      contentLengthScore: null,
      imageCountScore: null,
    },
    select: { id: true },
  });

  const snapshots = await prisma.blogAnalysisHistory.findMany({
    select: {
      blogId: true,
      totalScore: true,
      visitorCount: true,
      analyzedAt: true,
      blogTopic: true,
    },
    orderBy: { analyzedAt: "desc" },
  });

  const latestPerBlog = pickLatestHistoryPerBlogId(snapshots);
  const sortedGlobal = sortBlogAnalysisSnapshotsForRank(latestPerBlog);
  totalRank = rankPlace1Based(sortedGlobal, blogId);

  if (isTopicRankingEligible(snap.blogTopic)) {
    const topicSlice = latestPerBlog.filter(
      (r) => r.blogTopic === snap.blogTopic && isTopicRankingEligible(r.blogTopic)
    );
    const sortedTopic = sortBlogAnalysisSnapshotsForRank(topicSlice);
    topicRank = rankPlace1Based(sortedTopic, blogId);
  } else {
    topicRank = null;
  }

  await prisma.blogAnalysisHistory.update({
    where: { id: historyRow.id },
    data: {
      totalRank,
      topicRank,
    },
  });

  return { totalRank, topicRank };
}
