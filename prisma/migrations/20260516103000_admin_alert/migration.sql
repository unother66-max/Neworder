-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAlert_createdAt_idx" ON "AdminAlert"("createdAt");
CREATE INDEX "AdminAlert_isRead_idx" ON "AdminAlert"("isRead");
CREATE INDEX "AdminAlert_type_idx" ON "AdminAlert"("type");
CREATE INDEX "AdminAlert_level_idx" ON "AdminAlert"("level");
