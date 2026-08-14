-- 일반 Place 업체는 네이버가 저장 수를 제공하지 않을 수 있다.
-- 방문자·블로그 리뷰의 최초 스냅샷도 정확히 저장할 수 있도록 nullable로 변경한다.
ALTER TABLE "PlaceReviewHistory"
ALTER COLUMN "saveCount" DROP NOT NULL;
