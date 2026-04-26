-- DropForeignKey
ALTER TABLE "SmartstoreRecentReview" DROP CONSTRAINT "SmartstoreRecentReview_productId_fkey";

-- DropForeignKey
ALTER TABLE "SmartstoreReviewHistory" DROP CONSTRAINT "SmartstoreReviewHistory_productId_fkey";

-- DropForeignKey
ALTER TABLE "SmartstoreReviewTarget" DROP CONSTRAINT "SmartstoreReviewTarget_productId_fkey";

-- DropIndex
DROP INDEX "SmartstoreRecentReview_productId_idx";

-- DropIndex
DROP INDEX "SmartstoreRecentReview_productId_reviewKey_key";

-- DropIndex
DROP INDEX "SmartstoreReviewHistory_productId_idx";

-- DropIndex
DROP INDEX "SmartstoreReviewHistory_productId_trackedDate_key";

-- AlterTable
ALTER TABLE "SmartstoreProduct" DROP COLUMN "reviewCount",
DROP COLUMN "reviewMonthlyUseCount",
DROP COLUMN "reviewPhotoVideoCount",
DROP COLUMN "reviewRating",
DROP COLUMN "reviewRepurchaseCount",
DROP COLUMN "reviewStarSummary",
DROP COLUMN "reviewStorePickCount";

-- AlterTable
ALTER TABLE "SmartstoreRecentReview" DROP COLUMN "productId",
ADD COLUMN     "targetId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SmartstoreReviewHistory" DROP COLUMN "productId",
ADD COLUMN     "targetId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SmartstoreReviewTarget" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "productUrl" TEXT NOT NULL,
ADD COLUMN     "reviewCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewMonthlyUseCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewPhotoVideoCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewRating" DOUBLE PRECISION,
ADD COLUMN     "reviewRepurchaseCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewStarSummary" JSONB,
ADD COLUMN     "reviewStorePickCount" INTEGER DEFAULT 0,
ADD COLUMN     "storeName" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "SmartstoreRecentReview_targetId_idx" ON "SmartstoreRecentReview"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartstoreRecentReview_targetId_reviewKey_key" ON "SmartstoreRecentReview"("targetId", "reviewKey");

-- CreateIndex
CREATE INDEX "SmartstoreReviewHistory_targetId_idx" ON "SmartstoreReviewHistory"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartstoreReviewHistory_targetId_trackedDate_key" ON "SmartstoreReviewHistory"("targetId", "trackedDate");

-- AddForeignKey
ALTER TABLE "SmartstoreReviewHistory" ADD CONSTRAINT "SmartstoreReviewHistory_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "SmartstoreReviewTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartstoreRecentReview" ADD CONSTRAINT "SmartstoreRecentReview_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "SmartstoreReviewTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

