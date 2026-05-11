-- Add NAVER_REVIEW space for 리뷰 추적 페이지 전용 상품 행(SmartstoreProduct)과 등록 플로우 공유

DO $$
BEGIN
  ALTER TYPE "SmartstoreSpace" ADD VALUE 'NAVER_REVIEW';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
