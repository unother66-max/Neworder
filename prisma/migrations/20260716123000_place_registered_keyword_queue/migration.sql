ALTER TABLE "PlaceRegisteredKeywordCache"
ADD COLUMN "placeName" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "businessType" TEXT,
ADD COLUMN "x" TEXT,
ADD COLUMN "y" TEXT,
ADD COLUMN "queueStatus" TEXT NOT NULL DEFAULT 'IDLE',
ADD COLUMN "queuedAt" TIMESTAMP(3),
ADD COLUMN "processingStartedAt" TIMESTAMP(3);

CREATE INDEX "PlaceRegisteredKeywordCache_queueStatus_queuedAt_idx"
ON "PlaceRegisteredKeywordCache"("queueStatus", "queuedAt");
