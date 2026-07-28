import type { KeywordSearchVolumeCache } from "@prisma/client";

import {
  keywordVolumeCacheKey,
  keywordVolumeResultFromPersistentCacheRow,
} from "@/lib/getKeywordSearchVolume";
import { prisma } from "@/lib/prisma";

export type RegisteredKeywordVolumeStatus =
  | "AVAILABLE"
  | "ZERO"
  | "PENDING"
  | "UNAVAILABLE";

export type RegisteredKeywordWithVolume = {
  keyword: string;
  volume: number | null;
  volumeStatus: RegisteredKeywordVolumeStatus;
};

export type RegisteredKeywordVolumeCacheState = {
  rows: Map<string, KeywordSearchVolumeCache>;
  loadStatus: "AVAILABLE" | "UNAVAILABLE";
};

function normalizeKeywordNames(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawKeyword of keywords) {
    const keyword = String(rawKeyword ?? "").normalize("NFKC").trim();
    const key = keywordVolumeCacheKey(keyword);
    if (!keyword || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

/**
 * HTTP 응답에서는 SearchAD를 호출하지 않고 기존 영속 검색량 캐시만 한 번 읽는다.
 * stale 행도 마지막 성공값이므로 표시하며, 수집 실패값으로 덮어쓰지 않는다.
 */
export async function loadRegisteredKeywordVolumeCache(
  keywords: readonly string[]
): Promise<RegisteredKeywordVolumeCacheState> {
  const normalizedKeys = normalizeKeywordNames(keywords)
    .map(keywordVolumeCacheKey)
    .filter(Boolean);
  if (normalizedKeys.length === 0) {
    return { rows: new Map(), loadStatus: "AVAILABLE" };
  }

  try {
    const rows = await prisma.keywordSearchVolumeCache.findMany({
      where: { normalizedKeyword: { in: normalizedKeys } },
    });
    return {
      rows: new Map(rows.map((row) => [row.normalizedKeyword, row])),
      loadStatus: "AVAILABLE",
    };
  } catch (error) {
    console.warn("[place-analysis registered keyword volume cache] load", {
      reason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      keywordCount: normalizedKeys.length,
    });
    return { rows: new Map(), loadStatus: "UNAVAILABLE" };
  }
}

/**
 * 네이버 등록 순서를 동률 보조 순서로 유지하면서 검색량 내림차순으로 정렬한다.
 * 확정 0은 0/ZERO, 미수집·실패·근거 없는 legacy 0은 null/UNAVAILABLE이다.
 */
export function buildRegisteredKeywordsWithVolumes(
  keywords: readonly string[] | null,
  cache: RegisteredKeywordVolumeCacheState
): RegisteredKeywordWithVolume[] | null {
  if (keywords === null) return null;

  return normalizeKeywordNames(keywords)
    .map((keyword, index) => {
      const row = cache.rows.get(keywordVolumeCacheKey(keyword));
      if (!row) {
        return {
          keyword,
          volume: null,
          volumeStatus:
            cache.loadStatus === "AVAILABLE"
              ? ("PENDING" as const)
              : ("UNAVAILABLE" as const),
          index,
        };
      }

      const result = keywordVolumeResultFromPersistentCacheRow(row);
      if (!result.ok) {
        return {
          keyword,
          volume: null,
          volumeStatus: "UNAVAILABLE" as const,
          index,
        };
      }

      const volume = Math.max(0, Math.floor(result.total));
      return {
        keyword,
        volume,
        volumeStatus: volume === 0 ? ("ZERO" as const) : ("AVAILABLE" as const),
        index,
      };
    })
    .sort((a, b) => {
      if (a.volume === null && b.volume === null) return a.index - b.index;
      if (a.volume === null) return 1;
      if (b.volume === null) return -1;
      return b.volume - a.volume || a.index - b.index;
    })
    .map((item) => ({
      keyword: item.keyword,
      volume: item.volume,
      volumeStatus: item.volumeStatus,
    }));
}

export function missingRegisteredKeywordVolumes(
  keywords: readonly RegisteredKeywordWithVolume[] | null
): string[] {
  if (!keywords) return [];
  return keywords
    .filter(
      (item) =>
        item.volumeStatus === "PENDING" || item.volumeStatus === "UNAVAILABLE"
    )
    .map((item) => item.keyword);
}
