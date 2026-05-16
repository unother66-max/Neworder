import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import type { BlogAnalysisResult } from "@/lib/blog-analysis-types";
import { computeBlogKeywordInsights } from "@/lib/blog-keyword-insight";
import { fetchValidBlogKeywordsFromCandidates } from "@/lib/blog-keyword-volume";
import { extractKeywordCandidatesFromTitles } from "@/lib/blog-keywords";
import { computeRepresentativeValidKeywords } from "@/lib/blog-representative-keywords";
import { computeBlogScore } from "@/lib/blog-score";
import { inferBlogTopic } from "@/lib/blog-topic";
import { prisma } from "@/lib/prisma";
import { analyzeBlogPostPatterns } from "@/lib/blog-post-pattern";
import {
  fetchBlogPostMetricDraft,
  isBlogPostMetricCacheFresh,
  mergeBlogPostMetricSnapshot,
  publishedAtDate,
  withBlogPostMetricIdentity,
} from "@/lib/blog-post-metric-cache";
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

async function mergeRecentPostsWithMetricCache(
  blogId: string,
  posts: BlogAnalysisResult["recentPosts"]
): Promise<NonNullable<BlogAnalysisResult["recentPosts"]>> {
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
    const enriched: NonNullable<BlogAnalysisResult["recentPosts"]> = [];

    for (const post of postsWithKeys) {
      const cached = post.postKey ? cacheByKey.get(post.postKey) : null;
      if (cached && isBlogPostMetricCacheFresh(cached, now)) {
        enriched.push(mergeBlogPostMetricSnapshot(post, cached));
        continue;
      }

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
    let scrapCount = mHtml ? parseScrapCountFromHtml(mHtml) : null;
    const selectCategoryNo = parseSelectCategoryNoFromHtml(mHtml) ?? "45";

    const [visitor, pcHtml, postTitleListHtml, widgetListHtml, prologueListHtml, rssRecentPosts] = await Promise.all([
      fetchLatestVisitorCount(blogId),
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

    const recentPosts = await mergeRecentPostsWithMetricCache(blogId, rssRecentPosts);

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
      visitorCount: visitor,
      postCount,
      postingFrequency,
      subscriberCount,
      recentPosts,
      validKeywordCount: representativeValidKeywordCount,
    });

    // TODO: BlogInfluenceSnapshot 도입 후 BlogAnalysisHistory 누적값을
    // officialBlogTopic별로 그룹화해 PostLabs 자체 전체/주제 순위를 저장합니다.
    // 네이버 공식 순위나 BlogChart 값을 의미하지 않으므로, 현재 단계에서는 표시하지 않습니다.
    let totalRank: number | null = null;
    let topicRank: number | null = null;

    if (process.env.NODE_ENV === "development") {
      console.log("[blog-analysis] postlabs rank source", {
        blogId,
        postlabsOverallRank: totalRank,
        postlabsTopicRank: topicRank,
        topicName: officialBlogTopic,
        rankSource: "postlabs",
        message: "PostLabs 자체 랭킹 스냅샷 도입 전까지 순위는 표시하지 않습니다.",
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
          validKeywordCount: sanitizeStoredInt(representativeValidKeywordCount),
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
          validKeywordCount: representativeValidKeywordCount,
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
      scrapCount,
      recentPosts,
      postingFrequency,
      profileImage: profileImageBase64,
      validKeywords,
      representativeValidKeywords,
      keywordInsights,
      validKeywordCount: representativeValidKeywordCount,
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
