import type { BlogAnalysisRecentPost, BlogKeywordInsight, BlogValidKeyword } from "@/lib/blog-analysis-types";

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

function titleIncludesKeyword(title: string, keyword: string): boolean {
  const t = normalizeText(String(title ?? ""));
  const k = normalizeText(keyword);
  if (!k) return false;
  return t.includes(k);
}

function parsePostDateMs(createdAt: string | null | undefined): number | null {
  if (createdAt == null || String(createdAt).trim() === "") return null;
  const d = new Date(createdAt);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function sanitizeVolume(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function baseScoreFromTotalVolume(totalVolume: number | null): number {
  const vol = totalVolume === null ? 0 : totalVolume;
  if (vol >= 30_000) return 100;
  if (vol >= 10_000) return 80;
  if (vol >= 5000) return 60;
  if (vol >= 1000) return 40;
  return 20;
}

function postCountBonus(matchedPostCount: number): number {
  let b = 0;
  if (matchedPostCount >= 3) b += 10;
  if (matchedPostCount >= 5) b += 20;
  return b;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function competitionFromVolume(totalVolume: number | null): BlogKeywordInsight["competitionLevel"] {
  const vol = totalVolume === null ? 0 : totalVolume;
  if (vol < 3000) return "낮음";
  if (vol < 10_000) return "보통";
  return "높음";
}

/**
 * recentPosts 제목 기준 키워드 노출·검색량·임시 경쟁도·영향력 점수를 계산합니다.
 */
export function computeBlogKeywordInsights(
  recentPosts: BlogAnalysisRecentPost[] | null | undefined,
  validKeywords: BlogValidKeyword[] | null | undefined
): BlogKeywordInsight[] {
  const posts = Array.isArray(recentPosts) ? recentPosts : [];
  const keywords = Array.isArray(validKeywords) ? validKeywords : [];

  return keywords.map((vk) => {
    const keyword = String(vk?.keyword ?? "").trim();
    const totalVolume = sanitizeVolume(vk?.totalVolume);
    const mobileVolume = sanitizeVolume(vk?.mobileVolume);
    const pcVolume = sanitizeVolume(vk?.pcVolume);

    let matchedPostCount = 0;
    let lastMs: number | null = null;

    for (const p of posts) {
      if (!titleIncludesKeyword(String(p?.title ?? ""), keyword)) continue;
      matchedPostCount += 1;
      const ms = parsePostDateMs(p?.createdAt);
      if (ms !== null && (lastMs === null || ms > lastMs)) lastMs = ms;
    }

    const lastAppearedAt = lastMs !== null ? new Date(lastMs).toISOString() : null;

    const base = baseScoreFromTotalVolume(totalVolume);
    const bonus = postCountBonus(matchedPostCount);
    const keywordScore = clampScore(base + bonus);
    const competitionLevel = competitionFromVolume(totalVolume);

    return {
      keyword,
      totalVolume,
      mobileVolume,
      pcVolume,
      keywordScore,
      matchedPostCount,
      lastAppearedAt,
      competitionLevel,
    };
  });
}
