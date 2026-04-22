-- Add sortOrder column for keyword ordering (safe re-run)
ALTER TABLE "SmartstoreKeyword"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Optional index for common ordering/filtering (safe re-run)
CREATE INDEX IF NOT EXISTS "SmartstoreKeyword_productId_sortOrder_idx"
ON "SmartstoreKeyword" ("productId", "sortOrder");

