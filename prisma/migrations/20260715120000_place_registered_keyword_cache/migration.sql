CREATE TABLE "PlaceRegisteredKeywordCache" (
    "id" TEXT NOT NULL,
    "publicPlaceId" TEXT NOT NULL,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "hasSuccessfulValue" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "collectedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "refreshLeaseUntil" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceRegisteredKeywordCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaceRegisteredKeywordCache_publicPlaceId_key"
ON "PlaceRegisteredKeywordCache"("publicPlaceId");

CREATE INDEX "PlaceRegisteredKeywordCache_cooldownUntil_idx"
ON "PlaceRegisteredKeywordCache"("cooldownUntil");

CREATE INDEX "PlaceRegisteredKeywordCache_collectedAt_idx"
ON "PlaceRegisteredKeywordCache"("collectedAt");
