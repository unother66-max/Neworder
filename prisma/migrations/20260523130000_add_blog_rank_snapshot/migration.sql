-- CreateTable
CREATE TABLE "BlogRankSnapshot" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "overallRank" INTEGER,
    "topicRank" INTEGER,
    "officialBlogTopic" TEXT,
    "totalBlogsCount" INTEGER NOT NULL,
    "topicBlogsCount" INTEGER,
    "rankSource" TEXT NOT NULL DEFAULT 'postlabs',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogRankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogRankSnapshot_blogId_idx" ON "BlogRankSnapshot"("blogId");

-- CreateIndex
CREATE INDEX "BlogRankSnapshot_blogId_calculatedAt_idx" ON "BlogRankSnapshot"("blogId", "calculatedAt");

-- CreateIndex
CREATE INDEX "BlogRankSnapshot_overallRank_idx" ON "BlogRankSnapshot"("overallRank");

-- CreateIndex
CREATE INDEX "BlogRankSnapshot_officialBlogTopic_topicRank_idx" ON "BlogRankSnapshot"("officialBlogTopic", "topicRank");

-- CreateIndex
CREATE INDEX "BlogRankSnapshot_rankSource_calculatedAt_idx" ON "BlogRankSnapshot"("rankSource", "calculatedAt");
