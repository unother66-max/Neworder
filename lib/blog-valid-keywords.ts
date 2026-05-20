import type {
  BlogAnalysisRecentPost,
  BlogPostTitleListFetchDiagnostics,
  BlogValidKeyword,
} from "@/lib/blog-analysis-types";
import {
  MONTHLY_VOLUME_VALID_THRESHOLD,
  getBlogtalkValidThresholdSource,
  KEYWORD_EXPOSURE_STALE_AFTER_MS,
  hasExposureSignals,
  qualifiesForBlogtalkValidExposure,
  inferKeywordValidationStatus,
  isSnapshotFresh,
  normalizeBlogtalkExposureType,
  primaryMonthlyVolume,
  volumeDatumKnown,
} from "@/lib/blog-keyword-blogtalk";
import {
  compareVolumeLookupCandidates,
  confirmedMonthlyVolumes,
  isLowQualityKeywordForVolumeLookup,
  scoreKeywordVolumeLookupPriority,
} from "@/lib/blog-keyword-volume";
import {
  createKeywordVolumeLookupTelemetry,
  getKeywordSearchVolume,
  keywordToolRowMonthlyTotal,
  keywordVolumeCacheKey,
  keywordVolumeResultFromPersistentCacheRow,
  type KeywordToolItem,
  type KeywordVolumeResult,
} from "@/lib/getKeywordSearchVolume";
import { checkNaverIntegratedBlogExposure } from "@/lib/naver-integrated-blog-exposure";
import { prisma } from "@/lib/prisma";
import { syncExposureSnapshotVolumesToKeywordVolumeCache } from "@/lib/blog-keyword-volume-cache-sync";
import type { KeywordSearchVolumeCache as KeywordSearchVolumeCacheRow } from "@prisma/client";
import { makePostMatchKey, searchNaverBlogRanks } from "@/lib/naver";

const DEFAULT_CANDIDATE_LIMIT = 420;
const DEFAULT_VOLUME_CHECK_LIMIT = 200;
const DEFAULT_RANK_CHECK_LIMIT = 240;
const DEFAULT_RANK_SEARCH_RESULTS = 300;
const MAX_RANK_CHECK_LIMIT = 280;
const DEFAULT_INTEGRATED_SEARCH_CHECK_LIMIT = 50;
const MAX_INTEGRATED_SEARCH_CHECK_LIMIT = 220;
const MAX_KEYWORD_LENGTH_FOR_PRIMARY_CHECK = 22;
const FULL_TITLE_AS_KEYWORD_MAX_CHARS = 14;
const RELATED_PER_SEED_MAX = 10;
const SERVICE_SUFFIX_KEYWORDS = [
  "검사기",
  "계산기",
  "앱",
  "어플",
  "ai",
  "AI",
  "툴",
  "도구",
  "폼",
  "메일",
  "클라우드",
  "드라이브",
  "스토어",
  "번역",
  "맞춤법",
  "띄어쓰기",
  "정품키",
  "사용법",
  "사용방법",
  "공유",
  "설정",
  "삭제",
  "복구",
  "취소",
  "해지",
];
const BRAND_HINT_KEYWORDS = [
  "네이버",
  "구글",
  "google",
  "노션",
  "notion",
  "윈도우",
  "windows",
  "아이폰",
  "갤럭시",
  "카카오",
  "마이크로소프트",
  "microsoft",
  "엑셀",
  "excel",
  "chatgpt",
  "gpt",
  "ai",
  "AI",
];

function integratedSearchCheckLimitFromEnv(): number {
  if (process.env.NODE_ENV === "production") return DEFAULT_INTEGRATED_SEARCH_CHECK_LIMIT;
  const raw = process.env.BLOG_INTEGRATED_SEARCH_CHECK_LIMIT;
  if (!raw) return DEFAULT_INTEGRATED_SEARCH_CHECK_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_INTEGRATED_SEARCH_CHECK_LIMIT;
  return Math.min(MAX_INTEGRATED_SEARCH_CHECK_LIMIT, Math.floor(parsed));
}

export function normalizeKeywordKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywordDisplay(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 유효 키워드 목록 표시용 중복 제거 키 (검색량 캐시 키와 별도).
 * trim · 소문자화 · 공백 제거 · 일부 구분 문자 제거.
 */
export function normalizedKeywordForValidDedupe(value: string): string {
  const base = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
  let s = base.replace(/\s+/g, "");
  s = s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D\-_·]/g, "");
  return s;
}

function compareValidKeywordRowsForDedupeMerge(a: BlogValidKeyword, b: BlogValidKeyword): number {
  const va = primaryMonthlyVolume(a);
  const vb = primaryMonthlyVolume(b);
  if (vb !== va) return vb - va;

  const ra =
    a.blogRank != null && Number.isFinite(Number(a.blogRank)) ? Number(a.blogRank) : 999999;
  const rb =
    b.blogRank != null && Number.isFinite(Number(b.blogRank)) ? Number(b.blogRank) : 999999;
  if (ra !== rb) return ra - rb;

  const ia =
    a.integratedSearchBlock != null && String(a.integratedSearchBlock).trim().length > 0 ? 1 : 0;
  const ib =
    b.integratedSearchBlock != null && String(b.integratedSearchBlock).trim().length > 0 ? 1 : 0;
  if (ib !== ia) return ib - ia;

  const sa =
    a.smartBlockCount != null && Number.isFinite(Number(a.smartBlockCount))
      ? Math.max(0, Number(a.smartBlockCount))
      : 0;
  const sb =
    b.smartBlockCount != null && Number.isFinite(Number(b.smartBlockCount))
      ? Math.max(0, Number(b.smartBlockCount))
      : 0;
  if (sb !== sa) return sb - sa;

  const ta = checkedAtMs(a.checkedAt);
  const tb = checkedAtMs(b.checkedAt);
  if (tb !== ta) return tb - ta;

  return compareBlogtalkValidKeywordSort(b, a);
}

