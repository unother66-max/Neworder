ALTER TABLE "SmartstoreReviewTarget"
ADD COLUMN "reviewProductId" TEXT;

CREATE INDEX "SmartstoreReviewTarget_reviewProductId_idx"
ON "SmartstoreReviewTarget"("reviewProductId");
