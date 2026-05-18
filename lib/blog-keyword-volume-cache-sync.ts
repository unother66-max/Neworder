import type { KeywordSearchVolumeCache as KeywordSearchVolumeCacheRow } from "@prisma/client";

import { MONTHLY_VOLUME_VALID_THRESHOLD } from "@/lib/blog-keyword-blogtalk";
import {
  keywordVolumeCacheKey,
  normalizeVolumeKeywordInput,
  upsertKeywordVolumeCacheRow,
} from "@/lib/getKeywordSearchVolume";

export type ExposureSnapshotVolumeRow = Readonly<{
  keyword: string;
  monthlySearchVolume: number | null;
  mobileSearchVolume: number | null;
  pcSearchVolume: number | null;
}>;

/**
 * BlogKeywordExposureSnapshot에 저장된 검색량을 KeywordSearchVolumeCache로 동기화한다.
 * - 스냅샷에 검색량이 하나라도 있으면 upsert (0 포함)
 * - checkedAt은 현재 시각으로 두어 14일 TTL을 새로 잡는다.
 * - prefetch Map에 반영하면 같은 실행 내 getKeywordSearchVolume 선조회에 바로 반영된다.
 */
export async function syncExposureSnapshotVolumesToKeywordVolumeCache(
  snapshots: ReadonlyArray<ExposureSnapshotVolumeRow>,
  options?: { prefetch?: Map<string, KeywordSearchVolumeCacheRow> }
): Promise<{ upsertedCount: number; duplicateKeywordSkipped: number }> {
  let duplicateKeywordSkipped = 0;
  const seenNk = new Set<string>();

  type Spec = {
    displayKeyword: string;
    nk: string;
    pc: number | null;
    mob: number | null;
    total: number;
    belowThreshold: boolean;
  };

  const specs: Spec[] = [];

  for (const row of snapshots) {
    const hasMonthly = row.monthlySearchVolume != null;
    const hasPc = row.pcSearchVolume != null;
    const hasMob = row.mobileSearchVolume != null;
    if (!hasMonthly && !hasPc && !hasMob) continue;

    const displayKeyword = normalizeVolumeKeywordInput(row.keyword);
    const nk = keywordVolumeCacheKey(displayKeyword);
    if (!nk) continue;
    if (seenNk.has(nk)) {
      duplicateKeywordSkipped += 1;
      continue;
    }
    seenNk.add(nk);

    const pc = hasPc ? Math.max(0, Math.floor(Number(row.pcSearchVolume))) : null;
    const mob = hasMob ? Math.max(0, Math.floor(Number(row.mobileSearchVolume))) : null;
    let total: number;
    if (hasMonthly) {
      total = Math.max(0, Math.floor(Number(row.monthlySearchVolume)));
    } else {
      total = (pc ?? 0) + (mob ?? 0);
    }

    specs.push({
      displayKeyword,
      nk,
      pc,
      mob,
      total,
      belowThreshold: total < MONTHLY_VOLUME_VALID_THRESHOLD,
    });
  }

  const CONCURRENCY = 24;
  for (let i = 0; i < specs.length; i += CONCURRENCY) {
    const batch = specs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((spec) =>
        upsertKeywordVolumeCacheRow({
          displayKeyword: spec.displayKeyword,
          normalizedKeyword: spec.nk,
          monthlyPcQcCnt: spec.pc,
          monthlyMobileQcCnt: spec.mob,
          totalVolume: spec.total,
          belowThreshold: spec.belowThreshold,
          source: "blog-keyword-exposure-snapshot",
          checkedAt: new Date(),
          prefetch: options?.prefetch,
        })
      )
    );
  }

  return { upsertedCount: specs.length, duplicateKeywordSkipped };
}
