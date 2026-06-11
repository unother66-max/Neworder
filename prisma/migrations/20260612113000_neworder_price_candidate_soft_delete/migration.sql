ALTER TABLE "NewOrderPriceCandidate"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedBy" TEXT;

CREATE INDEX "NewOrderPriceCandidate_deletedAt_idx"
ON "NewOrderPriceCandidate"("deletedAt");
