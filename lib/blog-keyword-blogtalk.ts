import type { BlogKeywordValidationStatus, BlogValidKeyword } from "@/lib/blog-analysis-types";

/** 블톡 공지: 유효 키워드 최소 월간 검색량 */
export const DEFAULT_BLOGTALK_VALID_MONTHLY_VOLUME_THRESHOLD = 250;

function parseDevMonthlyVolumeThreshold(): number | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = process.env.BLOG_VALID_KEYWORD_MIN_VOLUME;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

export const BLOGTALK_VALID_MONTHLY_VOLUME_THRESHOLD =
  parseDevMonthlyVolumeThreshold() ?? DEFAULT_BLOGTALK_VALID_MONTHLY_VOLUME_THRESHOLD;

/** 기존 import 호환용 alias */
export const MONTHLY_VOLUME_VALID_THRESHOLD = BLOGTALK_VALID_MONTHLY_VOLUME_THRESHOLD;

export function getBlogtalkValidThresholdSource(): "default" | "env" {
  return parseDevMonthlyVolumeThreshold() == null ? "default" : "env";
}

/** 블톡 공지: 순위·검색량 데이터 갱신 주기 (밀리초) */
export const KEYWORD_EXPOSURE_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function primaryMonthlyVolume(
  row: Pick<BlogValidKeyword, "monthlySearchVolume" | "totalVolume">
): number {
  const raw = row.monthlySearchVolume ?? row.totalVolume;
  if (raw === null || raw === undefined) return 0;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.floor(v) : 0;
}

export function volumeDatumKnown(
  row: Pick<BlogValidKeyword, "monthlySearchVolume" | "totalVolume">
): boolean {
  return row.monthlySearchVolume != null || row.totalVolume != null;
}

/** 통합검색·스마트블록·블로그 순위 노출 신호 */
export function hasExposureSignals(
  row: Pick<BlogValidKeyword, "blogRank" | "integratedSearchRank" | "integratedSearchBlock" | "smartBlockCount">
): boolean {
  const br = row.blogRank;
  if (br != null && Number.isFinite(Number(br)) && Number(br) >= 1) return true;
  const ir = row.integratedSearchRank;
  if (ir != null && Number.isFinite(Number(ir)) && Number(ir) >= 1) return true;
  const ib = row.integratedSearchBlock;
  if (ib != null && String(ib).trim().length > 0) return true;
  const sc = row.smartBlockCount;
  if (sc != null && Number.isFinite(Number(sc)) && Number(sc) > 0) return true;
  return false;
}

/**
 * 블톡 valid 판정용 노출: 블로그 순위는 1~10위만 인정.
 * 통합검색 노출·스마트블록은 기존과 동일하게 인정.
 */
export function qualifiesForBlogtalkValidExposure(
  row: Pick<BlogValidKeyword, "blogRank" | "integratedSearchRank" | "integratedSearchBlock" | "smartBlockCount">
): boolean {
  const br = row.blogRank;
  if (br != null && Number.isFinite(Number(br))) {
    const n = Number(br);
    if (n >= 1 && n <= 10) return true;
  }
  const ir = row.integratedSearchRank;
  if (ir != null && Number.isFinite(Number(ir)) && Number(ir) >= 1) return true;
  const ib = row.integratedSearchBlock;
  if (ib != null && String(ib).trim().length > 0) return true;
  const sc = row.smartBlockCount;
  if (sc != null && Number.isFinite(Number(sc)) && Number(sc) > 0) return true;
  return false;
}

export function normalizeBlogtalkExposureType(
  row: Pick<BlogValidKeyword, "exposureType" | "blogRank" | "integratedSearchRank" | "integratedSearchBlock" | "smartBlockCount">
): string | null {
  const smartBlockCount = row.smartBlockCount;
  if (smartBlockCount != null && Number(smartBlockCount) > 0) return "smartblock";

  const integratedRank = row.integratedSearchRank;
  if (
    (integratedRank != null && Number.isFinite(Number(integratedRank)) && Number(integratedRank) >= 1) ||
    (row.integratedSearchBlock != null && String(row.integratedSearchBlock).trim().length > 0)
  ) {
    return "integrated";
  }

  const blogRank = row.blogRank;
  if (blogRank != null && Number.isFinite(Number(blogRank))) {
    const n = Number(blogRank);
    if (n >= 1 && n <= 10) return "popular";
    if (n >= 1) return "blog";
  }

  const current = String(row.exposureType ?? "").trim().toLowerCase();
  return current || null;
}

function hasOutOfRangeBlogRankOnly(
  row: Pick<BlogValidKeyword, "blogRank" | "integratedSearchRank" | "integratedSearchBlock" | "smartBlockCount">
): boolean {
  const br = row.blogRank;
  const rank = br != null && Number.isFinite(Number(br)) ? Number(br) : null;
  if (rank == null || rank <= 10) return false;
  const ir = row.integratedSearchRank;
  if (ir != null && Number.isFinite(Number(ir)) && Number(ir) >= 1) return false;
  const ib = row.integratedSearchBlock;
  if (ib != null && String(ib).trim().length > 0) return false;
  const sc = row.smartBlockCount;
  if (sc != null && Number.isFinite(Number(sc)) && Number(sc) > 0) return false;
  return true;
}

/**
 * 블톡 공지 기준 상태 분류.
 * - valid: 검색량 ≥ 임계값 + 블로그 1~10위 또는 통합검색/스마트블록 노출
 * - out_of_rank: 검색량 ≥ 임계값 + 블로그 순위는 있으나 11위 이상이고 통합검색/스마트블록 노출 없음
 * - volume_only: 검색량 ≥ 임계값, 노출 없음
 * - low_volume: 확정 검색량 있음 & 임계값 미만 (또는 0건 확정)
 * - rank_only: 노출 있음 & 검색량 미확인
 */
export function inferKeywordValidationStatus(row: BlogValidKeyword): BlogKeywordValidationStatus {
  const vol = primaryMonthlyVolume(row);
  const known = volumeDatumKnown(row);
  const exp = hasExposureSignals(row);
  const validExp = qualifiesForBlogtalkValidExposure(row);

  if (vol >= MONTHLY_VOLUME_VALID_THRESHOLD && validExp) return "valid";
  if (vol >= MONTHLY_VOLUME_VALID_THRESHOLD && hasOutOfRangeBlogRankOnly(row)) return "out_of_rank";
  if (vol >= MONTHLY_VOLUME_VALID_THRESHOLD && !validExp) return "volume_only";
  if (known && vol > 0 && vol < MONTHLY_VOLUME_VALID_THRESHOLD) return "low_volume";
  if (known && vol === 0 && exp) return "rank_only";
  if (known && vol === 0 && !exp) return "low_volume";
  if (!known && exp) return "rank_only";
  return "unchecked";
}

export function isBlogtalkValidKeyword(row: BlogValidKeyword): boolean {
  return inferKeywordValidationStatus(row) === "valid";
}

export function isSnapshotFresh(row: Pick<BlogValidKeyword, "checkedAt">, cutoffMs: number): boolean {
  if (!row.checkedAt) return false;
  return new Date(row.checkedAt).getTime() >= cutoffMs;
}
