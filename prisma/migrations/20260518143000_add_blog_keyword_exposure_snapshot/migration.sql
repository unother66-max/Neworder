-- CreateTable
CREATE TABLE "BlogKeywordExposureSnapshot" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "exposureType" TEXT,
    "integratedSearchRank" INTEGER,
    "integratedSearchBlock" TEXT,
    "smartBlockCount" INTEGER,
    "blogRank" INTEGER,
    "monthlySearchVolume" INTEGER,
    "mobileSearchVolume" INTEGER,
    "pcSearchVolume" INTEGER,
    "contentSaturation" DOUBLE PRECISION,
    "sourcePostUrl" TEXT,
    "sourcePostTitle" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogKeywordExposureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogKeywordExposureSnapshot_blogId_keyword_key" ON "BlogKeywordExposureSnapshot"("blogId", "keyword");

-- CreateIndex
CREATE INDEX "BlogKeywordExposureSnapshot_blogId_idx" ON "BlogKeywordExposureSnapshot"("blogId");

-- CreateIndex
CREATE INDEX "BlogKeywordExposureSnapshot_blogId_checkedAt_idx" ON "BlogKeywordExposureSnapshot"("blogId", "checkedAt");

-- CreateIndex
CREATE INDEX "BlogKeywordExposureSnapshot_exposureType_idx" ON "BlogKeywordExposureSnapshot"("exposureType");

-- CreateIndex
CREATE INDEX "BlogKeywordExposureSnapshot_blogRank_idx" ON "BlogKeywordExposureSnapshot"("blogRank");

-- CreateIndex
CREATE INDEX "BlogKeywordExposureSnapshot_monthlySearchVolume_idx" ON "BlogKeywordExposureSnapshot"("monthlySearchVolume");
