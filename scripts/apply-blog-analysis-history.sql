CREATE TABLE IF NOT EXISTS "BlogAnalysisHistory" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "blogId" TEXT NOT NULL,
  "blogName" TEXT,
  "nickname" TEXT,
  "profileImage" TEXT,
  "blogTopic" TEXT,
  "visitorCount" INTEGER,
  "postCount" INTEGER,
  "subscriberCount" INTEGER,
  "postingFrequency" DOUBLE PRECISION,
  "validKeywordCount" INTEGER,
  "level" INTEGER,
  "grade" TEXT,
  "totalScore" DOUBLE PRECISION,
  "influenceScore" DOUBLE PRECISION,
  "keywordInfluenceScore" DOUBLE PRECISION,
  "contentInfluenceScore" DOUBLE PRECISION,
  "totalRank" INTEGER,
  "topicRank" INTEGER,
  "averageTitleLength" DOUBLE PRECISION,
  "averageContentLength" DOUBLE PRECISION,
  "averageImageCount" DOUBLE PRECISION,
  "titleLengthScore" DOUBLE PRECISION,
  "contentLengthScore" DOUBLE PRECISION,
  "imageCountScore" DOUBLE PRECISION,
  "analyzedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "BlogAnalysisHistory_blogId_idx"
ON "BlogAnalysisHistory"("blogId");

CREATE INDEX IF NOT EXISTS "BlogAnalysisHistory_blogTopic_idx"
ON "BlogAnalysisHistory"("blogTopic");

CREATE INDEX IF NOT EXISTS "BlogAnalysisHistory_totalScore_idx"
ON "BlogAnalysisHistory"("totalScore");

CREATE INDEX IF NOT EXISTS "BlogAnalysisHistory_analyzedAt_idx"
ON "BlogAnalysisHistory"("analyzedAt");

CREATE INDEX IF NOT EXISTS "BlogAnalysisHistory_blogTopic_totalScore_idx"
ON "BlogAnalysisHistory"("blogTopic", "totalScore");

CREATE INDEX IF NOT EXISTS "BlogAnalysisHistory_userId_idx"
ON "BlogAnalysisHistory"("userId");