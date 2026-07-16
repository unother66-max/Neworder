-- Preserve successful Kakao keyword diagnostics without overloading rank=0.
ALTER TABLE "PlaceKeyword"
ADD COLUMN "volumeStatus" TEXT,
ADD COLUMN "volumeDebugReason" TEXT;

ALTER TABLE "RankHistory"
ADD COLUMN "source" TEXT,
ADD COLUMN "resultStatus" TEXT,
ADD COLUMN "rankLabel" TEXT,
ADD COLUMN "checkedCount" INTEGER,
ADD COLUMN "pageNum" INTEGER,
ADD COLUMN "position" INTEGER,
ADD COLUMN "matchedId" TEXT,
ADD COLUMN "debugReason" TEXT;

CREATE INDEX "RankHistory_placeId_keyword_source_createdAt_idx"
ON "RankHistory"("placeId", "keyword", "source", "createdAt");
