-- Place: columns that existed in schema but were never added to migration history (post-reset drift fix)
-- KakaoRankHistory: full table (was missing from migrations)

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "rankPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rankPinnedAt" TIMESTAMP(3),
ADD COLUMN     "kakaoAutoTracking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placeMonthlyVolume" INTEGER DEFAULT 0,
ADD COLUMN     "placeMobileVolume" INTEGER DEFAULT 0,
ADD COLUMN     "placePcVolume" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "KakaoRankHistory" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "searchAll" INTEGER,
    "searchCat" INTEGER,
    "directionAll" INTEGER,
    "directionCat" INTEGER,
    "favoriteAll" INTEGER,
    "favoriteCat" INTEGER,
    "shareAll" INTEGER,
    "shareCat" INTEGER,
    "trackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KakaoRankHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KakaoRankHistory_placeId_idx" ON "KakaoRankHistory"("placeId");

-- AddForeignKey
ALTER TABLE "KakaoRankHistory" ADD CONSTRAINT "KakaoRankHistory_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
