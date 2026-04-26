-- AlterTable
ALTER TABLE "SmartstoreProduct" ADD COLUMN     "reviewMonthlyUseCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewPhotoVideoCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewRepurchaseCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewStarSummary" JSONB,
ADD COLUMN     "reviewStorePickCount" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "SmartstoreReviewHistory" ADD COLUMN     "reviewMonthlyUseCount" INTEGER,
ADD COLUMN     "reviewPhotoVideoCount" INTEGER,
ADD COLUMN     "reviewRepurchaseCount" INTEGER,
ADD COLUMN     "reviewStarSummary" JSONB,
ADD COLUMN     "reviewStorePickCount" INTEGER;
