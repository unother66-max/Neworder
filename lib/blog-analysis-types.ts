export interface BlogAnalysisRecentPost {
  title: string;
  url: string;
  createdAt?: string | null;
  thumbnail?: string | null;

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
  analyzedAt?: string | null;
  patternAnalysis?: BlogPostPatternAnalysis | null;
  topicAverageComparison?: BlogTopicAverageComparison | null;
};
