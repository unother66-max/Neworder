-- CreateTable
CREATE TABLE "WebAnalysisSnapshot" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "rankedUrls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebAnalysisSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAnalysisSnapshot_keyword_snapshotDate_key" ON "WebAnalysisSnapshot"("keyword", "snapshotDate");
