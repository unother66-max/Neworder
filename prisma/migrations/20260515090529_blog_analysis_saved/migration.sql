-- CreateTable
CREATE TABLE "BlogAnalysisSaved" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "blogId" TEXT NOT NULL,
    "nickname" TEXT,
    "blogName" TEXT,
    "profileImage" TEXT,
    "blogTopic" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "autoTracking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogAnalysisSaved_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogAnalysisSaved_blogId_idx" ON "BlogAnalysisSaved"("blogId");

-- CreateIndex
CREATE INDEX "BlogAnalysisSaved_userId_idx" ON "BlogAnalysisSaved"("userId");

-- CreateIndex
CREATE INDEX "BlogAnalysisSaved_isPinned_idx" ON "BlogAnalysisSaved"("isPinned");

-- CreateIndex
CREATE INDEX "BlogAnalysisSaved_autoTracking_idx" ON "BlogAnalysisSaved"("autoTracking");
