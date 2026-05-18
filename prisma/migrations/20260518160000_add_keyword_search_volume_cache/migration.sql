-- CreateTable
CREATE TABLE "KeywordSearchVolumeCache" (
    "id" TEXT NOT NULL,
    "keyword" VARCHAR(512) NOT NULL,
    "normalizedKeyword" VARCHAR(512) NOT NULL,
    "monthlyPcQcCnt" INTEGER,
    "monthlyMobileQcCnt" INTEGER,
    "totalVolume" INTEGER NOT NULL,
    "belowThreshold" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'naver-searchad',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "KeywordSearchVolumeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeywordSearchVolumeCache_normalizedKeyword_key" ON "KeywordSearchVolumeCache"("normalizedKeyword");

-- CreateIndex
CREATE INDEX "KeywordSearchVolumeCache_checkedAt_idx" ON "KeywordSearchVolumeCache"("checkedAt");
