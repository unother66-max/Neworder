-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "placeUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackId" TEXT NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "address" TEXT,
    "placeUrl" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceKeyword" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "mobileVolume" INTEGER,
    "pcVolume" INTEGER,
    "totalVolume" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isTracking" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlaceKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceRankHistory" (
    "id" TEXT NOT NULL,
    "placeKeywordId" TEXT NOT NULL,
    "rank" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceRankHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceKeyword_placeId_keyword_key" ON "PlaceKeyword"("placeId", "keyword");

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceKeyword" ADD CONSTRAINT "PlaceKeyword_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceRankHistory" ADD CONSTRAINT "PlaceRankHistory_placeKeywordId_fkey" FOREIGN KEY ("placeKeywordId") REFERENCES "PlaceKeyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
