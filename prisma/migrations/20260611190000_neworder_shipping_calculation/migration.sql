CREATE TYPE "NewOrderShippingStatus" AS ENUM ('FREE', 'PAID', 'UNKNOWN');

ALTER TABLE "NewOrderPriceCandidate"
ADD COLUMN "productPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "shippingUnitCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "shippingStatus" "NewOrderShippingStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "shippingNote" TEXT,
ADD COLUMN "shippingCondition" TEXT,
ADD COLUMN "shippingNeedsConfirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "effectiveShippingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalPriceWithShipping" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bundleQuantity" INTEGER NOT NULL DEFAULT 1;

UPDATE "NewOrderPriceCandidate"
SET
  "productPrice" = "itemPrice",
  "shippingUnitCount" = 1,
  "shippingStatus" = CASE
    WHEN "shippingFee" > 0 THEN 'PAID'
    ELSE 'UNKNOWN'
  END,
  "shippingNeedsConfirmation" = "shippingFee" > 0,
  "effectiveShippingFee" = "shippingFee",
  "totalPriceWithShipping" = "totalPrice",
  "bundleQuantity" = "quantityPerPack";

ALTER TABLE "NewOrderPriceHistory"
ADD COLUMN "productPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "shippingUnitCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "shippingStatus" "NewOrderShippingStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "shippingNote" TEXT,
ADD COLUMN "shippingCondition" TEXT,
ADD COLUMN "shippingNeedsConfirmation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "effectiveShippingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totalPriceWithShipping" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bundleQuantity" INTEGER NOT NULL DEFAULT 1;

UPDATE "NewOrderPriceHistory"
SET
  "productPrice" = "itemPrice",
  "shippingUnitCount" = 1,
  "shippingStatus" = CASE
    WHEN "shippingFee" > 0 THEN 'PAID'
    ELSE 'UNKNOWN'
  END,
  "shippingNeedsConfirmation" = "shippingFee" > 0,
  "effectiveShippingFee" = "shippingFee",
  "totalPriceWithShipping" = "totalPrice",
  "bundleQuantity" = "quantity";
