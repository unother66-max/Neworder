import {
  compactKeywordForVolumeHint,
  getKeywordSearchVolume,
  normalizeVolumeKeywordInput,
  type KeywordVolumeResult,
} from "@/lib/getKeywordSearchVolume";

function volumeTotal(v: KeywordVolumeResult): number {
  return (v.total ?? 0) || (v.mobile ?? 0) + (v.pc ?? 0);
}

/**
 * Place 업체명 기준 검색량: 첫 조회 후 total이 0이면 공백 제거 키워드로 한 번만 재시도.
 * (키워드도구 API·매칭 로직은 getKeywordSearchVolume에 그대로 둔다.)
 */
export async function getPlaceNameSearchVolume(
  name: string
): Promise<KeywordVolumeResult> {
  const v1 = await getKeywordSearchVolume(name);
  const t1 = volumeTotal(v1);
  if (t1 > 0) return v1;

  const norm = normalizeVolumeKeywordInput(name);
  const compact = compactKeywordForVolumeHint(name);
  if (!compact || compact === norm) return v1;

  const v2 = await getKeywordSearchVolume(compact);
  const t2 = volumeTotal(v2);
  if (t2 > 0) return v2;

  return v1;
}
