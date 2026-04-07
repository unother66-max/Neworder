-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "jibunAddress" TEXT,
ADD COLUMN     "reviewAutoTracking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "x" TEXT,
ADD COLUMN     "y" TEXT;

-- CreateTable
CREATE TABLE "PlaceReviewHistory" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "trackedDate" TEXT NOT NULL,
    "totalReviewCount" INTEGER NOT NULL,
    "visitorReviewCount" INTEGER NOT NULL,
    "blogReviewCount" INTEGER NOT NULL,
    "saveCount" TEXT NOT NULL,
    "keywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceReviewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceReviewHistory_placeId_idx" ON "PlaceReviewHistory"("placeId");

-- CreateIndex
CREATE INDEX "PlaceReviewHistory_trackedDate_idx" ON "PlaceReviewHistory"("trackedDate");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceReviewHistory_placeId_trackedDate_key" ON "PlaceReviewHistory"("placeId", "trackedDate");

-- CreateIndex
CREATE INDEX "Place_userId_idx" ON "Place"("userId");

-- CreateIndex
CREATE INDEX "PlaceKeyword_placeId_idx" ON "PlaceKeyword"("placeId");

-- CreateIndex
CREATE INDEX "RankHistory_placeId_idx" ON "RankHistory"("placeId");

-- AddForeignKey
ALTER TABLE "PlaceReviewHistory" ADD CONSTRAINT "PlaceReviewHistory_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
