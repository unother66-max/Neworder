-- CreateTable
CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "job" VARCHAR(80) NOT NULL,
    "trigger" VARCHAR(80) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "trackedTotal" INTEGER,
    "eligibleTotal" INTEGER,
    "total" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "outOfRange" INTEGER NOT NULL DEFAULT 0,
    "ncaptcha" INTEGER NOT NULL DEFAULT 0,
    "http429" INTEGER NOT NULL DEFAULT 0,
    "timeout" INTEGER NOT NULL DEFAULT 0,
    "cooldownSkip" INTEGER NOT NULL DEFAULT 0,
    "error" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "keywordId" VARCHAR(191) NOT NULL,
    "placeId" VARCHAR(191) NOT NULL,
    "placeName" VARCHAR(500) NOT NULL,
    "keyword" VARCHAR(500) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "rank" INTEGER,
    "errorMessage" VARCHAR(500),
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CronRun_startedAt_idx" ON "CronRun"("startedAt");

-- CreateIndex
CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt");

-- CreateIndex
CREATE INDEX "CronRun_status_startedAt_idx" ON "CronRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "CronRun_expiresAt_idx" ON "CronRun"("expiresAt");

-- CreateIndex
CREATE INDEX "CronResult_runId_idx" ON "CronResult"("runId");

-- CreateIndex
CREATE INDEX "CronResult_status_idx" ON "CronResult"("status");

-- CreateIndex
CREATE INDEX "CronResult_runId_status_idx" ON "CronResult"("runId", "status");

-- CreateIndex
CREATE INDEX "CronResult_expiresAt_idx" ON "CronResult"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CronResult_runId_keywordId_key" ON "CronResult"("runId", "keywordId");

-- AddForeignKey
ALTER TABLE "CronResult" ADD CONSTRAINT "CronResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CronRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
