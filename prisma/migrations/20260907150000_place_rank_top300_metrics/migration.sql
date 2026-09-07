-- Existing snapshots remain valid with metrics = NULL.
ALTER TABLE "PlaceRankTop300Snapshot"
ADD COLUMN "metrics" JSONB;
