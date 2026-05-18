/**
 * 블로그 분석·랭크 UI 등에서 공통으로 쓰는 SearchAD 검색량 해석·우선순위.
 * 실제 API 호출은 항상 getKeywordSearchVolume 에 위임합니다.
 */

import type { BlogValidKeyword } from "@/lib/blog-analysis-types";
import type { KeywordVolumeResult } from "@/lib/getKeywordSearchVolume";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

const MAX_LOOKUPS = 30;

function normalizeKeywordDisplay(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywordKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

/**
 * /top-blog(check-rank)·블로그 분석 유효 키워드에서 동일하게 사용:
 * SearchAD 응답이 확정적으로 월간 검색량이 있는 경우에만 숫자 반환.
 * (&lt;10 최소치 처리는 getKeywordSearchVolume 단계에서 반영된 total 기준)
 */
export function confirmedMonthlyVolumes(
  volume: KeywordVolumeResult
): {
  monthlySearchVolume: number;
  totalVolume: number;
  mobileVolume: number | null;
  pcVolume: number | null;
} | null {
  if (!volume.ok || volume.reason === "rate-limited" || volume.reason === "skipped-budget") return null;
  const totalRaw = Number(volume.total);
  if (!Number.isFinite(totalRaw)) return null;

  if (totalRaw <= 0) {
    if (volume.persistentlyConfirmedZero) {
      const mob = Number(volume.mobile);
      const pcV = Number(volume.pc);
      return {
        monthlySearchVolume: 0,
        totalVolume: 0,
        mobileVolume: Number.isFinite(mob) ? Math.floor(mob) : null,
        pcVolume: Number.isFinite(pcV) ? Math.floor(pcV) : null,
      };
    }
    return null;
  }

  const total = Math.floor(totalRaw);
  const mob = Number(volume.mobile);
  const pcV = Number(volume.pc);
  return {
    monthlySearchVolume: total,
    totalVolume: total,
    mobileVolume: Number.isFinite(mob) ? Math.floor(mob) : null,
    pcVolume: Number.isFinite(pcV) ? Math.floor(pcV) : null,
  };
}

/**
 * 검색량 API 호출을 뒤로 미룰 긴 문장 조각·비자연스러운 후보.
 * (하드코딩된 특정 블로그/키워드 없이 형태 기준)
 */
export function isLowQualityKeywordForVolumeLookup(keyword: string): boolean {
  const d = normalizeKeywordDisplay(keyword);
  if (!d || d.length < 2) return true;
  const tokens = d.split(/\s+/).filter(Boolean);
  const len = d.length;

  if (len > 26) return true;
  if (tokens.length >= 5) return true;
  if (tokens.length >= 4 && len >= 18) return true;

  if (/까\s*$/.test(d)) return true;
  if (/\s(을|를)\s*$/.test(d)) return true;
  if (/\s(공부할|할까|많이 쓸까|쓸까)\s*$/.test(d)) return true;
  if (/^(자료|발견|기능)\s+/i.test(d) && tokens.length >= 2) return true;
  if (/^(경제|비즈니스)\s+/i.test(d) && tokens.length >= 3 && /공부할/.test(d)) return true;

  // 조사·어미가 낀 문장형 조합 (SearchAD 낭비·저품질 후보)
  if (/\s(받았다면|사용방법을|링크\s*받았다면)/.test(d)) return true;
  if (/뭐가\s.+달라졌을까/.test(d.replace(/\s+/g, " "))) return true;
  if (/\s(과|와)\s.+(을|를)\s*$/.test(d)) return true;
  if (tokens.length >= 3 && /\s(을|를|은|는|이|가)\s/.test(d)) return true;

  return false;
}

/** SearchAD 호출 순서: 값이 클수록 먼저 조회 (짧은 자연 검색어·브랜드·명사구 우선) */
export function scoreKeywordVolumeLookupPriority(keyword: string, sourcePostTitle?: string | null): number {
  const d = normalizeKeywordDisplay(keyword);
  const tokens = d.split(/\s+/).filter(Boolean);
  const tokenCount = tokens.length;
  let score = 0;

  if (/^\d{4}$/.test(d)) score -= 130;

  if (tokenCount >= 1 && tokenCount <= 3) score += 100;
  else if (tokenCount === 4) score += 35;
  else score -= 55 + (tokenCount - 3) * 25;

  if (d.length <= 10) score += 45;
  else if (d.length <= 16) score += 28;
  else if (d.length <= 22) score += 10;
  else score -= (d.length - 22) * 12;

  if (/\d/.test(d)) score += 38;

  if (/[a-zA-Z]/.test(d) && /[\uAC00-\uD7A3]/.test(d)) score += 42;

  if (!/\s/.test(d) && /[\uAC00-\uD7A3]/.test(d) && d.length >= 2) score += 28;

  const compactEnNum = d.replace(/\s+/g, "");
  if (/^[a-zA-Z0-9]{2,14}$/.test(compactEnNum)) score += 36;

  const title = normalizeKeywordDisplay(sourcePostTitle ?? "");
  const nk = normalizeKeywordKey(d);
  if (nk.length >= 2 && title && normalizeKeywordKey(title).includes(nk)) score += 55;

  return score;
}

export function compareVolumeLookupCandidates(
  a: { keyword: string; sourcePostTitle?: string | null },
  b: { keyword: string; sourcePostTitle?: string | null }
): number {
  const lowA = isLowQualityKeywordForVolumeLookup(a.keyword);
  const lowB = isLowQualityKeywordForVolumeLookup(b.keyword);
  if (lowA !== lowB) return Number(lowA) - Number(lowB);

  const sa = scoreKeywordVolumeLookupPriority(a.keyword, a.sourcePostTitle);
  const sb = scoreKeywordVolumeLookupPriority(b.keyword, b.sourcePostTitle);
  if (sb !== sa) return sb - sa;

  return a.keyword.length - b.keyword.length;
}

/** 동일 품질 등급 안에서 우선 조회할 순서 (값이 클수록 먼저) */
export function keywordVolumeBackfillScore(row: BlogValidKeyword): number {
  const kw = row.keyword;
  let score = 0;
  const title = normalizeKeywordDisplay(row.sourcePostTitle ?? "");
  const nk = normalizeKeywordKey(kw);
  if (nk.length >= 2 && title && normalizeKeywordKey(title).includes(nk)) {
    score += 120;
  }

  const tokens = normalizeKeywordDisplay(kw).split(/\s+/).filter(Boolean).length;
  score -= tokens * 22;
  score -= Math.max(0, kw.length - 12) * 3;

  const rank = row.blogRank ?? 999;
  score += Math.max(0, 320 - Math.min(320, rank));

  return score;
}

/** 검색량 보강 시 처리 순서: 고품질 먼저, 동급이면 점수→순위 */
export function compareKeywordsForVolumeBackfill(a: BlogValidKeyword, b: BlogValidKeyword): number {
  const lowA = isLowQualityKeywordForVolumeLookup(a.keyword);
  const lowB = isLowQualityKeywordForVolumeLookup(b.keyword);
  if (lowA !== lowB) return Number(lowA) - Number(lowB);

  const sa = keywordVolumeBackfillScore(a);
  const sb = keywordVolumeBackfillScore(b);
  if (sb !== sa) return sb - sa;

  return (a.blogRank ?? 999999) - (b.blogRank ?? 999999);
}

/**
 * 후보별 검색량 조회 후 `totalVolume > 0`인 항목만 반환합니다. 최대 `MAX_LOOKUPS`회 호출합니다.
 */
export async function fetchValidBlogKeywordsFromCandidates(
  candidates: string[]
): Promise<BlogValidKeyword[]> {
  const valid: BlogValidKeyword[] = [];
  const slice = candidates.slice(0, MAX_LOOKUPS);

  for (const keyword of slice) {
    try {
      const vol = await getKeywordSearchVolume(keyword);
      const fields = confirmedMonthlyVolumes(vol);
      if (!fields) continue;

      valid.push({
        keyword,
        totalVolume: fields.totalVolume,
        monthlySearchVolume: fields.monthlySearchVolume,
        mobileVolume: fields.mobileVolume,
        pcVolume: fields.pcVolume,
      });
    } catch (e) {
      console.warn(`[blog-keyword-volume] 조회 실패 keyword="${keyword}"`, e);
    }
  }

  return valid;
}
