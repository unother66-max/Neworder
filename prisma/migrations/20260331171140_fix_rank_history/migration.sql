/*
  Warnings:

  - You are about to drop the `PlaceRankHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PlaceRankHistory" DROP CONSTRAINT "PlaceRankHistory_placeKeywordId_fkey";

-- DropTable
DROP TABLE "PlaceRankHistory";

-- CreateTable
CREATE TABLE "RankHistory" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RankHistory" ADD CONSTRAINT "RankHistory_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
