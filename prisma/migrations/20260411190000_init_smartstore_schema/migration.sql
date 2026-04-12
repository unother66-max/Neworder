-- SmartstoreProduct, SmartstoreKeyword, SmartstoreRankHistory (schema.prisma 기준 초기 생성)

-- CreateTable
CREATE TABLE "SmartstoreProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "thumbnailLink" TEXT,
    "imageUrl" TEXT,
    "mallName" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "lastFetchedAt" TIMESTAMP(3),
    "channelUid" TEXT,
    "channelNo" TEXT,
    "rankPinned" BOOLEAN NOT NULL DEFAULT false,
    "rankPinnedAt" TIMESTAMP(3),
    "autoTracking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartstoreProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartstoreKeyword" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "mobileVolume" INTEGER,
    "pcVolume" INTEGER,
    "totalVolume" INTEGER,
    "isTracking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartstoreKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartstoreRankHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "rank" INTEGER,
    "pageNum" INTEGER,
    "position" INTEGER,
    "rankLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartstoreRankHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "userId_productId" ON "SmartstoreProduct"("userId", "productId");

-- CreateIndex
CREATE INDEX "SmartstoreProduct_userId_idx" ON "SmartstoreProduct"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartstoreKeyword_productId_keyword_key" ON "SmartstoreKeyword"("productId", "keyword");

-- CreateIndex
CREATE INDEX "SmartstoreKeyword_productId_idx" ON "SmartstoreKeyword"("productId");

-- CreateIndex
CREATE INDEX "SmartstoreRankHistory_productId_idx" ON "SmartstoreRankHistory"("productId");

-- CreateIndex
CREATE INDEX "SmartstoreRankHistory_productId_keyword_idx" ON "SmartstoreRankHistory"("productId", "keyword");

-- AddForeignKey
ALTER TABLE "SmartstoreProduct" ADD CONSTRAINT "SmartstoreProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartstoreKeyword" ADD CONSTRAINT "SmartstoreKeyword_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SmartstoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartstoreRankHistory" ADD CONSTRAINT "SmartstoreRankHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SmartstoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
