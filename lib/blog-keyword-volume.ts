/**
 * 네이버 SearchAD 키워드도구 검색량으로 유효 키워드를 판별합니다.
 * 실패 시 빈 배열만 반환하고 상위 라우트가 200을 유지합니다.
 */

import type { BlogValidKeyword } from "@/lib/blog-analysis-types";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

const MAX_LOOKUPS = 30;

function safeVolume(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
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
      const total = safeVolume(vol.total);
      if (!vol.ok || total === null || total <= 0) continue;

      valid.push({
        keyword,
        totalVolume: total,
        mobileVolume: safeVolume(vol.mobile),
        pcVolume: safeVolume(vol.pc),
      });
    } catch (e) {
      console.warn(`[blog-keyword-volume] 조회 실패 keyword="${keyword}"`, e);
    }
  }

  return valid;
}
