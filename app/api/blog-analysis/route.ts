import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import type { BlogAnalysisResult } from "@/lib/blog-analysis-types";
import {
  isTopicRankingEligible,
  pickLatestHistoryPerBlogId,
  rankPlace1Based,
  sortBlogAnalysisSnapshotsForRank,
} from "@/lib/blog-analysis-history-rank";
import { computeBlogKeywordInsights } from "@/lib/blog-keyword-insight";
import { fetchValidBlogKeywordsFromCandidates } from "@/lib/blog-keyword-volume";
import { extractKeywordCandidatesFromTitles } from "@/lib/blog-keywords";
import { computeBlogScore } from "@/lib/blog-score";
import { inferBlogTopic } from "@/lib/blog-topic";
import { prisma } from "@/lib/prisma";
import { analyzeBlogPostPatterns } from "@/lib/blog-post-pattern";
import { computeBlogTopicAverageComparison } from "@/lib/blog-topic-average";
import {
  computePostingFrequency7d,
  extractBlogId,
  parseBlogRssItems,
} from "@/lib/scraper";

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

function parseTotalVisitorFromHtml(html: string): number {
  const totalMatch = html.match(/"total_count":"(\d+)"/) || html.match(/visitor.*?(\d+)/i);
  return totalMatch ? parseInt(totalMatch[1], 10) : 0;
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

export async function POST(request: Request) {
  try {
    const { blogUrl } = await request.json();
    const blogId = extractBlogId(String(blogUrl || ""));

    if (!blogId) {
      return NextResponse.json({ error: "올바른 네이버 블로그 아이디 또는 주소를 입력해주세요." }, { status: 400 });
    }

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

    const totalVisitor = parseTotalVisitorFromHtml(mHtml);
    const subscriberCount = mHtml ? parseSubscriberCountFromHtml(mHtml) : null;
    let postCount = mHtml ? parsePostCountFromHtml(mHtml) : null;

    const [visitor, pcHtml, recentPosts] = await Promise.all([
      fetchLatestVisitorCount(blogId),
      fetchText(`https://blog.naver.com/${blogId}`, {
        Referer: `https://blog.naver.com/`,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      }),
      (async () => {
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
      })(),
    ]);

    if (postCount === null && pcHtml) {
      postCount = parsePostCountFromHtml(pcHtml);
    }

    const postingFrequency = computePostingFrequency7d(recentPosts);

    let patternAnalysis: BlogAnalysisResult["patternAnalysis"] = null;
    // 방문자/최근글/기본 정보는 요청 시점에 실시간으로 수집합니다.
    // 전체 순위·주제 순위·유효키워드 히스토리는 내부 DB 스냅샷 기준이며,
    // 추후 1~2주 단위 batch job으로 주기적 재계산하는 구조로 확장할 예정입니다.
    try {
      patternAnalysis = await analyzeBlogPostPatterns(recentPosts);
    } catch (e) {
      console.warn("[blog-analysis] 포스팅 패턴 분석 실패:", e);
      patternAnalysis = null;
    }

    let validKeywords: BlogAnalysisResult["validKeywords"] = [];
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
    } catch (e) {
      console.warn("[blog-analysis] 유효 키워드 수집 실패:", e);
      validKeywords = [];
      validKeywordCount = null;
    }

    let keywordInsights: BlogAnalysisResult["keywordInsights"] = [];
    try {
      keywordInsights = computeBlogKeywordInsights(recentPosts, validKeywords);
    } catch (e) {
      console.warn("[blog-analysis] 키워드 인사이트 계산 실패:", e);
      keywordInsights = [];
    }

    let blogTopic: string | null = null;
    try {
      blogTopic = inferBlogTopic(recentPosts, validKeywords);
    } catch {
      blogTopic = null;
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
      visitorCount: visitor,
      postCount,
      postingFrequency,
      subscriberCount,
      recentPosts,
      validKeywordCount,
    });

    let totalRank: number | null = null;
    let topicRank: number | null = null;
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

      const historyRow = await prisma.blogAnalysisHistory.create({
        data: {
          userId: sessionUserId,
          blogId,
          blogName: nickname || null,
          nickname: nickname || null,
          profileImage: profileImageBase64 ?? null,
          blogTopic,
          visitorCount: sanitizeStoredInt(visitor),
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

      if (isTopicRankingEligible(blogTopic)) {
        const topicSlice = latestPerBlog.filter((r) => r.blogTopic === blogTopic && isTopicRankingEligible(r.blogTopic));
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
          visitorCount: visitor,
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

    const payload: BlogAnalysisResult = {
      nickname,
      blogId,
      visitor,
      totalVisitor,
      subscriberCount,
      postCount,
      recentPosts,
      postingFrequency,
      profileImage: profileImageBase64,
      validKeywords,
      keywordInsights,
      validKeywordCount,
      blogTopic,
      totalRank,
      topicRank,
      analyzedAt: analyzedAtIso,
      patternAnalysis,
      topicAverageComparison,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("blog-analysis:", error);
    return NextResponse.json({ error: "데이터 수집에 실패했습니다." }, { status: 500 });
  }
}
