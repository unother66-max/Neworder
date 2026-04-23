-- Add SmartstoreSpace enum + space column to split products by page.

DO $$ BEGIN
  CREATE TYPE "SmartstoreSpace" AS ENUM ('NAVER_PRICE', 'PLUS_STORE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SmartstoreProduct"
  ADD COLUMN IF NOT EXISTS "space" "SmartstoreSpace" NOT NULL DEFAULT 'NAVER_PRICE';

-- Drop old unique constraint/index (name may vary by environment).
ALTER TABLE "SmartstoreProduct" DROP CONSTRAINT IF EXISTS "userId_productId";
ALTER TABLE "SmartstoreProduct" DROP CONSTRAINT IF EXISTS "SmartstoreProduct_userId_productId_key";

DROP INDEX IF EXISTS "SmartstoreProduct_userId_productId_key";

-- Some environments may have a differently named UNIQUE constraint/index on ("userId","productId").
-- Drop any UNIQUE constraint/index whose definition matches exactly those 2 columns (without "space").
DO $$
DECLARE
  r RECORD;
BEGIN
  -- constraints
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = '"SmartstoreProduct"'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE '%("userId", "productId")%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%"space"%'
  LOOP
    EXECUTE format('ALTER TABLE "SmartstoreProduct" DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  -- indexes
  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'SmartstoreProduct'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef LIKE '%("userId", "productId")%'
      AND indexdef NOT LIKE '%"space"%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
  END LOOP;
END $$;

-- New unique by (userId, productId, space)
DO $$ BEGIN
  ALTER TABLE "SmartstoreProduct"
    ADD CONSTRAINT "userId_productId_space" UNIQUE ("userId", "productId", "space");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SmartstoreProduct_userId_space_idx"
  ON "SmartstoreProduct"("userId", "space");

