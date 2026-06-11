ALTER TYPE "NewOrderPriceSource" ADD VALUE IF NOT EXISTS 'ORDERHERO';
ALTER TYPE "NewOrderPriceSource" ADD VALUE IF NOT EXISTS 'ETC';

ALTER TABLE "NewOrderPriceCandidate"
ADD COLUMN "mallName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "savedBy" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN "isCurrentBest" BOOLEAN NOT NULL DEFAULT false;

UPDATE "NewOrderPriceCandidate"
SET
  "mallName" = CASE
    WHEN "source" = 'NAVER' THEN '네이버'
    WHEN "source" = 'COUPANG' THEN '쿠팡'
    ELSE '직접 추가'
  END,
  "savedBy" = "createdBy";

UPDATE "NewOrderPriceCandidate" AS candidate
SET "savedBy" = COALESCE(NULLIF("User"."name", ''), "User"."email", candidate."createdBy")
FROM "User"
WHERE "User"."id" = candidate."createdBy";

WITH latest AS (
  SELECT DISTINCT ON ("itemId") "id"
  FROM "NewOrderPriceCandidate"
  ORDER BY "itemId", "checkedAt" DESC, "createdAt" DESC
)
UPDATE "NewOrderPriceCandidate"
SET "isCurrentBest" = true
WHERE "id" IN (SELECT "id" FROM latest);

CREATE INDEX "NewOrderPriceCandidate_itemId_isCurrentBest_idx"
ON "NewOrderPriceCandidate"("itemId", "isCurrentBest");

CREATE UNIQUE INDEX "NewOrderPriceCandidate_one_current_per_item"
ON "NewOrderPriceCandidate"("itemId")
WHERE "isCurrentBest" = true;

CREATE TABLE "NewOrderPriceHistory" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "source" "NewOrderPriceSource" NOT NULL,
  "mallName" TEXT NOT NULL DEFAULT '',
  "productName" TEXT NOT NULL,
  "productUrl" TEXT NOT NULL,
  "imageUrl" TEXT,
  "itemPrice" INTEGER NOT NULL,
  "shippingFee" INTEGER NOT NULL DEFAULT 0,
  "totalPrice" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitAmount" DOUBLE PRECISION,
  "unitType" TEXT,
  "packageUnit" TEXT,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "pricePer100" DOUBLE PRECISION,
  "pricePerMeasure" DOUBLE PRECISION,
  "note" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'system',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewOrderPriceHistory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "NewOrderPriceHistory" (
  "id",
  "itemId",
  "source",
  "mallName",
  "productName",
  "productUrl",
  "imageUrl",
  "itemPrice",
  "shippingFee",
  "totalPrice",
  "quantity",
  "unitAmount",
  "unitType",
  "packageUnit",
  "unitPrice",
  "pricePer100",
  "pricePerMeasure",
  "createdBy",
  "createdAt"
)
SELECT
  'history_' || "id",
  "itemId",
  "source",
  "mallName",
  "title",
  "productUrl",
  "imageUrl",
  "itemPrice",
  "shippingFee",
  "totalPrice",
  "quantityPerPack",
  "volumePerUnit",
  "volumeUnit",
  "packageUnit",
  "unitPrice",
  "pricePer100",
  "pricePerMeasure",
  "savedBy",
  "checkedAt"
FROM "NewOrderPriceCandidate";

CREATE INDEX "NewOrderPriceHistory_itemId_createdAt_idx"
ON "NewOrderPriceHistory"("itemId", "createdAt");

CREATE INDEX "NewOrderPriceHistory_source_idx"
ON "NewOrderPriceHistory"("source");

ALTER TABLE "NewOrderPriceHistory"
ADD CONSTRAINT "NewOrderPriceHistory_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "NewOrderItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
