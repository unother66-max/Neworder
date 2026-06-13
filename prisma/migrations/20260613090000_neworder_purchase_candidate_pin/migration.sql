ALTER TABLE "NewOrderPriceCandidate"
ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "NewOrderPriceCandidate_isPinned_pinnedAt_idx"
ON "NewOrderPriceCandidate"("isPinned", "pinnedAt");
