-- AlterTable
ALTER TABLE "VisitorEvent" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "VisitorEvent_userId_idx" ON "VisitorEvent"("userId");

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
