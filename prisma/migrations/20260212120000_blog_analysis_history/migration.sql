-- CreateTable
CREATE TABLE "BlogAnalysisHistory" (
    "id" TEXT NOT NULL,
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
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogAnalysisHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogAnalysisHistory_blogId_idx" ON "BlogAnalysisHistory"("blogId");

-- CreateIndex
CREATE INDEX "BlogAnalysisHistory_blogTopic_idx" ON "BlogAnalysisHistory"("blogTopic");

-- CreateIndex
CREATE INDEX "BlogAnalysisHistory_totalScore_idx" ON "BlogAnalysisHistory"("totalScore");

-- CreateIndex
CREATE INDEX "BlogAnalysisHistory_analyzedAt_idx" ON "BlogAnalysisHistory"("analyzedAt");

-- CreateIndex
CREATE INDEX "BlogAnalysisHistory_blogTopic_totalScore_idx" ON "BlogAnalysisHistory"("blogTopic", "totalScore");

-- AddForeignKey
ALTER TABLE "BlogAnalysisHistory" ADD CONSTRAINT "BlogAnalysisHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
