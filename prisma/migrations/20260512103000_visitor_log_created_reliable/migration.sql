-- AlterTable
ALTER TABLE "User" ADD COLUMN "createdAtReliable" BOOLEAN NOT NULL DEFAULT true;
UPDATE "User" SET "createdAtReliable" = false;

-- CreateTable
CREATE TABLE "VisitorLog" (
    "id" TEXT NOT NULL,
    "visitDate" TEXT NOT NULL,
    "ipHash" VARCHAR(64) NOT NULL,
    "uaHash" VARCHAR(64) NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorLog_visitDate_ipHash_uaHash_key" ON "VisitorLog"("visitDate", "ipHash", "uaHash");

CREATE INDEX "VisitorLog_visitDate_idx" ON "VisitorLog"("visitDate");
