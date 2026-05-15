export type BlogAnalysisRecentPost = {
  title: string;
  url: string;
  createdAt?: string | null;
  thumbnail?: string | null;
};

export type BlogValidKeyword = {
  keyword: string;
  totalVolume?: number | null;
  mobileVolume?: number | null;
  pcVolume?: number | null;
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
  recentPosts?: BlogAnalysisRecentPost[];
  profileImage?: string | null;
  postCount?: number | null;
  postingFrequency?: number | null;
  subscriberCount?: number | null;
  validKeywordCount?: number | null;
  validKeywords?: BlogValidKeyword[];
  keywordInsights?: BlogKeywordInsight[];
  blogTopic?: string | null;
  /** 우리 서비스 DB 히스토리 기준 전체 순위 */
  totalRank?: number | null;
  /** 동일 블로그 주제(기타 제외) 내 순위 */
  topicRank?: number | null;
  analyzedAt?: string | null;
  patternAnalysis?: BlogPostPatternAnalysis | null;
  topicAverageComparison?: BlogTopicAverageComparison | null;
};
