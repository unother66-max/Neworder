CREATE TYPE "NewOrderOperatorRole" AS ENUM ('STORE_MANAGER', 'ADMIN', 'SUPERADMIN');
CREATE TYPE "NewOrderStore" AS ENUM ('HANNAM', 'YEONNAM');
CREATE TYPE "NewOrderStatus" AS ENUM ('REQUESTED', 'REVIEWING', 'PURCHASED', 'ON_HOLD');
CREATE TYPE "NewOrderPriceSource" AS ENUM ('NAVER', 'COUPANG', 'MANUAL');

CREATE TABLE "NewOrderOperator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "NewOrderOperatorRole" NOT NULL DEFAULT 'STORE_MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderOperator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "website" TEXT,
    "memo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderSupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "orderUnit" TEXT NOT NULL,
    "orderUnitQuantity" INTEGER NOT NULL DEFAULT 1,
    "naverSearchKeyword" TEXT,
    "coupangSearchKeyword" TEXT,
    "excludedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultSupplierId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderInventoryCheck" (
    "id" TEXT NOT NULL,
    "store" "NewOrderStore" NOT NULL,
    "memo" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderInventoryCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderInventoryEntry" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "currentQty" INTEGER NOT NULL,
    "shortageQty" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderInventoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderOrder" (
    "id" TEXT NOT NULL,
    "store" "NewOrderStore" NOT NULL,
    "itemId" TEXT NOT NULL,
    "sourceCheckId" TEXT,
    "requestedQty" INTEGER NOT NULL,
    "status" "NewOrderStatus" NOT NULL DEFAULT 'REQUESTED',
    "memo" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderPriceCandidate" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" "NewOrderPriceSource" NOT NULL,
    "title" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "itemPrice" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" INTEGER NOT NULL,
    "quantityPerPack" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderPriceCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewOrderPurchase" (
    "id" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "supplierId" TEXT,
    "orderId" TEXT,
    "quantity" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "memo" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewOrderPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewOrderOperator_userId_key" ON "NewOrderOperator"("userId");
CREATE INDEX "NewOrderOperator_isActive_idx" ON "NewOrderOperator"("isActive");
CREATE UNIQUE INDEX "NewOrderSupplier_name_key" ON "NewOrderSupplier"("name");
CREATE INDEX "NewOrderSupplier_isActive_idx" ON "NewOrderSupplier"("isActive");
CREATE UNIQUE INDEX "NewOrderItem_name_category_key" ON "NewOrderItem"("name", "category");
CREATE INDEX "NewOrderItem_isActive_idx" ON "NewOrderItem"("isActive");
CREATE INDEX "NewOrderItem_category_idx" ON "NewOrderItem"("category");
CREATE INDEX "NewOrderItem_defaultSupplierId_idx" ON "NewOrderItem"("defaultSupplierId");
CREATE INDEX "NewOrderInventoryCheck_store_completedAt_idx" ON "NewOrderInventoryCheck"("store", "completedAt");
CREATE UNIQUE INDEX "NewOrderInventoryEntry_checkId_itemId_key" ON "NewOrderInventoryEntry"("checkId", "itemId");
CREATE INDEX "NewOrderInventoryEntry_itemId_idx" ON "NewOrderInventoryEntry"("itemId");
CREATE INDEX "NewOrderOrder_store_status_idx" ON "NewOrderOrder"("store", "status");
CREATE INDEX "NewOrderOrder_itemId_idx" ON "NewOrderOrder"("itemId");
CREATE INDEX "NewOrderOrder_sourceCheckId_idx" ON "NewOrderOrder"("sourceCheckId");
CREATE INDEX "NewOrderPriceCandidate_itemId_checkedAt_idx" ON "NewOrderPriceCandidate"("itemId", "checkedAt");
CREATE INDEX "NewOrderPriceCandidate_source_idx" ON "NewOrderPriceCandidate"("source");
CREATE INDEX "NewOrderPurchase_purchasedAt_idx" ON "NewOrderPurchase"("purchasedAt");
CREATE INDEX "NewOrderPurchase_itemId_purchasedAt_idx" ON "NewOrderPurchase"("itemId", "purchasedAt");
CREATE INDEX "NewOrderPurchase_supplierId_idx" ON "NewOrderPurchase"("supplierId");
CREATE INDEX "NewOrderPurchase_orderId_idx" ON "NewOrderPurchase"("orderId");

ALTER TABLE "NewOrderOperator" ADD CONSTRAINT "NewOrderOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewOrderItem" ADD CONSTRAINT "NewOrderItem_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "NewOrderSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewOrderInventoryEntry" ADD CONSTRAINT "NewOrderInventoryEntry_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "NewOrderInventoryCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewOrderInventoryEntry" ADD CONSTRAINT "NewOrderInventoryEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NewOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NewOrderOrder" ADD CONSTRAINT "NewOrderOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NewOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NewOrderOrder" ADD CONSTRAINT "NewOrderOrder_sourceCheckId_fkey" FOREIGN KEY ("sourceCheckId") REFERENCES "NewOrderInventoryCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewOrderPriceCandidate" ADD CONSTRAINT "NewOrderPriceCandidate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NewOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewOrderPurchase" ADD CONSTRAINT "NewOrderPurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NewOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NewOrderPurchase" ADD CONSTRAINT "NewOrderPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "NewOrderSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewOrderPurchase" ADD CONSTRAINT "NewOrderPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "NewOrderOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
