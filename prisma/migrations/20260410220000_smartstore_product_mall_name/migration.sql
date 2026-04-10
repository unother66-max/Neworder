-- P2022: SmartstoreProduct.mallName 컬럼 누락 시 Prisma 모든 쿼리(삭제 포함)에서 실패
ALTER TABLE "SmartstoreProduct" ADD COLUMN IF NOT EXISTS "mallName" TEXT;
