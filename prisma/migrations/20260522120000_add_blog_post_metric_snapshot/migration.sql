-- CreateTable
CREATE TABLE "BlogPostMetricSnapshot" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "postKey" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "orgUrl" TEXT,
    "logNo" TEXT,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "thumbnail" TEXT,
    "wordCount" INTEGER,
    "imageCount" INTEGER,
    "videoCount" INTEGER,
    "commentCount" INTEGER,
    "sympathyCount" INTEGER,
    "shareCount" INTEGER,
    "titleScore" DOUBLE PRECISION,
    "contentLengthScore" DOUBLE PRECISION,
    "imageScore" DOUBLE PRECISION,
    "potentialScore" DOUBLE PRECISION,
    "reactivityScore" DOUBLE PRECISION,
    "relatednessScore" DOUBLE PRECISION,
    "postLevel" INTEGER,
    "exposureStatus" TEXT,
    "foundOnSearch" BOOLEAN,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPostMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPostMetricSnapshot_blogId_postKey_key" ON "BlogPostMetricSnapshot"("blogId", "postKey");

-- CreateIndex
CREATE INDEX "BlogPostMetricSnapshot_blogId_idx" ON "BlogPostMetricSnapshot"("blogId");

-- CreateIndex
CREATE INDEX "BlogPostMetricSnapshot_blogId_publishedAt_idx" ON "BlogPostMetricSnapshot"("blogId", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogPostMetricSnapshot_blogId_analyzedAt_idx" ON "BlogPostMetricSnapshot"("blogId", "analyzedAt");

-- CreateIndex
CREATE INDEX "BlogPostMetricSnapshot_exposureStatus_idx" ON "BlogPostMetricSnapshot"("exposureStatus");
