-- Add per-post keyword analysis freshness tracking.
ALTER TABLE "BlogPostMetricSnapshot"
ADD COLUMN "keywordAnalyzedAt" TIMESTAMP(3);

CREATE INDEX "BlogPostMetricSnapshot_blogId_keywordAnalyzedAt_idx"
ON "BlogPostMetricSnapshot"("blogId", "keywordAnalyzedAt");
