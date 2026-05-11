-- PlaceKeyword 순서 표시 컬럼 (재실행 안전)
ALTER TABLE "PlaceKeyword"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "PlaceKeyword_placeId_sortOrder_idx"
ON "PlaceKeyword" ("placeId", "sortOrder");
