-- 컬럼이 이미 있으면(db push 등) 스킵 — 재적용·부분 적용 모두 안전
-- NOTE: 이 마이그레이션은 SmartstoreProduct 테이블 생성(초기 스키마)보다 앞 타임스탬프라
-- shadow DB(빈 DB)에 적용될 때 테이블이 아직 없을 수 있습니다.
-- to_regclass로 테이블 존재를 확인한 뒤에만 ALTER를 실행하여 migrate dev가 깨지지 않게 합니다.
DO $$
BEGIN
  IF to_regclass('"SmartstoreProduct"') IS NOT NULL THEN
    ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "rankPinned" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "rankPinnedAt" TIMESTAMP(3);
    ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "autoTracking" BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;
