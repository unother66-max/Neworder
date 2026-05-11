-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminMemo" TEXT;

-- CreateTable
CREATE TABLE "VisitorEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitDate" TEXT NOT NULL,
    "path" VARCHAR(512),
    "referrer" VARCHAR(512),
    "referrerCategory" TEXT NOT NULL DEFAULT 'other',
    "ipHash" VARCHAR(64) NOT NULL,
    "uaSnippet" VARCHAR(256),

    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisitorEvent_visitDate_idx" ON "VisitorEvent"("visitDate");
CREATE INDEX "VisitorEvent_createdAt_idx" ON "VisitorEvent"("createdAt");
CREATE INDEX "VisitorEvent_referrerCategory_idx" ON "VisitorEvent"("referrerCategory");
