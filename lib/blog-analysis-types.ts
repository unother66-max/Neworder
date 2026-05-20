/** PostTitleListAsync 수집 진단 — keyword-refresh 로그·디버그용 */
export type BlogPostTitleListFetchDiagnostics = {
  titleListAsyncRequestCount: number;
  titleListAsyncSuccessPages: number;
  titleListAsyncFailedPages: number;
  titleListAsyncTotalParsedPosts: number;
  /** 첫 성공 응답의 totalCount(있으면) */
  titleListAsyncReportedTotalPostCount: number | null;
  titleListAsyncFirstError: string | null;
  titleListAsyncSampleTitles: string[];
};

export interface BlogAnalysisRecentPost {
  title: string;
  url: string;
  createdAt?: string | null;
  thumbnail?: string | null;
  description?: string | null;

  postKey?: string | null;
  logNo?: string | null;
  orgUrl?: string | null;
  publishedAt?: string | null;
  wordCount?: number | null;
  imageCount?: number | null;
  videoCount?: number | null;
  commentCount?: number | null;
  sympathyCount?: number | null;
  likeCount?: number | null;
  shareCount?: number | null;
  titleScore?: number | null;
  contentLengthScore?: number | null;
  imageScore?: number | null;
  score?: number | null;
  potentialScore?: number | null;
  postScore?: number | null;
  reactivityScore?: number | null;
  relatednessScore?: number | null;
  postLevel?: number | string | null;
  exposureStatus?: string | null;
  foundOnSearch?: boolean | null;
  keywordAnalyzedAt?: string | null;
  /** RSS 등에서 추출한 태그 문자열 목록 */
  tags?: string[] | null;
};

/** 블로그 검색 노출 + 검색량 조합 기준 분류 (블톡 공지 정렬) */
export type BlogKeywordValidationStatus =
  | "valid"
  | "rank_only"
  | "volume_only"
  | "out_of_rank"
  | "low_volume"
  | "unchecked";

export type BlogValidKeyword = {
  keyword: string;
  totalVolume?: number | null;
  mobileVolume?: number | null;
  pcVolume?: number | null;
  /** 검색 노출·월간 검색량 확정 상태 */
  keywordValidationStatus?: BlogKeywordValidationStatus | null;
  exposureType?: string | null;
  integratedSearchRank?: number | null;
  integratedSearchBlock?: string | null;
  smartBlockCount?: number | null;
  blogRank?: number | null;
  monthlySearchVolume?: number | null;
  contentSaturation?: number | null;
  sourcePostUrl?: string | null;
  sourcePostTitle?: string | null;
  checkedAt?: string | null;
};

export interface BlogKeywordInsight {
  keyword: string;
  totalVolume: number | null;
  mobileVolume: number | null;
  pcVolume: number | null;
  keywordScore: number;
  matchedPostCount: number;
  lastAppearedAt: string | null;
  competitionLevel: "낮음" | "보통" | "높음";
}

/** 순위 변동 차트용 분석 히스토리 포인트 */
export type BlogAnalysisHistoryPoint = {
  analyzedAt: string;
  totalRank?: number | null;
  topicRank?: number | null;
  validKeywordCount?: number | null;
  totalScore?: number | null;
  visitorCount?: number | null;
  postCount?: number | null;
  subscriberCount?: number | null;
};

/** 네이버 방문자 그래프 원본 일자별 포인트 */
export type BlogVisitorChartPoint = {
  date: string;
  label: string;
  visitorCount: number;
  rawDate?: string | null;
  source?: "naver" | string;
};

/** 최근 포스팅(본문 샘플) 기반 패턴 평균·점수 */
export type BlogPostPatternAnalysis = {
  averageTitleLength?: number | null;
  averageContentLength?: number | null;
  averageImageCount?: number | null;
  titleLengthScore?: number | null;
  contentLengthScore?: number | null;
  imageCountScore?: number | null;
};

