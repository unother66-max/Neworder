ALTER TABLE "NewOrderItem"
ADD COLUMN "coupangSearchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
