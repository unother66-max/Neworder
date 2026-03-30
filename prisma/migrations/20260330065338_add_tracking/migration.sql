-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlaceKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "mobileVolume" INTEGER,
    "pcVolume" INTEGER,
    "totalVolume" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isTracking" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PlaceKeyword_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlaceKeyword" ("createdAt", "id", "keyword", "mobileVolume", "pcVolume", "placeId", "totalVolume", "updatedAt") SELECT "createdAt", "id", "keyword", "mobileVolume", "pcVolume", "placeId", "totalVolume", "updatedAt" FROM "PlaceKeyword";
DROP TABLE "PlaceKeyword";
ALTER TABLE "new_PlaceKeyword" RENAME TO "PlaceKeyword";
CREATE UNIQUE INDEX "PlaceKeyword_placeId_keyword_key" ON "PlaceKeyword"("placeId", "keyword");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
