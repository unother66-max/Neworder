ALTER TABLE "NewOrderPriceCandidate"
ADD COLUMN IF NOT EXISTS "shippingFeeMode" TEXT;

ALTER TABLE "NewOrderPriceHistory"
ADD COLUMN IF NOT EXISTS "shippingFeeMode" TEXT;
