-- CreateTable
CREATE TABLE "PlaceRankTop300Snapshot" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "rankedPlaceIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceRankTop300Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceRankTop300Snapshot_keyword_snapshotDate_key"
ON "PlaceRankTop300Snapshot"("keyword", "snapshotDate");
