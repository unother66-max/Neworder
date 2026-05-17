-- CreateTable
CREATE TABLE "BlogDiscoveryQueue" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "blogUrl" TEXT,
    "source" TEXT NOT NULL,
    "seedKeyword" TEXT,
    "officialBlogTopic" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTriedAt" TIMESTAMP(3),
    "analyzedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogDiscoveryQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogDiscoveryQueue_blogId_key" ON "BlogDiscoveryQueue"("blogId");

-- CreateIndex
CREATE INDEX "BlogDiscoveryQueue_status_idx" ON "BlogDiscoveryQueue"("status");

-- CreateIndex
CREATE INDEX "BlogDiscoveryQueue_priority_idx" ON "BlogDiscoveryQueue"("priority");

-- CreateIndex
CREATE INDEX "BlogDiscoveryQueue_source_idx" ON "BlogDiscoveryQueue"("source");

-- CreateIndex
CREATE INDEX "BlogDiscoveryQueue_seedKeyword_idx" ON "BlogDiscoveryQueue"("seedKeyword");

-- CreateIndex
CREATE INDEX "BlogDiscoveryQueue_officialBlogTopic_idx" ON "BlogDiscoveryQueue"("officialBlogTopic");

-- CreateIndex
CREATE INDEX "BlogDiscoveryQueue_lastTriedAt_idx" ON "BlogDiscoveryQueue"("lastTriedAt");
