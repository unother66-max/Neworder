-- AlterTable
ALTER TABLE "SmartstoreProduct" ADD COLUMN     "reviewCount" INTEGER DEFAULT 0,
ADD COLUMN     "reviewRating" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SmartstoreReviewTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartstoreReviewTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartstoreReviewHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "trackedDate" TEXT NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "reviewRating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartstoreReviewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartstoreRecentReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reviewKey" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "author" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartstoreRecentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmartstoreReviewTarget_userId_idx" ON "SmartstoreReviewTarget"("userId");

-- CreateIndex
CREATE INDEX "SmartstoreReviewTarget_productId_idx" ON "SmartstoreReviewTarget"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartstoreReviewTarget_userId_productId_key" ON "SmartstoreReviewTarget"("userId", "productId");

-- CreateIndex
CREATE INDEX "SmartstoreReviewHistory_productId_idx" ON "SmartstoreReviewHistory"("productId");

-- CreateIndex
CREATE INDEX "SmartstoreReviewHistory_trackedDate_idx" ON "SmartstoreReviewHistory"("trackedDate");

-- CreateIndex
CREATE UNIQUE INDEX "SmartstoreReviewHistory_productId_trackedDate_key" ON "SmartstoreReviewHistory"("productId", "trackedDate");

-- CreateIndex
CREATE INDEX "SmartstoreRecentReview_productId_idx" ON "SmartstoreRecentReview"("productId");

-- CreateIndex
CREATE INDEX "SmartstoreRecentReview_createdAt_idx" ON "SmartstoreRecentReview"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmartstoreRecentReview_productId_reviewKey_key" ON "SmartstoreRecentReview"("productId", "reviewKey");

-- AddForeignKey
ALTER TABLE "SmartstoreReviewTarget" ADD CONSTRAINT "SmartstoreReviewTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartstoreReviewTarget" ADD CONSTRAINT "SmartstoreReviewTarget_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SmartstoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartstoreReviewHistory" ADD CONSTRAINT "SmartstoreReviewHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SmartstoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartstoreRecentReview" ADD CONSTRAINT "SmartstoreRecentReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SmartstoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
