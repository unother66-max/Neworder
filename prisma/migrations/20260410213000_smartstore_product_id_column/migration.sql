-- Prisma 스키마의 productId 컬럼이 DB에 없을 때 (예: 예전 naverProductId 컬럼명, 또는 db push 누락)
-- P2022: column SmartstoreProduct.productId does not exist

-- NOTE: shadow DB(빈 DB)에서는 SmartstoreProduct가 아직 없을 수 있으므로 존재할 때만 실행
DO $$
BEGIN
  IF to_regclass('"SmartstoreProduct"') IS NULL THEN
    RETURN;
  END IF;

  -- 1) 예전 컬럼명이 naverProductId면 productId로 변경
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SmartstoreProduct' AND column_name = 'naverProductId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'SmartstoreProduct' AND column_name = 'productId'
  ) THEN
    ALTER TABLE "SmartstoreProduct" RENAME COLUMN "naverProductId" TO "productId";
  END IF;

  -- 2) 컬럼이 아직 없으면 추가
  ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "productId" TEXT;

  -- 3) productUrl에서 숫자 상품 ID 추출해 채움
  UPDATE "SmartstoreProduct"
  SET "productId" = (regexp_match("productUrl", '/products/(\d+)', 'i'))[1]
  WHERE ("productId" IS NULL OR BTRIM("productId") = '')
    AND "productUrl" ~* '/products/[0-9]+';

  -- 4) URL에서 못 뽑은 행은 임시 값 (NOT NULL 제약용)
  UPDATE "SmartstoreProduct"
  SET "productId" = 'legacy-' || "id"
  WHERE "productId" IS NULL OR BTRIM("productId") = '';

  -- 5) NOT NULL
  ALTER TABLE "SmartstoreProduct" ALTER COLUMN "productId" SET NOT NULL;

  -- 6) 예전 unique(userId, productUrl) 제거 후 (있을 때만) userId+productId 유니크
  ALTER TABLE "SmartstoreProduct" DROP CONSTRAINT IF EXISTS "SmartstoreProduct_userId_productUrl_key";

  CREATE UNIQUE INDEX IF NOT EXISTS "SmartstoreProduct_userId_productId_key" ON "SmartstoreProduct" ("userId", "productId");
END $$;
