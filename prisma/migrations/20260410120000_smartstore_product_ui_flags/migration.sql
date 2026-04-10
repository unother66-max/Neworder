-- 컬럼이 이미 있으면(db push 등) 스킵 — 재적용·부분 적용 모두 안전
ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "rankPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "rankPinnedAt" TIMESTAMP(3);
ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "autoTracking" BOOLEAN NOT NULL DEFAULT true;
