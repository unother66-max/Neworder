ALTER TABLE "PlaceKeyword"
ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastFailureCode" TEXT;
