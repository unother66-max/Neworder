-- Baseline migration (was applied in some DBs but missing locally).
-- Goal: align expected schema with already-applied drift changes:
-- - Remove legacy columns from SmartstoreProduct
-- - Add sellerTags
-- - Drop SmartstoreKeyword(productId, sortOrder) index
-- - Rename unique constraint/index naming to default style used by Prisma

-- 1) SmartstoreKeyword: drop ordering index (created earlier)
DROP INDEX IF EXISTS "SmartstoreKeyword_productId_sortOrder_idx";

-- 2) SmartstoreProduct: remove legacy fields (if they exist)
ALTER TABLE "SmartstoreProduct"
  DROP COLUMN IF EXISTS "channelNo",
  DROP COLUMN IF EXISTS "channelUid",
  DROP COLUMN IF EXISTS "lastFetchedAt",
  DROP COLUMN IF EXISTS "rating",
  DROP COLUMN IF EXISTS "reviewCount";

-- 3) SmartstoreProduct: add sellerTags
ALTER TABLE "SmartstoreProduct"
  ADD COLUMN IF NOT EXISTS "sellerTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 4) Rename unique constraint/index name for (userId, productId, space) when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = '"SmartstoreProduct"'::regclass
      AND c.contype = 'u'
      AND c.conname = 'userId_productId_space'
  ) THEN
    EXECUTE 'ALTER TABLE "SmartstoreProduct" RENAME CONSTRAINT "userId_productId_space" TO "SmartstoreProduct_userId_productId_space_key"';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'SmartstoreProduct'
      AND indexname = 'userId_productId_space'
  ) THEN
    EXECUTE 'ALTER INDEX "userId_productId_space" RENAME TO "SmartstoreProduct_userId_productId_space_key"';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