/** 동일 추정 주제(blogTopic) 기준 서비스 내 히스토리 평균과 내 스냅샷 비교 */
export type BlogTopicAverageComparison = {
  topic?: string | null;
  sampleCount: number;
  averageTotalScore?: number | null;
  averageValidKeywordCount?: number | null;
  averageVisitorCount?: number | null;
  averagePostingFrequency?: number | null;
  averageTitleLength?: number | null;
  averageContentLength?: number | null;
  averageImageCount?: number | null;
  myTotalScore?: number | null;
  myValidKeywordCount?: number | null;
  myVisitorCount?: number | null;
  myPostingFrequency?: number | null;
  myAverageTitleLength?: number | null;
  myAverageContentLength?: number | null;
  myAverageImageCount?: number | null;
};

/** `/api/blog-analysis` 성능 분해 (기본 분석 fast path용) */
export type BlogAnalysisPerformanceMeta = {
  totalMs: number;
  profileMs: number;
  visitorMs: number;
  patternMs: number;
  cachedKeywordMs: number;
  newRankCheckMs: number;
  volumeBackfillMs: number;
  usedCachedKeywordCount: number;
  newRankCheckLimit: number;
  volumeBackfillLimit: number;
  skippedHeavyKeywordRefresh: boolean;
};

export type BlogAnalysisSavedListItem = {
  id?: string;
  blogId: string;
  nickname: string | null;
  blogName: string | null;
  profileImage: string | null;
  blogTopic: string | null;
  validKeywordCount: number | null;
  analyzedAt: string;
  totalRank: number | null;
  topicRank: number | null;
  level: number | null;
  grade: string | null;
  isPinned: boolean;
  autoTracking: boolean;
};

export type BlogAnalysisResult = {
  nickname: string;
  blogId: string;
  visitor: number | null;
  totalVisitor: number;
  totalVisitCount?: number | null;
  visitorChartData?: BlogVisitorChartPoint[];
  recentPosts?: BlogAnalysisRecentPost[];
  profileImage?: string | null;
  postCount?: number | null;
  scrapCount?: number | null;
  postingFrequency?: number | null;
  subscriberCount?: number | null;
  validKeywordCount?: number | null;
  validKeywords?: BlogValidKeyword[];
  representativeValidKeywords?: BlogValidKeyword[];
  keywordInsights?: BlogKeywordInsight[];
  blogTopic?: string | null;
  /** PostLabs 자체 누적 분석 기준 전체 순위. 네이버 공식 순위가 아니며 스냅샷 도입 전에는 null. */
  totalRank?: number | null;
  /** PostLabs 자체 누적 분석 기준 동일 공식 블로그 주제 내 순위. 스냅샷 도입 전에는 null. */
  topicRank?: number | null;
  totalBlogsCount?: number | null;
  topicBlogsCount?: number | null;
  rankSource?: "postlabs" | string | null;
  rankSourceLabel?: string | null;
  analyzedAt?: string | null;
  patternAnalysis?: BlogPostPatternAnalysis | null;
  topicAverageComparison?: BlogTopicAverageComparison | null;
  /** 서버에서만 채워지며, 클라이언트 타입 호환용 optional */
  performance?: BlogAnalysisPerformanceMeta | null;

  /** 자동 keyword-refresh 판단용 (기본 분석만 호출 시 설정; 무거운 갱신은 하지 않음) */
  keywordRefreshNeeded?: boolean;
  /** 가장 최근 BlogKeywordExposureSnapshot.checkedAt 기준 경과 일수, 없으면 null */
  keywordCacheAgeDays?: number | null;
  /** 스냅샷 중 가장 늦은 checkedAt ISO 문자열, 없으면 null */
  latestKeywordCheckedAt?: string | null;
  /** DB 노출 스냅샷 행 수 (= 후보 캐시 행 수) */
  usedCachedKeywordCount?: number;

  /** PostTitleListAsync 추가 로드용 (기본 분석 첫 응답) */
  recentPostsPagination?: {
    nextTitleListPage: number;
    pageSize: number;
    hasMore: boolean;
    totalCount: number | null;
  };
};
