-- 스마트스토어 상품 썸네일 전용 컬럼 (등록 시 API 1회 fetch 결과 저장)
DO $$
BEGIN
  IF to_regclass('"SmartstoreProduct"') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "thumbnailLink" TEXT;

  UPDATE "SmartstoreProduct"
  SET "thumbnailLink" = "imageUrl"
  WHERE "thumbnailLink" IS NULL AND "imageUrl" IS NOT NULL;
END $$;
