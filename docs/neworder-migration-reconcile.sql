-- Data-preserving reconciliation for databases where NewOrder schema changes
-- were previously applied with prisma db push. Do not use force-reset.

BEGIN;

-- 20260611120000_neworder_purchase_list
ALTER TABLE "NewOrderPriceCandidate"
  ADD COLUMN IF NOT EXISTS "mallName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "savedBy" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "isCurrentBest" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "NewOrderPriceCandidate_itemId_isCurrentBest_idx"
ON "NewOrderPriceCandidate"("itemId", "isCurrentBest");

CREATE UNIQUE INDEX IF NOT EXISTS "NewOrderPriceCandidate_one_current_per_item"
ON "NewOrderPriceCandidate"("itemId")
WHERE "isCurrentBest" = true;

-- 20260611150000_neworder_search_accuracy
ALTER TABLE "NewOrderItem"
  ADD COLUMN IF NOT EXISTS "requiredKeywords"
    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "optionalKeywords"
    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "preferredKeywords"
    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "NewOrderItem"
SET
  "requiredKeywords" = COALESCE("requiredKeywords", ARRAY[]::TEXT[]),
  "optionalKeywords" = COALESCE("optionalKeywords", ARRAY[]::TEXT[]),
  "preferredKeywords" = COALESCE("preferredKeywords", ARRAY[]::TEXT[])
WHERE
  "requiredKeywords" IS NULL
  OR "optionalKeywords" IS NULL
  OR "preferredKeywords" IS NULL;

ALTER TABLE "NewOrderItem"
  ALTER COLUMN "requiredKeywords" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "requiredKeywords" SET NOT NULL,
  ALTER COLUMN "optionalKeywords" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "optionalKeywords" SET NOT NULL,
  ALTER COLUMN "preferredKeywords" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "preferredKeywords" SET NOT NULL;

-- 20260612113000_neworder_price_candidate_soft_delete
ALTER TABLE "NewOrderPriceCandidate"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;

CREATE INDEX IF NOT EXISTS "NewOrderPriceCandidate_deletedAt_idx"
ON "NewOrderPriceCandidate"("deletedAt");

COMMIT;
