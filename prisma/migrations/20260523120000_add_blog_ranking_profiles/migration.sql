-- CreateTable
CREATE TABLE "BlogProfile" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "blogUrl" TEXT,
    "blogName" TEXT,
    "nickname" TEXT,
    "profileImage" TEXT,
    "officialBlogTopic" TEXT,
    "postCount" INTEGER,
    "scrapCount" INTEGER,
    "neighborCount" INTEGER,
    "postingFrequency" DOUBLE PRECISION,
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogMetricSnapshot" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "influenceScore" DOUBLE PRECISION,
    "keywordInfluenceScore" DOUBLE PRECISION,
    "contentInfluenceScore" DOUBLE PRECISION,
    "validKeywordCount" INTEGER,
    "recentActivityScore" DOUBLE PRECISION,
    "avgWordCount" DOUBLE PRECISION,
    "avgImageCount" DOUBLE PRECISION,
    "avgVideoCount" DOUBLE PRECISION,
    "avgCommentCount" DOUBLE PRECISION,
    "avgSympathyCount" DOUBLE PRECISION,
    "avgShareCount" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogProfile_blogId_key" ON "BlogProfile"("blogId");

-- CreateIndex
CREATE INDEX "BlogProfile_officialBlogTopic_idx" ON "BlogProfile"("officialBlogTopic");

-- CreateIndex
CREATE INDEX "BlogProfile_lastAnalyzedAt_idx" ON "BlogProfile"("lastAnalyzedAt");

-- CreateIndex
CREATE INDEX "BlogMetricSnapshot_blogId_idx" ON "BlogMetricSnapshot"("blogId");

-- CreateIndex
CREATE INDEX "BlogMetricSnapshot_blogId_analyzedAt_idx" ON "BlogMetricSnapshot"("blogId", "analyzedAt");

-- CreateIndex
CREATE INDEX "BlogMetricSnapshot_totalScore_idx" ON "BlogMetricSnapshot"("totalScore");

-- CreateIndex
CREATE INDEX "BlogMetricSnapshot_analyzedAt_idx" ON "BlogMetricSnapshot"("analyzedAt");
