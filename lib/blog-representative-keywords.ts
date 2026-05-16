import type { BlogAnalysisRecentPost, BlogKeywordInsight, BlogValidKeyword } from "@/lib/blog-analysis-types";

const FALLBACK_REPRESENTATIVE_LIMIT = 5;

const GENERIC_KEYWORDS = new Set(
  [
    "후기",
    "추천",
    "방법",
    "예약",
    "여행",
    "맛집",
    "카페",
    "일상",
    "정보",
    "리뷰",
    "방문",
    "솔직",
    "완벽",
    "가이드",
    "포인트",
    "가족",
    "오늘",
    "이번",
    "진짜",
    "제대로",
  ].map(normalizeKeyword)
);

function normalizeKeyword(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function normalizeTitle(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

function safeVolume(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function titleMatchCount(recentPosts: BlogAnalysisRecentPost[], keyword: string): number {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return 0;

  let count = 0;
  for (const post of recentPosts) {
    const title = normalizeTitle(post.title);
    const compactTitle = title.replace(/\s+/g, "");
    if (title.includes(normalizedKeyword) || compactTitle.includes(normalizedKeyword)) {
      count += 1;
    }
  }
  return count;
}

function insightMapByKeyword(keywordInsights: BlogKeywordInsight[] | null | undefined): Map<string, BlogKeywordInsight> {
  const map = new Map<string, BlogKeywordInsight>();
  for (const insight of keywordInsights ?? []) {
    const key = normalizeKeyword(insight.keyword);
    if (key) map.set(key, insight);
  }
  return map;
}

export function computeRepresentativeValidKeywords({
  validKeywords,
  recentPosts,
  keywordInsights,
}: {
  validKeywords: BlogValidKeyword[] | null | undefined;
  recentPosts: BlogAnalysisRecentPost[] | null | undefined;
  keywordInsights?: BlogKeywordInsight[] | null;
}): BlogValidKeyword[] {
  const keywords = Array.isArray(validKeywords) ? validKeywords : [];
  const posts = Array.isArray(recentPosts) ? recentPosts : [];
  if (keywords.length === 0) return [];

  const insights = insightMapByKeyword(keywordInsights);
  const representative = keywords.filter((keyword) => {
    const normalizedKeyword = normalizeKeyword(keyword.keyword);
    if (!normalizedKeyword || GENERIC_KEYWORDS.has(normalizedKeyword)) return false;
    if (safeVolume(keyword.totalVolume) <= 0) return false;

    const insight = insights.get(normalizedKeyword);
    const matchedPostCount =
      insight && Number.isFinite(Number(insight.matchedPostCount))
        ? Number(insight.matchedPostCount)
        : titleMatchCount(posts, keyword.keyword);

    return matchedPostCount >= 1;
  });

  if (representative.length > 0) return representative;

  return keywords
    .filter((keyword) => safeVolume(keyword.totalVolume) > 0)
    .slice(0, FALLBACK_REPRESENTATIVE_LIMIT);
}