/** 유효(valid) 키워드 행만 넘길 것 — 표시·카운트용 중복 제거 */
export function dedupeValidKeywordsForDisplay(rows: BlogValidKeyword[]): BlogValidKeyword[] {
  const singles: BlogValidKeyword[] = [];
  const groups = new Map<string, BlogValidKeyword[]>();
  for (const row of rows) {
    const key = normalizedKeywordForValidDedupe(row.keyword);
    if (!key) {
      singles.push(row);
      continue;
    }
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const merged: BlogValidKeyword[] = [];
  for (const [, list] of groups) {
    if (list.length === 1) merged.push(list[0]);
    else merged.push([...list].sort(compareValidKeywordRowsForDedupeMerge)[0]);
  }

  return [...merged, ...singles].sort((a, b) => compareBlogtalkValidKeywordSort(a, b));
}

const STOPWORDS = new Set(
  [
    "오늘",
    "이번",
    "후기",
    "추천",
    "리뷰",
    "방법",
    "정보",
    "일상",
    "하는",
    "분들은",
    "지금",
    "확인하세요",
    "참고하기",
    "정리",
    "분석",
    "기준",
    "플랫폼",
    "필요한",
    "괜찮을까",
    "찾는다면",
    "끝판왕",
    "미쳤던",
    "분위기",
    "대신",
    "사도",
    "쉽게",
    "말하는",
    "사용하는",
    "쓰는",
    "제대로",
    "있는",
    "없는",
    "좋은",
    "정말",
    "너무",
    "그리고",
    "하지만",
    "내돈내산",
  ].map(normalizeKeywordKey)
);

type CandidateSource =
  | "title"
  | "body"
  | "tags"
  | "popularPosts"
  | "recentPosts"
  | "existingKeywords"
  | "snapshotSeed";

export type BlogValidKeywordDebug = {
  blogId: string;
  monthlyVolumeThreshold: number;
  validThresholdSource: "default" | "env";
  candidateKeywordCount: number;
  /** 후보·연관 확장 포함 조회 시도 건수 */
  volumeCheckedCount: number;
  volumeAboveThresholdCount: number;
  volumeBelowThresholdCount: number;
  exposureCheckCandidateCount: number;
  exposureMatchedCount: number;
  validKeywordCount: number;
  lowVolumeExcludedCount: number;
  rankOnlyCount: number;
  cacheHitWithin14DaysCount: number;
  refreshNeededCount: number;
  sampleValidKeywords: BlogValidKeyword[];
  sampleLowVolumeExcludedKeywords: BlogValidKeyword[];
  sampleVolumeAboveThresholdNoExposureKeywords: BlogValidKeyword[];

  totalCandidateKeywordCount: number;
  dedupedKeywordCount: number;
  candidateSourceCounts: Record<CandidateSource, number>;
  volumeLookupCandidateCount: number;
  volumeLookupAttemptedCount: number;
  volumeLookupSuccessCount: number;
  volumeLookup429Stopped: boolean;
  rankCheckCandidateCount: number;
  rankCheckedCount: number;
  rankMatchedCount: number;
  hiddenRankOnlyCount: number;
  volumeOnlyKeywordCount: number;
  sampleHiddenRankOnlyKeywords: BlogValidKeyword[];
  topByMonthlyVolumeSample: BlogValidKeyword[];
  sampleRankCheckKeywords: string[];
  excludedTooLongPhraseCount: number;
  excludedStopwordPhraseCount: number;
  reusedCacheCount: number;
  integratedSearchExposureCount: number;
  popularPostExposureCount: number;
  smartBlockExposureCount: number;
  reusedTopBlogRankLogic: boolean;
  searchVolumeMatchedCount: number;
  searchVolumeSkippedDueTo429: number;
  searchVolume429Count: number;
  validWithMonthlyVolumeCount: number;
  validWithoutMonthlyVolumeExcludedCount: number;
  sampleRankOnlyKeywords: BlogValidKeyword[];
  volumeBackfillTargetCount: number;
  volumeBackfillAttemptedCount: number;
  volumeBackfillSuccessCount: number;
  volumeBackfillSkippedLowQualityCount: number;
  volumeBackfill429Stopped: boolean;
  promotedRankOnlyToValidCount: number;
  samplePromotedKeywords: string[];
  sampleStillMissingVolumeKeywords: string[];

  /** 검색량 영속 캐시·SearchAD 텔레메트리 (keyword-refresh 등) */
  volumeCacheHitCount?: number;
  volumeCacheMissCount?: number;
  volumeCacheStaleCount?: number;
  searchAdAttemptedCount?: number;
  searchAdSuccessCount?: number;
  searchAd429Stopped?: boolean;
  volumeAboveThresholdFromCacheCount?: number;
  volumeAboveThresholdFromSearchAdCount?: number;
  volumeDeferredDueToBudgetCount?: number;
  validByBlogRankTop10Count?: number;
  validByPopularBlogRankCount?: number;
  validByIntegratedSearchCount?: number;
  validBySmartBlockCount?: number;
  blogRankTop10MatchedCount?: number;
  outOfRankExcludedCount?: number;
  sampleOutOfRankExcludedKeywords?: BlogValidKeyword[];
  sampleLowVolumeNearThresholdKeywords?: BlogValidKeyword[];
  integratedSearchCheckCandidateCount?: number;
  integratedSearchCheckedCount?: number;
  integratedSearchMatchedCount?: number;
  smartBlockMatchedCount?: number;
  integratedSearchEligibleCandidateCount?: number;
  integratedSearchCheckSkippedFreshCacheCount?: number;
  integratedSearchCheckLimit?: number;
  sampleIntegratedSearchCandidates?: string[];
  /** 통합검색 미매칭 샘플 — summary에는 최대 5개, 소스별 요약만 포함 */
  sampleIntegratedSearchNoMatchKeywords?: Array<{
    keyword: string;
    matchedSource: string | null;
    pcIntegrated: { httpStatus: number | null; noBlogResult: boolean; htmlLength: number; htmlContainsBlogNaverCom: boolean; extractedCount: number };
    mobileIntegrated: { httpStatus: number | null; noBlogResult: boolean; htmlLength: number; htmlContainsBlogNaverCom: boolean; extractedCount: number };
    pcView: { httpStatus: number | null; noBlogResult: boolean; htmlLength: number; htmlContainsBlogNaverCom: boolean; extractedCount: number };
    mobileView: { httpStatus: number | null; noBlogResult: boolean; htmlLength: number; htmlContainsBlogNaverCom: boolean; extractedCount: number };
    noBlogResult: boolean;
    noCandidateMatch: boolean;
    isSearchPageWithNoBlogResults: boolean;
    containsCandidateLogNo: boolean;
  }>;
  /** 이번 실행에서 새로 통합검색 매칭된 키워드 샘플 (integratedSearchMatchedCount 기준) */
  sampleIntegratedSearchMatchedKeywords?: BlogValidKeyword[];
  /** 캐시 포함 통합검색 신호 있는 키워드 샘플 */
  sampleCachedIntegratedSearchKeywords?: BlogValidKeyword[];
  /** 최종 valid 중 캐시 기반 통합검색 valid 수 */
  cachedIntegratedSearchValidCount?: number;
  sampleSmartBlockMatchedKeywords?: BlogValidKeyword[];
  sampleOutOfRankButIntegratedValidKeywords?: BlogValidKeyword[];

  /** 제목 기반 후보에 사용된 고유 글 수 (= dedupe 후 post 풀 크기) */
  totalPostTitleCount: number;
  /** keyword-refresh 등에서 전달 시: 소스별 원본 fetch 건수 */
  rawPostFetchCounts?: {
    rssRecent: number;
    rssWide: number;
    titleListAsync: number;
    metricSnapshot: number;
  };
  /** dedupe 순서(rss 최근 → rss 넓게 → PostTitleList → Metric) 기준 첫 출처별 고유 글 수 */
  dedupedPostFirstSourceCounts?: {
    rss: number;
    titleListAsync: number;
    metricSnapshot: number;
  };
  historicExposureKeywordSeedRows: number;
  exposureSnapshotPreloadRows: number;

  /** keyword-refresh 만 채움 — PostTitleListAsync 진단 */
  titleListAsyncRequestCount?: number;
  titleListAsyncSuccessPages?: number;
  titleListAsyncFailedPages?: number;
  titleListAsyncTotalParsedPosts?: number;
  titleListAsyncReportedTotalPostCount?: number | null;
  titleListAsyncFirstError?: string | null;
  titleListAsyncSampleTitles?: string[];

  /** 볼륨 캐시 prefetch 진단 */
  /** prefetch 대상 normalizedKeyword 후보 수 (큐·preload·후보 합집합 크기와 동일) */
  volumeCachePrefetchCandidateCount?: number;
  /**
   * findMany로 새로 로드한 KeywordSearchVolumeCache 행 수
   * (= 동기화로 이미 메워진 키는 제외한 추가 적중 수)
   */
  volumeCachePrefetchHitCount?: number;
  volumeCachePrefetchQueryKeysSample?: string[];
  volumeCachePrefetchReturnedKeysSample?: string[];
  volumeCacheMissSample?: string[];
  /** 넓은 prefetch union에 포함된 고유 키 수 (= 후보 집합과 동일, 명시용) */
  volumeCachePrefetchUnionKeyCount?: number;
  /** 선조회 시 스냅샷 동기화 직후 prefetch Map에 이미 있던 키 수 */
  volumeCachePrefetchWarmBeforeFindManyCount?: number;
  /** findMany로 추가 로드한 행 수 */
  volumeCachePrefetchFindManyReturnedCount?: number;
  /** prefetch Map 최종 엔트리 수 (동기화 + findMany 병합 후) */
  volumeCachePrefetchMapEntryCount?: number;
  /** 노출 스냅샷 → KeywordSearchVolumeCache 동기화 upsert 건수 */
  volumeCacheSnapshotSyncUpsertCount?: number;
  /** 동기화 중 중복 normalizedKeyword 스킵 건수 */
  volumeCacheSnapshotSyncDuplicateSkipped?: number;

  /** keyword-refresh 점진 검색량: 초기 플랜(연관 확장 전) 대비 진행 상태 — 상세 로그 키와 동일 의미 */
  volumeLookupPlanTotalEntries?: number;
  volumeLookupPlanConfirmedVolumeEntries?: number;
  volumeLookupPlanRemainingUnknownEntries?: number;
  confirmedVolumeKeywordCount?: number;
  remainingVolumeUnknownKeywordCount?: number;
  nextVolumeLookupSampleKeywords?: string[];
  strictIncrementalVolumeLookup?: boolean;

  /** keyword-refresh 점진 순위·노출 재검사 (14일 스테일 배치) */
  staleExposureRecheckLimit?: number;
  staleExposureRecheckCandidateCount?: number;
  staleExposureRecheckedCount?: number;
  staleExposureDeferredCount?: number;
  freshExposureSkippedCount?: number;
  exposureRankChangedCount?: number;
  sampleExposureRankChangedKeywords?: string[];
  nextStaleExposureRecheckSampleKeywords?: string[];
};

/** `/api/blog-analysis/keyword-refresh` 에서만 채움 — 로그·디버그용 */
export type KeywordRefreshPostPoolSourceBatches = {
  rssRecent: BlogAnalysisRecentPost[];
  rssWide: BlogAnalysisRecentPost[];
  titleListAsync: BlogAnalysisRecentPost[];
  metricSnapshot: BlogAnalysisRecentPost[];
};

export type BuildExposureValidKeywordsOptions = {
  blogId: string;
  recentPosts: BlogAnalysisRecentPost[];
  /** RSS·목록 등 후보 확장용 포스트 풀 */
  postsForKeywordCandidates?: BlogAnalysisRecentPost[] | null;
  /** DB 스냅샷 전량 — 즉시 병합·표시 (키워드 후보 시드로 쓰지 않음) */
  preloadSnapshots?: BlogValidKeyword[] | null;
  /** 오래된 스냅샷 기반 후보 시드 (대량 refresh 전용 권장) */
  historicExposureKeywords?: BlogValidKeyword[] | null;
  /** 이 시각 이상 checkedAt 인 키워드는 블로그 순위 API 재호출 생략 */
  rankRefreshCutoffMs?: number;
  candidateLimit?: number;
  volumeCheckLimit?: number;
  rankCheckLimit?: number;
  rankSearchResults?: number;
  /**
   * keyword-refresh 전용: 후보 글 풀 통계용.
   * `postsForKeywordCandidates` 가 `[...titleListAsync, ...rssWide, ...metricSnapshot]` 일 때만 의미 있음.
   */
  postPoolSourceBatches?: KeywordRefreshPostPoolSourceBatches | null;
  /** keyword-refresh: PostTitleListAsync HTTP 진단·샘플 제목 */
  keywordRefreshTitleListDiagnostics?: BlogPostTitleListFetchDiagnostics | null;
  /**
   * keyword-refresh 전용: 영속 검색량 캐시·스냅샷에 값이 있으면 SearchAD 재호출 안 함.
   * 미확인 키워드만 volumeCheckLimit 만큼만 SearchAD 조회(429 시 다음 실행에서 이어짐).
   */
  strictIncrementalVolumeLookup?: boolean;
  /**
   * keyword-refresh 전용: 14일 초과(또는 dirty) 순위·통합검색 재검사를 매 실행당 최대 이 개수만 수행.
   * 미처리 스테일 키워드는 다음 실행에서 우선순위대로 이어짐.
   */
  staleExposureRecheckLimit?: number;
  /** keyword-refresh 전용: 통합검색 확인 상한. 기본값은 env/default 사용. */
  integratedSearchCheckLimit?: number;
};

type Candidate = {
  keyword: string;
  source: CandidateSource;
  sourcePostUrl?: string | null;
  sourcePostTitle?: string | null;
  score: number;
};

type CandidateBuildStats = {
  excludedTooLongPhraseCount: number;
  excludedStopwordPhraseCount: number;
};

function hasHangul(s: string): boolean {
  return /[\uAC00-\uD7A3]/.test(s);
}

function tokenizeTitle(title: string): string[] {
  return normalizeKeywordDisplay(title)
    .replace(/[^\u3131-\u318E\uAC00-\uD7A3a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => {
      const key = normalizeKeywordKey(token);
      return key.length >= 2 && !STOPWORDS.has(key);
    });
}

function tokenizeBody(text: string): string[] {
  return normalizeKeywordDisplay(text)
    .replace(/[^\u3131-\u318E\uAC00-\uD7A3a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => {
      const key = normalizeKeywordKey(token);
      return key.length >= 2 && key.length <= 18 && !STOPWORDS.has(key);
    });
}

function checkedAtMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** 월간 검색량 desc · 블로그 순위 asc · checkedAt desc */
export function compareBlogtalkValidKeywordSort(a: BlogValidKeyword, b: BlogValidKeyword): number {
  const av = Number(a.monthlySearchVolume ?? a.totalVolume ?? 0);
  const bv = Number(b.monthlySearchVolume ?? b.totalVolume ?? 0);
  if (bv !== av) return bv - av;
  const ar = a.blogRank ?? 999999;
  const br = b.blogRank ?? 999999;
  if (ar !== br) return ar - br;
  return checkedAtMs(b.checkedAt) - checkedAtMs(a.checkedAt);
}

function exposureRankFingerprint(row: BlogValidKeyword): string {
  return [
    row.blogRank ?? "",
    row.integratedSearchRank ?? "",
    String(row.integratedSearchBlock ?? "").trim(),
    row.smartBlockCount ?? "",
    row.exposureType ?? "",
  ].join("|");
}

/** 스테일 재검사 우선순위: 기존 blogRank 1~20 근처 가중 */
function rankProximityScoreStaleRecheck(row: BlogValidKeyword): number {
  const br = row.blogRank;
  if (br == null || !Number.isFinite(Number(br))) return 0;
  const n = Number(br);
  if (n >= 1 && n <= 20) return 120 - n;
  return 0;
}

function integratedOrSmartBlockSignalScore(row: BlogValidKeyword): number {
  let s = 0;
  if (row.integratedSearchRank != null && Number.isFinite(Number(row.integratedSearchRank))) s += 4;
  if (row.integratedSearchBlock != null && String(row.integratedSearchBlock).trim().length > 0) s += 3;
  if (row.smartBlockCount != null && Number(row.smartBlockCount) > 0) s += 2;
  return s;
}

/** 높은 우선순위가 앞에 오도록 a vs b 비교 */
function compareStaleExposureRecheckPriority(a: BlogValidKeyword, b: BlogValidKeyword): number {
  const va = inferKeywordValidationStatus(a) === "valid" ? 1 : 0;
  const vb = inferKeywordValidationStatus(b) === "valid" ? 1 : 0;
  if (va !== vb) return vb - va;

  const volA = primaryMonthlyVolume(a);
  const volB = primaryMonthlyVolume(b);
  if (volA !== volB) return volB - volA;

  const proxA = rankProximityScoreStaleRecheck(a);
  const proxB = rankProximityScoreStaleRecheck(b);
  if (proxA !== proxB) return proxB - proxA;

  const sigA = integratedOrSmartBlockSignalScore(a);
  const sigB = integratedOrSmartBlockSignalScore(b);
  if (sigA !== sigB) return sigB - sigA;

  const ta = checkedAtMs(a.checkedAt);
  const tb = checkedAtMs(b.checkedAt);
  if (ta !== tb) return ta - tb;

  return compareBlogtalkValidKeywordSort(b, a);
}

function isOutOfRankCandidate(row: BlogValidKeyword): boolean {
  const rank = firstFiniteKeywordNumber(row.blogRank);
  return rank != null && rank > 10 && !qualifiesForBlogtalkValidExposure(row);
}

function firstFiniteKeywordNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function integratedSearchCandidatePriority(row: BlogValidKeyword): number {
  const volume = primaryMonthlyVolume(row);
  const blogRank = firstFiniteKeywordNumber(row.blogRank);
  let score = Math.log10(Math.max(1, volume)) * 120;

  if (isOutOfRankCandidate(row)) score += 180;
  if (blogRank == null) score += 120;
  else if (blogRank > 10) score += Math.max(20, 150 - Math.min(blogRank, 250) / 2);

  const status = row.keywordValidationStatus ?? inferKeywordValidationStatus(row);
  if (status === "out_of_rank") score += 180;
  if (status === "volume_only") score += 120;

  const kw = normalizeKeywordDisplay(row.keyword);
  if (/^[a-zA-Z0-9][a-zA-Z0-9\s.+#-]{1,24}$/.test(kw)) score += 95;
  if (/[a-zA-Z]/.test(kw) && /[\uAC00-\uD7A3]/.test(kw)) score += 70;
  if (/(검사기|계산기|앱|어플|ai|AI|구글|네이버|노션|notion|클라우드|드라이브|스토어|윈도우|window|windows|서비스|툴|도구|폼|메일|번역|맞춤법|띄어쓰기)/i.test(kw)) {
    score += 90;
  }
  if (kw.length <= 14) score += 60;
  else if (kw.length <= 22) score += 20;
  else score -= 80;

  return score;
}

function dedupePostsForKeywordPool(posts: BlogAnalysisRecentPost[]): BlogAnalysisRecentPost[] {
  const seen = new Set<string>();
  const out: BlogAnalysisRecentPost[] = [];
  for (const p of posts) {
    const k = postPoolMatchKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function postPoolMatchKey(p: BlogAnalysisRecentPost): string {
  return makePostMatchKey(p.url) ?? `fallback:${normalizeKeywordKey(`${p.title}|${p.url}`)}`;
}

function computeKeywordRefreshPostPoolDiagnostics(batches: KeywordRefreshPostPoolSourceBatches): {
  rawPostFetchCounts: NonNullable<BlogValidKeywordDebug["rawPostFetchCounts"]>;
  dedupedPostFirstSourceCounts: NonNullable<BlogValidKeywordDebug["dedupedPostFirstSourceCounts"]>;
  totalPostTitleCount: number;
} {
  const seen = new Set<string>();
  const dedupedPostFirstSourceCounts = { rss: 0, titleListAsync: 0, metricSnapshot: 0 };

  function absorb(posts: BlogAnalysisRecentPost[], bucket: keyof typeof dedupedPostFirstSourceCounts) {
    for (const p of posts) {
      const k = postPoolMatchKey(p);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      dedupedPostFirstSourceCounts[bucket] += 1;
    }
  }

  absorb(batches.rssRecent, "rss");
  absorb(batches.rssWide, "rss");
  absorb(batches.titleListAsync, "titleListAsync");
  absorb(batches.metricSnapshot, "metricSnapshot");

  return {
    rawPostFetchCounts: {
      rssRecent: batches.rssRecent.length,
      rssWide: batches.rssWide.length,
      titleListAsync: batches.titleListAsync.length,
      metricSnapshot: batches.metricSnapshot.length,
    },
    dedupedPostFirstSourceCounts,
    totalPostTitleCount: seen.size,
  };
}

function addCandidate(
  out: Candidate[],
  seen: Set<string>,
  candidate: Candidate,
  sourceCounts: Record<CandidateSource, number>,
  limit: number,
  stats: CandidateBuildStats
): void {
  if (out.length >= limit) return;
  const keyword = normalizeKeywordDisplay(candidate.keyword);
  const key = normalizeKeywordKey(keyword);
  if (key.length < 2 || seen.has(key)) return;
  if (STOPWORDS.has(key)) {
    stats.excludedStopwordPhraseCount += 1;
    return;
  }
  if (keyword.length > MAX_KEYWORD_LENGTH_FOR_PRIMARY_CHECK && candidate.source !== "existingKeywords") {
    stats.excludedTooLongPhraseCount += 1;
    return;
  }

  seen.add(key);
  out.push({ ...candidate, keyword });
  sourceCounts[candidate.source] += 1;
}

function addTitlePhraseCandidates(
  out: Candidate[],
  seen: Set<string>,
  tokens: string[],
  sourcePostUrl: string | null,
  sourcePostTitle: string | null,
  sourceCounts: Record<CandidateSource, number>,
  limit: number,
  stats: CandidateBuildStats
): void {
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let i = 0; i <= tokens.length - size; i += 1) {
      const slice = tokens.slice(i, i + size);
      const spaced = slice.join(" ");
      const score = size * 22 + Math.max(0, 12 - i);
      addCandidate(
        out,
        seen,
        { keyword: spaced, source: "title", sourcePostUrl, sourcePostTitle, score },
        sourceCounts,
        limit,
        stats
      );

      const compact = slice.join("");
      if (
        compact.length >= 2 &&
        compact !== spaced.replace(/\s+/g, "") &&
        hasHangul(compact) &&
        compact.length <= MAX_KEYWORD_LENGTH_FOR_PRIMARY_CHECK
      ) {
        addCandidate(
          out,
          seen,
          {
            keyword: compact,
            source: "title",
            sourcePostUrl,
            sourcePostTitle,
            score: score - 4,
          },
          sourceCounts,
          limit,
          stats
        );
      }

      if (out.length >= limit) return;
    }
  }
}

function addSearchIntentTitleVariants(
  out: Candidate[],
  seen: Set<string>,
  tokens: string[],
  sourcePostUrl: string | null,
  sourcePostTitle: string | null,
  sourceCounts: Record<CandidateSource, number>,
  limit: number,
  stats: CandidateBuildStats
): void {
  const normalizedTokens = tokens.map((token) => normalizeKeywordDisplay(token)).filter(Boolean);
  if (normalizedTokens.length < 2) return;

  const compactTitle = normalizedTokens.join("");
  const suffixIndexes = normalizedTokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => SERVICE_SUFFIX_KEYWORDS.some((suffix) => normalizeKeywordKey(token).includes(normalizeKeywordKey(suffix))));

  for (const { index: suffixIndex } of suffixIndexes) {
    const suffixToken = normalizedTokens[suffixIndex];
    const prev1 = normalizedTokens[suffixIndex - 1];
    const prev2 = normalizedTokens[suffixIndex - 2];
    const prev3 = normalizedTokens[suffixIndex - 3];
    const prefixCandidates = [
      prev1 ? [prev1, suffixToken] : null,
      prev2 && prev1 ? [prev2, prev1, suffixToken] : null,
      prev3 && prev2 && prev1 ? [prev3, prev2, prev1, suffixToken] : null,
    ].filter((value): value is string[] => Boolean(value));

    for (const parts of prefixCandidates) {
      const spaced = parts.join(" ");
      const compact = parts.join("");
      const baseScore = 86 + parts.length * 8;
      addCandidate(
        out,
        seen,
        { keyword: spaced, source: "title", sourcePostUrl, sourcePostTitle, score: baseScore },
        sourceCounts,
        limit,
        stats
      );
      if (compact !== spaced && compact.length <= MAX_KEYWORD_LENGTH_FOR_PRIMARY_CHECK) {
        addCandidate(
          out,
          seen,
          { keyword: compact, source: "title", sourcePostUrl, sourcePostTitle, score: baseScore - 3 },
          sourceCounts,
          limit,
          stats
        );
      }
      if (out.length >= limit) return;
    }

    for (const brand of BRAND_HINT_KEYWORDS) {
      const brandIndex = normalizedTokens.findIndex((token) => normalizeKeywordKey(token) === normalizeKeywordKey(brand));
      if (brandIndex < 0 || brandIndex >= suffixIndex) continue;
      const between = normalizedTokens.slice(brandIndex, suffixIndex + 1).filter((token) => !STOPWORDS.has(normalizeKeywordKey(token)));
      if (between.length < 2 || between.length > 4) continue;
      const spaced = between.join(" ");
      const compact = between.join("");
      addCandidate(
        out,
        seen,
        { keyword: spaced, source: "title", sourcePostUrl, sourcePostTitle, score: 118 },
        sourceCounts,
        limit,
        stats
      );
      addCandidate(
        out,
        seen,
        { keyword: compact, source: "title", sourcePostUrl, sourcePostTitle, score: 114 },
        sourceCounts,
        limit,
        stats
      );
      if (out.length >= limit) return;
    }
  }

  for (const suffix of SERVICE_SUFFIX_KEYWORDS) {
    const normalizedSuffix = normalizeKeywordKey(suffix);
    const suffixPos = normalizeKeywordKey(compactTitle).indexOf(normalizedSuffix);
    if (suffixPos <= 0) continue;
    const suffixEnd = suffixPos + normalizedSuffix.length;
    const left = compactTitle.slice(Math.max(0, suffixPos - 12), suffixEnd);
    if (left.length >= 4 && left.length <= 18) {
      addCandidate(
        out,
        seen,
        { keyword: left, source: "title", sourcePostUrl, sourcePostTitle, score: 92 },
        sourceCounts,
        limit,
        stats
      );
    }
    if (out.length >= limit) return;
  }
}

function buildKeywordCandidates({
  posts,
  existingKeywords,
  historicExposureKeywords,
  limit,
}: {
  posts: BlogAnalysisRecentPost[];
  existingKeywords?: BlogValidKeyword[] | null;
  historicExposureKeywords?: BlogValidKeyword[] | null;
  limit: number;
}): {
  candidates: Candidate[];
  sourceCounts: Record<CandidateSource, number>;
  stats: CandidateBuildStats;
} {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const stats: CandidateBuildStats = {
    excludedTooLongPhraseCount: 0,
    excludedStopwordPhraseCount: 0,
  };
  const sourceCounts: Record<CandidateSource, number> = {
    title: 0,
    body: 0,
    tags: 0,
    popularPosts: 0,
    existingKeywords: 0,
    recentPosts: 0,
    snapshotSeed: 0,
  };

  for (const keyword of existingKeywords ?? []) {
    addCandidate(
      candidates,
      seen,
      {
        keyword: keyword.keyword,
        source: "existingKeywords",
        sourcePostUrl: keyword.sourcePostUrl ?? null,
        sourcePostTitle: keyword.sourcePostTitle ?? null,
        score: 200 + (keyword.blogRank ? Math.max(0, 100 - keyword.blogRank) : 0),
      },
      sourceCounts,
      limit,
      stats
    );
  }

  for (const keyword of historicExposureKeywords ?? []) {
    addCandidate(
      candidates,
      seen,
      {
        keyword: keyword.keyword,
        source: "snapshotSeed",
        sourcePostUrl: keyword.sourcePostUrl ?? null,
        sourcePostTitle: keyword.sourcePostTitle ?? null,
        score: 38,
      },
      sourceCounts,
      limit,
      stats
    );
  }

  for (const post of posts) {
    const tokens = tokenizeTitle(post.title);
    const sourcePostUrl = post.url;
    const sourcePostTitle = post.title;

    const titleDisp = normalizeKeywordDisplay(post.title);
    if (titleDisp.length > 0 && titleDisp.length <= FULL_TITLE_AS_KEYWORD_MAX_CHARS) {
      addCandidate(
        candidates,
        seen,
        {
          keyword: titleDisp,
          source: "recentPosts",
          sourcePostUrl,
          sourcePostTitle,
          score: titleDisp.length <= 10 ? 72 : 52,
        },
        sourceCounts,
        limit,
        stats
      );
    } else if (titleDisp.length > FULL_TITLE_AS_KEYWORD_MAX_CHARS) {
      stats.excludedTooLongPhraseCount += 1;
    }

    addTitlePhraseCandidates(
      candidates,
      seen,
      tokens,
      sourcePostUrl,
      sourcePostTitle,
      sourceCounts,
      limit,
      stats
    );
    addSearchIntentTitleVariants(
      candidates,
      seen,
      tokens,
      sourcePostUrl,
      sourcePostTitle,
      sourceCounts,
      limit,
      stats
    );

    for (const rawTag of post.tags ?? []) {
      const tagLine = normalizeKeywordDisplay(rawTag);
      if (!tagLine || tagLine.length < 2) continue;

      const tagTokens = tokenizeTitle(tagLine);
      addCandidate(
        candidates,
        seen,
        {
          keyword: tagLine,
          source: "tags",
          sourcePostUrl,
          sourcePostTitle,
          score: tagLine.length <= 16 ? 58 : 36,
        },
        sourceCounts,
        limit,
        stats
      );

      addTitlePhraseCandidates(
        candidates,
        seen,
        tagTokens,
        sourcePostUrl,
        sourcePostTitle,
        sourceCounts,
        limit,
        stats
      );

      if (candidates.length >= limit) break;
    }

    const bodyTokens = tokenizeBody(post.description ?? "");
    const bodyFreq = new Map<string, { token: string; count: number }>();
    for (const token of bodyTokens) {
      const key = normalizeKeywordKey(token);
      const prev = bodyFreq.get(key);
      bodyFreq.set(key, { token, count: (prev?.count ?? 0) + 1 });
    }
    const bodyCandidates = [...bodyFreq.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    for (const item of bodyCandidates) {
      addCandidate(
        candidates,
        seen,
        {
          keyword: item.token,
          source: "body",
          sourcePostUrl,
          sourcePostTitle,
          score: 16 + Math.min(28, item.count * 4),
        },
        sourceCounts,
        limit,
        stats
      );
      if (candidates.length >= limit) break;
    }

    if (candidates.length >= limit) break;
  }

  candidates.sort((a, b) => b.score - a.score || a.keyword.length - b.keyword.length);

  return { candidates, sourceCounts, stats };
}

function estimateContentSaturation(rank: number | null, totalVolume: number): number | null {
  if (rank === null) return null;
  const rankPressure = Math.min(100, rank);
  const volumePressure = totalVolume > 0 ? Math.min(100, Math.log10(totalVolume + 10) * 18) : 35;
  return Math.round((rankPressure * 0.55 + volumePressure * 0.45) * 10) / 10;
}

function postKeyMap(posts: BlogAnalysisRecentPost[]): Map<string, BlogAnalysisRecentPost> {
  const map = new Map<string, BlogAnalysisRecentPost>();
  for (const post of posts) {
    const key = makePostMatchKey(post.url);
    if (key) map.set(key, post);
  }
  return map;
}

function relKeywordRelevantEnough(rel: string, seedKeyword: string, titleBlobCompact: string): boolean {
  const r = normalizeKeywordKey(rel);
  const s = normalizeKeywordKey(seedKeyword);
  if (!r || !s) return false;
  const tokens = normalizeKeywordDisplay(rel).split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && STOPWORDS.has(r)) return false;
  if (titleBlobCompact.includes(r)) return true;
  if (r.includes(s) || s.includes(r)) return true;
  for (let len = Math.min(6, s.length); len >= 2; len--) {
    for (let i = 0; i + len <= s.length; i++) {
      if (r.includes(s.slice(i, i + len))) return true;
    }
  }
  return false;
}

function extractRelatedKeywordCandidates(
  keywordList: KeywordToolItem[] | undefined,
  seedKeyword: string,
  titleBlobCompact: string,
  minMonthlyTotal: number,
  maxCount: number
): string[] {
  if (!keywordList?.length || maxCount <= 0) return [];
  const seen = new Set<string>();
  const seedNk = normalizeKeywordKey(seedKeyword);
  if (seedNk) seen.add(seedNk);

  const out: string[] = [];
  for (const item of keywordList) {
    const rk = String(item.relKeyword ?? "").trim();
    if (!rk) continue;
    const nk = normalizeKeywordKey(rk);
    if (!nk || seen.has(nk)) continue;
    const vol = keywordToolRowMonthlyTotal(item);
    if (vol < minMonthlyTotal) continue;
    if (isLowQualityKeywordForVolumeLookup(rk)) continue;
    const tokens = normalizeKeywordDisplay(rk).split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && STOPWORDS.has(nk)) continue;
    if (!relKeywordRelevantEnough(rk, seedKeyword, titleBlobCompact)) continue;
    seen.add(nk);
    out.push(normalizeKeywordDisplay(rk));
    if (out.length >= maxCount) break;
  }
  return out;
}

export async function buildExposureValidKeywords({
  blogId,
  recentPosts,
  postsForKeywordCandidates,
  preloadSnapshots,
  historicExposureKeywords,
  rankRefreshCutoffMs,
  postPoolSourceBatches,
  candidateLimit = DEFAULT_CANDIDATE_LIMIT,
  volumeCheckLimit = DEFAULT_VOLUME_CHECK_LIMIT,
  rankCheckLimit = DEFAULT_RANK_CHECK_LIMIT,
  rankSearchResults = DEFAULT_RANK_SEARCH_RESULTS,
  keywordRefreshTitleListDiagnostics = null,
  strictIncrementalVolumeLookup = false,
  staleExposureRecheckLimit,
  integratedSearchCheckLimit: integratedSearchCheckLimitOption,
}: BuildExposureValidKeywordsOptions): Promise<{
  validKeywords: BlogValidKeyword[];
  /** DB 유지용: 노출 또는 검색량이 있는 행 전체(valid/rank_only/volume_only) */
  persistableKeywords: BlogValidKeyword[];
  validKeywordCount: number;
  debug: BlogValidKeywordDebug;
  dirtyNormalizedKeywordKeys: string[];
  timingsMs: { candidateBuildMs: number; rankCheckMs: number; volumeBackfillMs: number };
}> {
  const recent = Array.isArray(recentPosts) ? recentPosts : [];
  const extra = Array.isArray(postsForKeywordCandidates) ? postsForKeywordCandidates : [];
  const postPool = dedupePostsForKeywordPool([...recent, ...extra]);
  const totalPostTitleCount = postPool.length;

  const batchDiagnostics = postPoolSourceBatches
    ? computeKeywordRefreshPostPoolDiagnostics(postPoolSourceBatches)
    : null;
  if (
    batchDiagnostics &&
    batchDiagnostics.totalPostTitleCount !== totalPostTitleCount &&
    process.env.NODE_ENV === "development"
  ) {
    console.warn("[blog-valid-keywords] post pool diagnostics mismatch", {
      blogId,
      fromBatches: batchDiagnostics.totalPostTitleCount,
      fromDedupe: totalPostTitleCount,
    });
  }

  const preload = Array.isArray(preloadSnapshots) ? preloadSnapshots : [];
  const historic = Array.isArray(historicExposureKeywords) ? historicExposureKeywords : [];

  const cutoffMs = rankRefreshCutoffMs ?? Date.now() - KEYWORD_EXPOSURE_STALE_AFTER_MS;

  const titleBlobCompact = postPool
    .map((p) => normalizeKeywordKey(String(p.title ?? "")))
    .filter(Boolean)
    .join(" ");

  const tCand0 = Date.now();
  const { candidates, sourceCounts, stats } = buildKeywordCandidates({
    posts: postPool,
    existingKeywords: [],
    historicExposureKeywords: historic,
    limit: candidateLimit,
  });
  const candidateBuildMs = Date.now() - tCand0;

  const preloadNk = new Set<string>();
  for (const row of preload) {
    const k = normalizeKeywordKey(row.keyword);
    if (k) preloadNk.add(k);
  }

  const validByKeyword = new Map<string, BlogValidKeyword>();
  let reusedCacheCount = 0;
  const dirtyNormalizedKeys = new Set<string>();

  for (const row of preload) {
    const key = normalizeKeywordKey(row.keyword);
    if (!key) continue;
    validByKeyword.set(key, {
      ...row,
      keywordValidationStatus: row.keywordValidationStatus ?? inferKeywordValidationStatus(row),
    });
    reusedCacheCount += 1;
  }

  function shouldSkipVolumeSearchAd(existing: BlogValidKeyword | undefined): boolean {
    if (!existing) return false;
    /** 스냅샷에 검색량이 있으면 신선도와 무관하게 SearchAD 생략 + 영속 캐시로 재사용 */
    return volumeDatumKnown(existing);
  }

  function shouldSkipRankLookup(row: BlogValidKeyword, nk: string): boolean {
    if (!row.checkedAt) return false;
    if (!isSnapshotFresh(row, cutoffMs)) return false;
    return !dirtyNormalizedKeys.has(nk);
  }

  type VolEntry = { nk: string; keyword: string; sourcePostTitle?: string | null; priorityBoost?: number };

  function planVolumeLookup(keyword: string, bucket: Map<string, VolEntry>, sourcePostTitle?: string | null) {
    const nk = normalizeKeywordKey(keyword);
    if (!nk) return;
    const titleNk = sourcePostTitle ? normalizeKeywordKey(sourcePostTitle) : "";
    if (titleNk && nk === titleNk) return;

    const existingRow = validByKeyword.get(nk);
    if (existingRow && shouldSkipVolumeSearchAd(existingRow)) return;
    if (isLowQualityKeywordForVolumeLookup(keyword)) return;

    let priorityBoost = 0;
    if (existingRow && hasExposureSignals(existingRow)) priorityBoost += 52;
    if (existingRow && volumeDatumKnown(existingRow)) {
      const pv = primaryMonthlyVolume(existingRow);
      if (pv >= MONTHLY_VOLUME_VALID_THRESHOLD) priorityBoost += 130;
      else if (pv >= 120) priorityBoost += 55;
      else if (pv >= 40) priorityBoost += 22;
      else if (pv > 0 && pv < MONTHLY_VOLUME_VALID_THRESHOLD) priorityBoost -= 95;
    }

    const displayKw = normalizeKeywordDisplay(keyword);
    const prev = bucket.get(nk);
    if (!prev || displayKw.length < prev.keyword.length) {
      bucket.set(nk, { nk, keyword: displayKw, sourcePostTitle: sourcePostTitle ?? undefined, priorityBoost });
    } else if ((priorityBoost ?? 0) > (prev.priorityBoost ?? 0)) {
      bucket.set(nk, { ...prev, priorityBoost });
    }
  }

  const volumeEntryMap = new Map<string, VolEntry>();

  for (const row of preload) {
    planVolumeLookup(row.keyword, volumeEntryMap, row.sourcePostTitle ?? null);
  }
  for (const c of candidates) {
    planVolumeLookup(c.keyword, volumeEntryMap, c.sourcePostTitle ?? null);
  }

  const volumeLookupCandidateCount = volumeEntryMap.size;

  function compareVolEntryPriority(a: VolEntry, b: VolEntry): number {
    const lowA = isLowQualityKeywordForVolumeLookup(a.keyword);
    const lowB = isLowQualityKeywordForVolumeLookup(b.keyword);
    if (lowA !== lowB) return Number(lowA) - Number(lowB);
    const boost = (b.priorityBoost ?? 0) - (a.priorityBoost ?? 0);
    if (boost !== 0) return boost;
    const sa = scoreKeywordVolumeLookupPriority(a.keyword, a.sourcePostTitle);
    const sb = scoreKeywordVolumeLookupPriority(b.keyword, b.sourcePostTitle);
    if (sb !== sa) return sb - sa;
    return compareVolumeLookupCandidates(a, b);
  }

  const volumeQueue = [...volumeEntryMap.values()].sort(compareVolEntryPriority);
  const volumeLookupInitialPlanEntries = volumeQueue.slice();

  const queueVolumeKeys = [
    ...new Set(
      volumeQueue.map((e) => keywordVolumeCacheKey(e.keyword)).filter((k): k is string => Boolean(k))
    ),
  ];
  const preloadVolumeKeys = [
    ...new Set(
      preload.map((p) => keywordVolumeCacheKey(p.keyword)).filter((k): k is string => Boolean(k))
    ),
  ];
  const candidateVolumeKeys = [
    ...new Set(
      candidates.map((c) => keywordVolumeCacheKey(c.keyword)).filter((k): k is string => Boolean(k))
    ),
  ];
  const volumePrefetchKeys = [...new Set([...queueVolumeKeys, ...preloadVolumeKeys, ...candidateVolumeKeys])];

  const volumePrefetchMap = new Map<string, KeywordSearchVolumeCacheRow>();

  const volumeSnapshotSync = await syncExposureSnapshotVolumesToKeywordVolumeCache(
    preload.map((p) => ({
      keyword: p.keyword,
      monthlySearchVolume: p.monthlySearchVolume ?? p.totalVolume ?? null,
      mobileSearchVolume: p.mobileVolume ?? null,
      pcSearchVolume: p.pcVolume ?? null,
    })),
    { prefetch: volumePrefetchMap }
  );

  const volumeCachePrefetchWarmBeforeFindManyCount = volumePrefetchKeys.filter((k) =>
    volumePrefetchMap.has(k)
  ).length;

  const volumePrefetchKeysNeedingFetch = volumePrefetchKeys.filter((k) => !volumePrefetchMap.has(k));
  const volumePrefetchRows =
    volumePrefetchKeysNeedingFetch.length > 0
      ? await prisma.keywordSearchVolumeCache.findMany({
          where: { normalizedKeyword: { in: volumePrefetchKeysNeedingFetch } },
        })
      : [];
  for (const r of volumePrefetchRows) {
    volumePrefetchMap.set(r.normalizedKeyword, r);
  }

  const volumeCachePrefetchCandidateCount = volumePrefetchKeys.length;
  /** 하위 호환: findMany로 새로 가져온 행 수 (= 예전 volumeCachePrefetchHitCount 의미에 가깝게 유지) */
  const volumeCachePrefetchHitCount = volumePrefetchRows.length;
  const volumeCachePrefetchUnionKeyCount = volumePrefetchKeys.length;
  const volumeCachePrefetchFindManyReturnedCount = volumePrefetchRows.length;
  const volumeCachePrefetchMapEntryCount = volumePrefetchMap.size;
  const volumeCacheSnapshotSyncUpsertCount = volumeSnapshotSync.upsertedCount;
  const volumeCacheSnapshotSyncDuplicateSkipped = volumeSnapshotSync.duplicateKeywordSkipped;

  const volumeCachePrefetchQueryKeysSample = volumePrefetchKeys.slice(0, 10);
  const volumeCachePrefetchReturnedKeysSample = volumePrefetchRows.slice(0, 10).map((r) => r.normalizedKeyword);
  const volumeCacheMissSample = volumePrefetchKeys.filter((k) => !volumePrefetchMap.has(k)).slice(0, 10);

  if (process.env.NODE_ENV !== "production") {
    console.log("[blog-valid-keywords] volumeCache prefetch", JSON.stringify({
      blogId,
      volumeQueueOnlyKeyCount: queueVolumeKeys.length,
      volumeCachePrefetchUnionKeyCount,
      volumeCachePrefetchWarmBeforeFindManyCount,
      volumeCachePrefetchFindManyReturnedCount,
      volumeCachePrefetchMapEntryCount,
      volumeCacheSnapshotSyncUpsertCount,
      volumeCacheSnapshotSyncDuplicateSkipped,
      volumeCachePrefetchHitCount,
      volumeCachePrefetchQueryKeysSample,
      volumeCachePrefetchReturnedKeysSample,
      volumeCacheMissSample,
    }));
  }

  const volumeTel = createKeywordVolumeLookupTelemetry();
  const searchAdBudget = { remaining: volumeCheckLimit };

  const volumeRequestedKeys = new Set<string>();
  let volumeLookupAttemptedCount = 0;
  let volumeLookupSuccessCount = 0;
  let volumeLookup429Stopped = false;
  let promotedRankOnlyToValidCount = 0;
  const samplePromotedKeywords: string[] = [];

  let volumeAboveThresholdCount = 0;
  let volumeBelowThresholdCount = 0;

  function applyVolumeMergeFromResult(entry: VolEntry, volume: KeywordVolumeResult): boolean {
    const nk = entry.nk;
    const fields = confirmedMonthlyVolumes(volume);
    if (!fields) return false;

    volumeLookupSuccessCount += 1;

    const prev = validByKeyword.get(nk);
    const statusBefore = prev ? inferKeywordValidationStatus(prev) : null;

    const merged: BlogValidKeyword = {
      keyword: entry.keyword,
      totalVolume: fields.totalVolume,
      monthlySearchVolume: fields.monthlySearchVolume,
      mobileVolume: fields.mobileVolume,
      pcVolume: fields.pcVolume,
      exposureType: prev?.exposureType ?? null,
      integratedSearchRank: prev?.integratedSearchRank ?? null,
      integratedSearchBlock: prev?.integratedSearchBlock ?? null,
      smartBlockCount: prev?.smartBlockCount ?? null,
      blogRank: prev?.blogRank ?? null,
      contentSaturation: estimateContentSaturation(prev?.blogRank ?? null, fields.totalVolume),
      sourcePostUrl: prev?.sourcePostUrl ?? null,
      sourcePostTitle: prev?.sourcePostTitle ?? entry.sourcePostTitle ?? null,
      checkedAt: new Date().toISOString(),
    };

    validByKeyword.set(nk, merged);
    dirtyNormalizedKeys.add(nk);

    const afterVolStatus = inferKeywordValidationStatus(merged);
    if (statusBefore && statusBefore !== "valid" && afterVolStatus === "valid") {
      promotedRankOnlyToValidCount += 1;
      if (samplePromotedKeywords.length < 30) samplePromotedKeywords.push(entry.keyword);
    }

    const primaryVol = primaryMonthlyVolume(merged);
    if (primaryVol < MONTHLY_VOLUME_VALID_THRESHOLD) {
      volumeBelowThresholdCount += 1;
      return true;
    }

    volumeAboveThresholdCount += 1;

    const rels = extractRelatedKeywordCandidates(
      volume.keywordList,
      entry.keyword,
      titleBlobCompact,
      MONTHLY_VOLUME_VALID_THRESHOLD,
      RELATED_PER_SEED_MAX
    );
    for (const relKw of rels) {
      const rnk = normalizeKeywordKey(relKw);
      if (!rnk || volumeRequestedKeys.has(rnk)) continue;
      const relExisting = validByKeyword.get(rnk);
      if (relExisting && shouldSkipVolumeSearchAd(relExisting)) continue;
      if (volumeEntryMap.has(rnk)) continue;

      const displayRel = normalizeKeywordDisplay(relKw);
      const relEntry: VolEntry = {
        nk: rnk,
        keyword: displayRel,
        sourcePostTitle: entry.sourcePostTitle ?? undefined,
        priorityBoost: 88,
      };
      volumeEntryMap.set(rnk, relEntry);
      volumeQueue.push(relEntry);
    }
    return true;
  }

  const tVol0 = Date.now();

  if (strictIncrementalVolumeLookup) {
    for (const entry of volumeLookupInitialPlanEntries) {
      const nk = entry.nk;
      if (volumeRequestedKeys.has(nk)) continue;

      const rowPeek = validByKeyword.get(nk);
      if (rowPeek && shouldSkipVolumeSearchAd(rowPeek)) continue;

      const cacheKeyForEntry = keywordVolumeCacheKey(entry.keyword);
      const persistRow = cacheKeyForEntry ? volumePrefetchMap.get(cacheKeyForEntry) : undefined;
      if (!persistRow) continue;

      const vol = keywordVolumeResultFromPersistentCacheRow(persistRow);
      if (applyVolumeMergeFromResult(entry, vol)) {
        volumeRequestedKeys.add(nk);
      }
    }
  }

  for (let qi = 0; qi < volumeQueue.length; qi++) {
    const entry = volumeQueue[qi];
    const nk = entry.nk;
    if (volumeRequestedKeys.has(nk)) continue;

    const rowPeek = validByKeyword.get(nk);
    if (rowPeek && shouldSkipVolumeSearchAd(rowPeek)) continue;

    const cacheKeyForEntry = keywordVolumeCacheKey(entry.keyword);
    const hasPrefetchHit = cacheKeyForEntry ? volumePrefetchMap.has(cacheKeyForEntry) : false;

    // 429 이후에는 DB 캐시 히트가 있는 키워드만 계속 처리; SearchAD 호출은 건너뜀
    if (volumeLookup429Stopped && !hasPrefetchHit) continue;

    try {
      const volume = await getKeywordSearchVolume(entry.keyword, {
        telemetry: volumeTel,
        persistentCachePrefetch: volumePrefetchMap,
        searchAdBudgetRemaining: volumeLookup429Stopped ? { remaining: 0 } : searchAdBudget,
        skipSearchAdWhenPersistentCacheRowExists: strictIncrementalVolumeLookup,
      });

      if (volume.reason === "skipped-budget") {
        continue;
      }

      volumeRequestedKeys.add(nk);
      volumeLookupAttemptedCount += 1;

      if (volume.reason === "rate-limited") {
        volumeLookup429Stopped = true;
        volumeTel.searchAd429Stopped = true;
        console.warn("[blog-valid-keywords] SearchAD 429 — 이후 검색량 조회 중단", {
          blogId,
          keyword: entry.keyword,
        });
        break;
      }

      applyVolumeMergeFromResult(entry, volume);
    } catch (error) {
      console.warn(`[blog-valid-keywords] 검색량 조회 실패 keyword="${entry.keyword}"`, error);
    }
  }
  const volumeBackfillMs = Date.now() - tVol0;

  const volumeLookupPlanTotalEntries = volumeLookupInitialPlanEntries.length;
  let volumeLookupPlanConfirmedVolumeEntries = 0;
  for (const e of volumeLookupInitialPlanEntries) {
    const peekRow = validByKeyword.get(e.nk);
    if (peekRow && volumeDatumKnown(peekRow)) volumeLookupPlanConfirmedVolumeEntries += 1;
  }
  const volumeLookupPlanRemainingUnknownEntries =
    volumeLookupPlanTotalEntries - volumeLookupPlanConfirmedVolumeEntries;

  const unknownPlanEntries = volumeLookupInitialPlanEntries.filter((e) => {
    const peekRow = validByKeyword.get(e.nk);
    return !peekRow || !volumeDatumKnown(peekRow);
  });
  unknownPlanEntries.sort(compareVolEntryPriority);
  const nextVolumeLookupSampleKeywords = unknownPlanEntries.slice(0, 30).map((e) => e.keyword);

  if (strictIncrementalVolumeLookup) {
    console.log(
      "[blog-valid-keywords] volumeLookup progress",
      JSON.stringify({
        blogId,
        strictIncrementalVolumeLookup,
        totalCandidateKeywordCount: volumeLookupPlanTotalEntries,
        confirmedVolumeKeywordCount: volumeLookupPlanConfirmedVolumeEntries,
        remainingVolumeUnknownKeywordCount: volumeLookupPlanRemainingUnknownEntries,
        searchAdAttemptedCount: volumeTel.searchAdAttemptedCount,
        searchAd429Stopped: volumeTel.searchAd429Stopped,
        nextVolumeLookupSampleKeywords,
        volumeCheckLimit,
      })
    );
  }

  const postByKey = postKeyMap(postPool);
  const rankLimitClamped = Math.min(Math.max(1, rankCheckLimit), MAX_RANK_CHECK_LIMIT);

  const rankEligible = [...validByKeyword.entries()]
    .filter(([, row]) => primaryMonthlyVolume(row) >= MONTHLY_VOLUME_VALID_THRESHOLD)
    .filter(([, row]) => !qualifiesForBlogtalkValidExposure(row))
    .filter(([nk, row]) => !shouldSkipRankLookup(row, nk));

  const staleExposureRecheckLimitEffective =
    staleExposureRecheckLimit != null && Number.isFinite(Number(staleExposureRecheckLimit))
      ? Math.max(0, Math.floor(Number(staleExposureRecheckLimit)))
      : null;

  let rankQueue: Array<[string, BlogValidKeyword]>;
  let initialStaleAllowedNk = new Set<string>();
  let staleExposureRecheckCandidateCount = 0;
  let staleExposureDeferredCount = 0;
  let nextStaleExposureRecheckSampleKeywords: string[] = [];
  let freshExposureSkippedCount = 0;

  if (staleExposureRecheckLimitEffective != null && staleExposureRecheckLimitEffective > 0) {
    staleExposureRecheckCandidateCount = rankEligible.length;
    const sortedStale = [...rankEligible].sort(([_, ra], [__, rb]) =>
      compareStaleExposureRecheckPriority(ra, rb)
    );
    const take = Math.min(sortedStale.length, staleExposureRecheckLimitEffective, rankLimitClamped);
    const chosen = sortedStale.slice(0, take);
    initialStaleAllowedNk = new Set(chosen.map(([nk]) => nk));
    staleExposureDeferredCount = Math.max(0, sortedStale.length - take);
    nextStaleExposureRecheckSampleKeywords = sortedStale.slice(take, take + 30).map(([, r]) => r.keyword);
    rankQueue = chosen;

    for (const [nk, row] of validByKeyword.entries()) {
      if (primaryMonthlyVolume(row) < MONTHLY_VOLUME_VALID_THRESHOLD) continue;
      if (qualifiesForBlogtalkValidExposure(row)) continue;
      if (!isSnapshotFresh(row, cutoffMs)) continue;
      if (dirtyNormalizedKeys.has(nk)) continue;
      const hasIntegratedCacheSignals =
        row.integratedSearchRank != null ||
        (row.integratedSearchBlock != null && String(row.integratedSearchBlock).trim().length > 0) ||
        (row.smartBlockCount != null && Number(row.smartBlockCount) > 0);
      if (hasIntegratedCacheSignals) freshExposureSkippedCount += 1;
    }
  } else {
    rankQueue = [...rankEligible]
      .sort(([, a], [, b]) => compareBlogtalkValidKeywordSort(a, b))
      .slice(0, rankLimitClamped);
  }

  const exposureCheckCandidateCount = rankQueue.length;

  let rankCheckedCount = 0;
  let rankMatchedCount = 0;
  let exposureMatchedCount = 0;
  let integratedSearchCheckedCount = 0;
  let integratedSearchMatchedCount = 0;
  let smartBlockMatchedCount = 0;
  let integratedSearchCheckSkippedFreshCacheCount = 0;
  const sampleIntegratedSearchNoMatchKeywords: NonNullable<
    BlogValidKeywordDebug["sampleIntegratedSearchNoMatchKeywords"]
  > = [];
  const blogLower = blogId.toLowerCase();

  const exposureSnapBeforeStaleBatch = new Map<string, string>();
  if (staleExposureRecheckLimitEffective != null && staleExposureRecheckLimitEffective > 0) {
    for (const nk of initialStaleAllowedNk) {
      const snapRow = validByKeyword.get(nk);
      if (snapRow) exposureSnapBeforeStaleBatch.set(nk, exposureRankFingerprint(snapRow));
    }
  }

  const staleExposureRecheckedKeywords = new Set<string>();

  const tRank0 = Date.now();
  for (const [nk, row] of rankQueue) {
    if (staleExposureRecheckLimitEffective != null && staleExposureRecheckLimitEffective > 0) {
      staleExposureRecheckedKeywords.add(nk);
    }
    try {
      const statusBeforeRank = inferKeywordValidationStatus(row);
      const rankMap = await searchNaverBlogRanks(row.keyword, rankSearchResults);
      rankCheckedCount += 1;

      let bestRank: number | null = null;
      let matchedPost: BlogAnalysisRecentPost | null = null;

      for (const [postKey, rank] of rankMap.entries()) {
        if (!postKey.startsWith(`${blogLower}:`)) continue;
        const post = postByKey.get(postKey) ?? null;
        if (bestRank === null || rank < bestRank) {
          bestRank = rank;
          matchedPost = post;
        }
      }

      const volNum = primaryMonthlyVolume(row);

      if (bestRank !== null) {
        rankMatchedCount += 1;
        exposureMatchedCount += 1;
      }

      const next: BlogValidKeyword = {
        ...row,
        ...(bestRank !== null
          ? {
              exposureType: bestRank <= 10 ? "popular" : "blog",
              blogRank: bestRank,
              contentSaturation: estimateContentSaturation(bestRank, volNum),
              sourcePostUrl: matchedPost?.url ?? row.sourcePostUrl ?? null,
              sourcePostTitle: matchedPost?.title ?? row.sourcePostTitle ?? null,
            }
          : {}),
        checkedAt: new Date().toISOString(),
      };

      validByKeyword.set(nk, next);
      dirtyNormalizedKeys.add(nk);

      if (statusBeforeRank !== "valid" && inferKeywordValidationStatus(next) === "valid") {
        promotedRankOnlyToValidCount += 1;
        if (samplePromotedKeywords.length < 30) samplePromotedKeywords.push(row.keyword);
      }
    } catch (error) {
      console.warn(`[blog-valid-keywords] 블로그 순위 확인 실패 keyword="${row.keyword}"`, error);
    }
  }
  const rankCheckMs = Date.now() - tRank0;

  const integratedSearchCheckLimit = Math.min(
    Math.max(1, integratedSearchCheckLimitOption ?? integratedSearchCheckLimitFromEnv()),
    MAX_INTEGRATED_SEARCH_CHECK_LIMIT
  );
  const integratedEligibleEntries = [...validByKeyword.entries()]
    .filter(([, row]) => primaryMonthlyVolume(row) >= MONTHLY_VOLUME_VALID_THRESHOLD)
    .filter(([, row]) => !qualifiesForBlogtalkValidExposure(row))
    .sort(([, a], [, b]) => {
      const pa = integratedSearchCandidatePriority(a);
      const pb = integratedSearchCandidatePriority(b);
      if (pb !== pa) return pb - pa;
      return compareBlogtalkValidKeywordSort(a, b);
    });
  const integratedSearchEligibleCandidateCount = integratedEligibleEntries.length;
  const integratedQueue: Array<[string, BlogValidKeyword]> = [];
  for (const entry of integratedEligibleEntries) {
    const [nk, row] = entry;
    if (
      isSnapshotFresh(row, cutoffMs) &&
      (row.integratedSearchRank != null ||
        (row.integratedSearchBlock != null && String(row.integratedSearchBlock).trim().length > 0) ||
        (row.smartBlockCount != null && Number(row.smartBlockCount) > 0))
    ) {
      integratedSearchCheckSkippedFreshCacheCount += 1;
      continue;
    }
    const snapshotStaleForExposure = !isSnapshotFresh(row, cutoffMs);
    if (
      staleExposureRecheckLimitEffective != null &&
      staleExposureRecheckLimitEffective > 0 &&
      snapshotStaleForExposure &&
      !initialStaleAllowedNk.has(nk)
    ) {
      continue;
    }
    integratedQueue.push([nk, row]);
    if (integratedQueue.length >= integratedSearchCheckLimit) break;
  }

  const integratedSearchCheckCandidateCount = integratedQueue.length;
  const integratedPromotedKeys = new Set<string>();
  /** 이번 실행에서 exposure.matched === true 인 모든 nk (validByIntegratedSearchCount 와 별도) */
  const integratedMatchedThisRunKeys = new Set<string>();
  const candidatePostUrls = postPool.map((post) => post.url);
  const candidatePostTitles = postPool.map((post) => post.title);

  for (const [nk, row] of integratedQueue) {
    try {
      const statusBeforeIntegrated = inferKeywordValidationStatus(row);
      const exposure = await checkNaverIntegratedBlogExposure({
        keyword: row.keyword,
        blogId,
        candidatePostUrls,
        candidatePostTitles,
      });
      integratedSearchCheckedCount += 1;
      if (!exposure.matched) {
        if (process.env.NODE_ENV !== "production") {
          // 개발 환경에서는 상세 로그를 콘솔에 직접 출력 (summary JSON 비포함)
          console.log(`[blog-valid-keywords] 통합검색 미매칭 keyword="${row.keyword}"`, JSON.stringify({
            matchedSource: exposure.debug.matchedSource,
            noBlogResult: exposure.debug.noBlogResult,
            noCandidateMatch: exposure.debug.noCandidateMatch,
            isSearchPageWithNoBlogResults: exposure.debug.isSearchPageWithNoBlogResults,
            containsCandidateLogNo: exposure.debug.containsCandidateLogNo,
            pc: { status: exposure.debug.pcIntegrated.httpStatus, len: exposure.debug.pcIntegrated.htmlLength, hasBlog: exposure.debug.pcIntegrated.htmlContainsBlogNaverCom, keys: exposure.debug.pcIntegrated.extractedBlogPostKeys.length },
            mob: { status: exposure.debug.mobileIntegrated.httpStatus, len: exposure.debug.mobileIntegrated.htmlLength, hasBlog: exposure.debug.mobileIntegrated.htmlContainsBlogNaverCom, keys: exposure.debug.mobileIntegrated.extractedBlogPostKeys.length },
            pcv: { status: exposure.debug.pcView.httpStatus, len: exposure.debug.pcView.htmlLength, hasBlog: exposure.debug.pcView.htmlContainsBlogNaverCom, keys: exposure.debug.pcView.extractedBlogPostKeys.length },
            mobv: { status: exposure.debug.mobileView.httpStatus, len: exposure.debug.mobileView.htmlLength, hasBlog: exposure.debug.mobileView.htmlContainsBlogNaverCom, keys: exposure.debug.mobileView.extractedBlogPostKeys.length },
            blogNaverSamples: exposure.debug.blogNaverMatchRawSamples.slice(0, 5),
            mBlogNaverSamples: exposure.debug.mBlogNaverMatchRawSamples.slice(0, 5),
            allBlogNaverPreviews: exposure.debug.allBlogNaverPreviews.slice(0, 2),
          }));
        }
        // summary에는 최대 5개, 컴팩트 요약만
        if (sampleIntegratedSearchNoMatchKeywords.length < 5) {
          sampleIntegratedSearchNoMatchKeywords.push({
            keyword: row.keyword,
            matchedSource: exposure.debug.matchedSource,
            pcIntegrated: {
              httpStatus: exposure.debug.pcIntegrated.httpStatus,
              noBlogResult: exposure.debug.pcIntegrated.noBlogResult,
              htmlLength: exposure.debug.pcIntegrated.htmlLength,
              htmlContainsBlogNaverCom: exposure.debug.pcIntegrated.htmlContainsBlogNaverCom,
              extractedCount: exposure.debug.pcIntegrated.extractedBlogPostKeys.length,
            },
            mobileIntegrated: {
              httpStatus: exposure.debug.mobileIntegrated.httpStatus,
              noBlogResult: exposure.debug.mobileIntegrated.noBlogResult,
              htmlLength: exposure.debug.mobileIntegrated.htmlLength,
              htmlContainsBlogNaverCom: exposure.debug.mobileIntegrated.htmlContainsBlogNaverCom,
              extractedCount: exposure.debug.mobileIntegrated.extractedBlogPostKeys.length,
            },
            pcView: {
              httpStatus: exposure.debug.pcView.httpStatus,
              noBlogResult: exposure.debug.pcView.noBlogResult,
              htmlLength: exposure.debug.pcView.htmlLength,
              htmlContainsBlogNaverCom: exposure.debug.pcView.htmlContainsBlogNaverCom,
              extractedCount: exposure.debug.pcView.extractedBlogPostKeys.length,
            },
            mobileView: {
              httpStatus: exposure.debug.mobileView.httpStatus,
              noBlogResult: exposure.debug.mobileView.noBlogResult,
              htmlLength: exposure.debug.mobileView.htmlLength,
              htmlContainsBlogNaverCom: exposure.debug.mobileView.htmlContainsBlogNaverCom,
              extractedCount: exposure.debug.mobileView.extractedBlogPostKeys.length,
            },
            noBlogResult: exposure.debug.noBlogResult,
            noCandidateMatch: exposure.debug.noCandidateMatch,
            isSearchPageWithNoBlogResults: exposure.debug.isSearchPageWithNoBlogResults,
            containsCandidateLogNo: exposure.debug.containsCandidateLogNo,
          });
        }
        continue;
      }

      integratedSearchMatchedCount += 1;
      integratedMatchedThisRunKeys.add(nk);
      exposureMatchedCount += 1;
      if (exposure.smartBlockCount > 0) smartBlockMatchedCount += 1;

      const matchedPost = exposure.matchedPostKey
        ? postByKey.get(exposure.matchedPostKey) ?? null
        : null;
      const next: BlogValidKeyword = {
        ...row,
        exposureType: exposure.exposureType ?? row.exposureType ?? "integrated",
        integratedSearchRank: exposure.integratedSearchRank ?? row.integratedSearchRank ?? null,
        integratedSearchBlock: exposure.integratedSearchBlock ?? row.integratedSearchBlock ?? "통합검색",
        smartBlockCount: Math.max(row.smartBlockCount ?? 0, exposure.smartBlockCount),
        sourcePostUrl: matchedPost?.url ?? exposure.matchedPostUrl ?? row.sourcePostUrl ?? null,
        sourcePostTitle: matchedPost?.title ?? exposure.matchedPostTitle ?? row.sourcePostTitle ?? null,
        checkedAt: new Date().toISOString(),
      };

      validByKeyword.set(nk, next);
      dirtyNormalizedKeys.add(nk);

      if (statusBeforeIntegrated !== "valid" && inferKeywordValidationStatus(next) === "valid") {
        promotedRankOnlyToValidCount += 1;
        integratedPromotedKeys.add(nk);
        if (samplePromotedKeywords.length < 30) samplePromotedKeywords.push(row.keyword);
      }
    } catch (error) {
      console.warn(`[blog-valid-keywords] 통합검색 노출 확인 실패 keyword="${row.keyword}"`, error);
    }
  }

  let exposureRankChangedCount = 0;
  const sampleExposureRankChangedKeywords: string[] = [];
  let staleExposureRecheckedCount = 0;

  if (staleExposureRecheckLimitEffective != null && staleExposureRecheckLimitEffective > 0) {
    staleExposureRecheckedCount = staleExposureRecheckedKeywords.size;
    for (const nk of initialStaleAllowedNk) {
      const before = exposureSnapBeforeStaleBatch.get(nk);
      const rowAfter = validByKeyword.get(nk);
      if (!rowAfter || before === undefined) continue;
      if (before !== exposureRankFingerprint(rowAfter)) {
        exposureRankChangedCount += 1;
        if (sampleExposureRankChangedKeywords.length < 30) {
          sampleExposureRankChangedKeywords.push(rowAfter.keyword);
        }
      }
    }

    console.log(
      "[blog-valid-keywords] staleExposureRecheck progress",
      JSON.stringify({
        blogId,
        staleExposureRecheckCandidateCount,
        staleExposureRecheckLimit: staleExposureRecheckLimitEffective,
        staleExposureRecheckedCount,
        staleExposureDeferredCount,
        freshExposureSkippedCount,
        exposureRankChangedCount,
        sampleExposureRankChangedKeywords,
        nextStaleExposureRecheckSampleKeywords,
      })
    );
  }

  const classified = [...validByKeyword.values()].map((row) => ({
    ...row,
    exposureType: normalizeBlogtalkExposureType(row),
    keywordValidationStatus: inferKeywordValidationStatus(row),
  }));

  const displayValidRowsRaw = classified
    .filter((r) => r.keywordValidationStatus === "valid")
    .sort(compareBlogtalkValidKeywordSort);

  const displayValidRows = dedupeValidKeywordsForDisplay(displayValidRowsRaw);

  const validKeywordCount = displayValidRows.length;
  const rankOnlyCount = classified.filter((r) => r.keywordValidationStatus === "rank_only").length;
  const hiddenRankOnlyCount = rankOnlyCount;
  const volumeOnlyKeywordCount = classified.filter((r) => r.keywordValidationStatus === "volume_only").length;
  const outOfRankExcludedRows = classified
    .filter((r) => r.keywordValidationStatus === "out_of_rank")
    .sort((a, b) => primaryMonthlyVolume(b) - primaryMonthlyVolume(a));
  const outOfRankExcludedCount = outOfRankExcludedRows.length;
  const lowVolumeExcludedCount = classified.filter((r) => r.keywordValidationStatus === "low_volume").length;

  const sampleValidKeywords = displayValidRows.slice(0, 30);
  const sampleHiddenRankOnlyKeywords = classified
    .filter((r) => r.keywordValidationStatus === "rank_only")
    .sort((a, b) => (a.blogRank ?? 999999) - (b.blogRank ?? 999999))
    .slice(0, 30);
  const sampleRankOnlyKeywords = sampleHiddenRankOnlyKeywords;

  const sampleLowVolumeExcludedKeywords = classified
    .filter((r) => r.keywordValidationStatus === "low_volume")
    .sort((a, b) => primaryMonthlyVolume(b) - primaryMonthlyVolume(a))
    .slice(0, 30);

  const sampleVolumeAboveThresholdNoExposureKeywords = classified
    .filter((r) => r.keywordValidationStatus === "volume_only")
    .sort((a, b) => primaryMonthlyVolume(b) - primaryMonthlyVolume(a))
    .slice(0, 30);

  const topByMonthlyVolumeSample = displayValidRows.slice(0, 30);
  const sampleOutOfRankExcludedKeywords = outOfRankExcludedRows.slice(0, 30);
  const nearThresholdMin = Math.max(1, Math.min(100, MONTHLY_VOLUME_VALID_THRESHOLD - 1));
  const sampleLowVolumeNearThresholdKeywords = classified
    .filter((row) => {
      const vol = primaryMonthlyVolume(row);
      return (
        vol >= nearThresholdMin &&
        vol < MONTHLY_VOLUME_VALID_THRESHOLD &&
        (qualifiesForBlogtalkValidExposure(row) || hasExposureSignals(row))
      );
    })
    .sort((a, b) => primaryMonthlyVolume(b) - primaryMonthlyVolume(a))
    .slice(0, 30);
  // 이번 실행에서 실제로 통합검색 매칭된 키워드 (integratedSearchMatchedCount 와 1:1 대응)
  const sampleIntegratedSearchMatchedKeywords = classified
    .filter((row) => {
      const nk = normalizeKeywordKey(row.keyword);
      return integratedMatchedThisRunKeys.has(nk);
    })
    .sort(compareBlogtalkValidKeywordSort)
    .slice(0, 30);
  // 캐시 포함 전체 통합검색 신호 있는 키워드
  const sampleCachedIntegratedSearchKeywords = classified
    .filter((row) => row.integratedSearchRank != null || row.integratedSearchBlock)
    .sort(compareBlogtalkValidKeywordSort)
    .slice(0, 30);
  // 캐시에서 온 통합검색 valid 키워드
  const cachedIntegratedSearchValidCount = displayValidRows.filter((row) => {
    const nk = normalizeKeywordKey(row.keyword);
    return (row.integratedSearchRank != null || row.integratedSearchBlock) &&
      !dirtyNormalizedKeys.has(nk);
  }).length;
  const sampleIntegratedSearchCandidates = integratedQueue.slice(0, 30).map(([, row]) => row.keyword);
  const sampleSmartBlockMatchedKeywords = classified
    .filter((row) => (row.smartBlockCount ?? 0) > 0)
    .sort(compareBlogtalkValidKeywordSort)
    .slice(0, 30);
  const sampleOutOfRankButIntegratedValidKeywords = classified
    .filter((row) => {
      const nk = normalizeKeywordKey(row.keyword);
      return integratedPromotedKeys.has(nk) && row.keywordValidationStatus === "valid";
    })
    .sort(compareBlogtalkValidKeywordSort)
    .slice(0, 30);

  const validByBlogRankTop10Count = displayValidRows.filter((row) => {
    const rank = row.blogRank;
    return rank != null && Number(rank) >= 1 && Number(rank) <= 10;
  }).length;
  const validByIntegratedSearchCount = displayValidRows.filter((row) => {
    const rank = row.integratedSearchRank;
    return (
      (rank != null && Number(rank) >= 1) ||
      (row.integratedSearchBlock != null && String(row.integratedSearchBlock).trim().length > 0)
    );
  }).length;
  const validBySmartBlockCount = displayValidRows.filter((row) => {
    const count = row.smartBlockCount;
    return count != null && Number(count) > 0;
  }).length;

  const sampleStillMissingVolumeKeywords = classified
    .filter((r) => r.keywordValidationStatus === "rank_only")
    .sort((a, b) => (a.blogRank ?? 999999) - (b.blogRank ?? 999999))
    .slice(0, 30)
    .map((r) => r.keyword);

  const searchVolume429Hit = volumeLookup429Stopped || volumeTel.searchAd429Stopped;
  const searchVolume429Count = searchVolume429Hit
    ? classified.filter((r) => r.keywordValidationStatus === "rank_only" && !volumeDatumKnown(r)).length
    : 0;

  const volumeBackfillSkippedLowQualityCount = candidates.filter((c) =>
    isLowQualityKeywordForVolumeLookup(c.keyword)
  ).length;

  const cacheHitWithin14DaysCount = preload.filter((r) => r.checkedAt && isSnapshotFresh(r, cutoffMs)).length;

  const newCandidateNk = new Set(candidates.map((c) => normalizeKeywordKey(c.keyword)).filter(Boolean));
  const refreshNeededCount =
    preload.filter((r) => !r.checkedAt || !isSnapshotFresh(r, cutoffMs)).length +
    [...newCandidateNk].filter((nk) => !preloadNk.has(nk)).length;

  const monthlyVolumeThreshold = MONTHLY_VOLUME_VALID_THRESHOLD;
  const validThresholdSource = getBlogtalkValidThresholdSource();

  const debug: BlogValidKeywordDebug = {
    blogId,
    monthlyVolumeThreshold,
    validThresholdSource,
    candidateKeywordCount: candidates.length,
    volumeCheckedCount: volumeLookupAttemptedCount,
    volumeAboveThresholdCount,
    volumeBelowThresholdCount,
    exposureCheckCandidateCount,
    exposureMatchedCount,
    validKeywordCount,
    lowVolumeExcludedCount,
    rankOnlyCount,
    cacheHitWithin14DaysCount,
    refreshNeededCount,
    sampleValidKeywords,
    sampleLowVolumeExcludedKeywords,
    sampleVolumeAboveThresholdNoExposureKeywords,

    totalCandidateKeywordCount: candidates.length,
    dedupedKeywordCount: candidates.length,
    candidateSourceCounts: sourceCounts,
    volumeLookupCandidateCount,
    volumeLookupAttemptedCount,
    volumeLookupSuccessCount,
    volumeLookup429Stopped: volumeLookup429Stopped || volumeTel.searchAd429Stopped,
    rankCheckCandidateCount: rankQueue.length,
    rankCheckedCount,
    rankMatchedCount,
    hiddenRankOnlyCount,
    volumeOnlyKeywordCount,
    sampleHiddenRankOnlyKeywords,
    topByMonthlyVolumeSample,
    sampleRankCheckKeywords: rankQueue.slice(0, 30).map(([, r]) => r.keyword),
    excludedTooLongPhraseCount: stats.excludedTooLongPhraseCount,
    excludedStopwordPhraseCount: stats.excludedStopwordPhraseCount,
    reusedCacheCount,
    integratedSearchExposureCount: classified.filter((row) => row.exposureType === "integrated").length,
    popularPostExposureCount: classified.filter((row) => row.exposureType === "popular").length,
    smartBlockExposureCount: classified.filter((row) => row.exposureType === "smartblock").length,
    reusedTopBlogRankLogic: true,
    searchVolumeMatchedCount: volumeLookupSuccessCount,
    searchVolumeSkippedDueTo429: searchVolume429Hit ? 1 : 0,
    searchVolume429Count,
    validWithMonthlyVolumeCount: validKeywordCount,
    validWithoutMonthlyVolumeExcludedCount: rankOnlyCount + volumeOnlyKeywordCount,
    sampleRankOnlyKeywords,
    volumeBackfillTargetCount: volumeLookupCandidateCount,
    volumeBackfillAttemptedCount: volumeLookupAttemptedCount,
    volumeBackfillSuccessCount: volumeLookupSuccessCount,
    volumeBackfillSkippedLowQualityCount,
    volumeBackfill429Stopped: volumeLookup429Stopped || volumeTel.searchAd429Stopped,
    promotedRankOnlyToValidCount,
    samplePromotedKeywords,
    sampleStillMissingVolumeKeywords,

    totalPostTitleCount,
    rawPostFetchCounts: batchDiagnostics?.rawPostFetchCounts,
    dedupedPostFirstSourceCounts: batchDiagnostics?.dedupedPostFirstSourceCounts,
    historicExposureKeywordSeedRows: historic.length,
    exposureSnapshotPreloadRows: preload.length,

    ...(keywordRefreshTitleListDiagnostics
      ? {
          titleListAsyncRequestCount: keywordRefreshTitleListDiagnostics.titleListAsyncRequestCount,
          titleListAsyncSuccessPages: keywordRefreshTitleListDiagnostics.titleListAsyncSuccessPages,
          titleListAsyncFailedPages: keywordRefreshTitleListDiagnostics.titleListAsyncFailedPages,
          titleListAsyncTotalParsedPosts: keywordRefreshTitleListDiagnostics.titleListAsyncTotalParsedPosts,
          titleListAsyncReportedTotalPostCount:
            keywordRefreshTitleListDiagnostics.titleListAsyncReportedTotalPostCount,
          titleListAsyncFirstError: keywordRefreshTitleListDiagnostics.titleListAsyncFirstError,
          titleListAsyncSampleTitles: keywordRefreshTitleListDiagnostics.titleListAsyncSampleTitles,
        }
      : {}),

    volumeCacheHitCount: volumeTel.volumeCacheHitCount,
    volumeCacheMissCount: volumeTel.volumeCacheMissCount,
    volumeCacheStaleCount: volumeTel.volumeCacheStaleCount,
    searchAdAttemptedCount: volumeTel.searchAdAttemptedCount,
    searchAdSuccessCount: volumeTel.searchAdSuccessCount,
    searchAd429Stopped: volumeTel.searchAd429Stopped,
    volumeAboveThresholdFromCacheCount: volumeTel.volumeAboveThresholdFromCacheCount,
    volumeAboveThresholdFromSearchAdCount: volumeTel.volumeAboveThresholdFromSearchAdCount,
    volumeDeferredDueToBudgetCount: volumeTel.volumeDeferredDueToBudgetCount,
    validByBlogRankTop10Count,
    validByPopularBlogRankCount: validByBlogRankTop10Count,
    validByIntegratedSearchCount,
    validBySmartBlockCount,
    blogRankTop10MatchedCount: validByBlogRankTop10Count,
    outOfRankExcludedCount,
    sampleOutOfRankExcludedKeywords,
    sampleLowVolumeNearThresholdKeywords,
    integratedSearchCheckCandidateCount,
    integratedSearchCheckedCount,
    integratedSearchMatchedCount,
    smartBlockMatchedCount,
    integratedSearchEligibleCandidateCount,
    integratedSearchCheckSkippedFreshCacheCount,
    integratedSearchCheckLimit,
    sampleIntegratedSearchCandidates,
    sampleIntegratedSearchNoMatchKeywords,
    sampleIntegratedSearchMatchedKeywords,
    sampleCachedIntegratedSearchKeywords,
    cachedIntegratedSearchValidCount,
    sampleSmartBlockMatchedKeywords,
    sampleOutOfRankButIntegratedValidKeywords,
    volumeCachePrefetchCandidateCount,
    volumeCachePrefetchHitCount,
    volumeCachePrefetchUnionKeyCount,
    volumeCachePrefetchWarmBeforeFindManyCount,
    volumeCachePrefetchFindManyReturnedCount,
    volumeCachePrefetchMapEntryCount,
    volumeCacheSnapshotSyncUpsertCount,
    volumeCacheSnapshotSyncDuplicateSkipped,
    volumeCachePrefetchQueryKeysSample,
    volumeCachePrefetchReturnedKeysSample,
    volumeCacheMissSample,
    volumeLookupPlanTotalEntries,
    volumeLookupPlanConfirmedVolumeEntries,
    volumeLookupPlanRemainingUnknownEntries,
    confirmedVolumeKeywordCount: volumeLookupPlanConfirmedVolumeEntries,
    remainingVolumeUnknownKeywordCount: volumeLookupPlanRemainingUnknownEntries,
    nextVolumeLookupSampleKeywords,
    strictIncrementalVolumeLookup,
    ...(staleExposureRecheckLimitEffective != null && staleExposureRecheckLimitEffective > 0
      ? {
          staleExposureRecheckLimit: staleExposureRecheckLimitEffective,
          staleExposureRecheckCandidateCount,
          staleExposureRecheckedCount,
          staleExposureDeferredCount,
          freshExposureSkippedCount,
          exposureRankChangedCount,
          sampleExposureRankChangedKeywords,
          nextStaleExposureRecheckSampleKeywords,
        }
      : {}),
  };

  const persistableKeywords = classified
    .filter((row) => volumeDatumKnown(row) || hasExposureSignals(row))
    .sort(compareBlogtalkValidKeywordSort);

  console.log(
    "[blog-valid-keywords] summary",
    JSON.stringify({
      blogId,
      monthlyVolumeThreshold,
      validThresholdSource,
      candidateKeywordCount: candidates.length,
      volumeCheckedCount: volumeLookupAttemptedCount,
      volumeAboveThresholdCount,
      volumeBelowThresholdCount,
      exposureCheckCandidateCount,
      exposureMatchedCount,
      validKeywordCount,
      lowVolumeExcludedCount,
      rankOnlyCount,
      cacheHitWithin14DaysCount,
      refreshNeededCount,
      sampleValidKeywords: sampleValidKeywords.map((k) => k.keyword),
      sampleLowVolumeExcludedKeywords: sampleLowVolumeExcludedKeywords.map((k) => k.keyword),
      sampleVolumeAboveThresholdNoExposureKeywords: sampleVolumeAboveThresholdNoExposureKeywords.map((k) => k.keyword),
      totalPostTitleCount,
      candidateSourceCounts: sourceCounts,
      rawPostFetchCounts: batchDiagnostics?.rawPostFetchCounts,
      dedupedPostFirstSourceCounts: batchDiagnostics?.dedupedPostFirstSourceCounts,
      historicExposureKeywordSeedRows: historic.length,
      exposureSnapshotPreloadRows: preload.length,
      totalCandidateKeywordCount: candidates.length,
      volumeLookupCandidateCount,
      volumeLookupAttemptedCount,
      volumeLookupSuccessCount,
      volumeLookup429Stopped: volumeLookup429Stopped || volumeTel.searchAd429Stopped,
      rankCheckCandidateCount: rankQueue.length,
      rankCheckedCount,
      rankMatchedCount,
      hiddenRankOnlyCount,
      volumeCacheHitCount: volumeTel.volumeCacheHitCount,
      volumeCacheMissCount: volumeTel.volumeCacheMissCount,
      volumeCacheStaleCount: volumeTel.volumeCacheStaleCount,
      searchAdAttemptedCount: volumeTel.searchAdAttemptedCount,
      searchAdSuccessCount: volumeTel.searchAdSuccessCount,
      searchAd429Stopped: volumeTel.searchAd429Stopped,
      volumeAboveThresholdFromCacheCount: volumeTel.volumeAboveThresholdFromCacheCount,
      volumeAboveThresholdFromSearchAdCount: volumeTel.volumeAboveThresholdFromSearchAdCount,
      volumeDeferredDueToBudgetCount: volumeTel.volumeDeferredDueToBudgetCount,
      blogRankTop10MatchedCount: validByBlogRankTop10Count,
      validByPopularBlogRankCount: validByBlogRankTop10Count,
      outOfRankExcludedCount,
      sampleOutOfRankExcludedKeywords: sampleOutOfRankExcludedKeywords.map((k) => ({
        keyword: k.keyword,
        monthlySearchVolume: k.monthlySearchVolume ?? k.totalVolume ?? null,
        blogRank: k.blogRank ?? null,
      })),
      sampleLowVolumeNearThresholdKeywords: sampleLowVolumeNearThresholdKeywords.map((k) => ({
        keyword: k.keyword,
        monthlySearchVolume: k.monthlySearchVolume ?? k.totalVolume ?? null,
        blogRank: k.blogRank ?? null,
        integratedSearchBlock: k.integratedSearchBlock ?? null,
        smartBlockCount: k.smartBlockCount ?? null,
      })),
      validByBlogRankTop10Count,
      validByIntegratedSearchCount,
      validBySmartBlockCount,
      integratedSearchEligibleCandidateCount,
      integratedSearchCheckCandidateCount,
      integratedSearchCheckedCount,
      integratedSearchMatchedCount,
      smartBlockMatchedCount,
      integratedSearchCheckSkippedFreshCacheCount,
      integratedSearchCheckLimit,
      sampleIntegratedSearchCandidates,
      sampleIntegratedSearchNoMatchKeywords,
      sampleIntegratedSearchMatchedKeywords: sampleIntegratedSearchMatchedKeywords.map((k) => k.keyword),
      sampleCachedIntegratedSearchKeywords: sampleCachedIntegratedSearchKeywords.map((k) => k.keyword),
      cachedIntegratedSearchValidCount,
      sampleSmartBlockMatchedKeywords: sampleSmartBlockMatchedKeywords.map((k) => k.keyword),
      sampleOutOfRankButIntegratedValidKeywords: sampleOutOfRankButIntegratedValidKeywords.map((k) => k.keyword),
      volumeCachePrefetchCandidateCount,
      volumeCachePrefetchHitCount,
      volumeCachePrefetchUnionKeyCount,
      volumeCachePrefetchWarmBeforeFindManyCount,
      volumeCachePrefetchFindManyReturnedCount,
      volumeCachePrefetchMapEntryCount,
      volumeCacheSnapshotSyncUpsertCount,
      volumeCacheSnapshotSyncDuplicateSkipped,
      volumeCachePrefetchQueryKeysSample,
      volumeCachePrefetchReturnedKeysSample,
      volumeCacheMissSample,
      confirmedVolumeKeywordCount: volumeLookupPlanConfirmedVolumeEntries,
      remainingVolumeUnknownKeywordCount: volumeLookupPlanRemainingUnknownEntries,
      ...(keywordRefreshTitleListDiagnostics
        ? {
            titleListAsyncRequestCount: keywordRefreshTitleListDiagnostics.titleListAsyncRequestCount,
            titleListAsyncSuccessPages: keywordRefreshTitleListDiagnostics.titleListAsyncSuccessPages,
            titleListAsyncFailedPages: keywordRefreshTitleListDiagnostics.titleListAsyncFailedPages,
            titleListAsyncTotalParsedPosts: keywordRefreshTitleListDiagnostics.titleListAsyncTotalParsedPosts,
            titleListAsyncReportedTotalPostCount:
              keywordRefreshTitleListDiagnostics.titleListAsyncReportedTotalPostCount,
            titleListAsyncFirstError: keywordRefreshTitleListDiagnostics.titleListAsyncFirstError,
            titleListAsyncSampleTitles: keywordRefreshTitleListDiagnostics.titleListAsyncSampleTitles,
          }
        : {}),
      ...(strictIncrementalVolumeLookup
        ? {
            incrementalVolumeLookupPlan: {
              totalCandidateKeywordCount: volumeLookupPlanTotalEntries,
              confirmedVolumeKeywordCount: volumeLookupPlanConfirmedVolumeEntries,
              remainingVolumeUnknownKeywordCount: volumeLookupPlanRemainingUnknownEntries,
              searchAdAttemptedCount: volumeTel.searchAdAttemptedCount,
              searchAd429Stopped: volumeTel.searchAd429Stopped,
              nextVolumeLookupSampleKeywords,
              volumeCheckLimit,
            },
          }
        : {}),
      ...(staleExposureRecheckLimitEffective != null && staleExposureRecheckLimitEffective > 0
        ? {
            staleExposureRecheckPlan: {
              staleExposureRecheckCandidateCount,
              staleExposureRecheckLimit: staleExposureRecheckLimitEffective,
              staleExposureRecheckedCount,
              staleExposureDeferredCount,
              freshExposureSkippedCount,
              exposureRankChangedCount,
              sampleExposureRankChangedKeywords,
              nextStaleExposureRecheckSampleKeywords,
            },
          }
        : {}),
    })
  );

  return {
    validKeywords: displayValidRows,
    persistableKeywords,
    validKeywordCount,
    debug,
    dirtyNormalizedKeywordKeys: [...dirtyNormalizedKeys],
    timingsMs: { candidateBuildMs, rankCheckMs, volumeBackfillMs },
  };
}
