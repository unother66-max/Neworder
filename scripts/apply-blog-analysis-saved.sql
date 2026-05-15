CREATE TABLE IF NOT EXISTS "BlogAnalysisSaved" (
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogAnalysisSaved_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BlogAnalysisSaved"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "blogId" TEXT,
  ADD COLUMN IF NOT EXISTS "nickname" TEXT,
  ADD COLUMN IF NOT EXISTS "blogName" TEXT,
  ADD COLUMN IF NOT EXISTS "profileImage" TEXT,
  ADD COLUMN IF NOT EXISTS "blogTopic" TEXT,
  ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoTracking" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "BlogAnalysisSaved_blogId_idx"
ON "BlogAnalysisSaved"("blogId");

CREATE INDEX IF NOT EXISTS "BlogAnalysisSaved_userId_idx"
ON "BlogAnalysisSaved"("userId");

CREATE INDEX IF NOT EXISTS "BlogAnalysisSaved_isPinned_idx"
ON "BlogAnalysisSaved"("isPinned");

CREATE INDEX IF NOT EXISTS "BlogAnalysisSaved_autoTracking_idx"
ON "BlogAnalysisSaved"("autoTracking");
