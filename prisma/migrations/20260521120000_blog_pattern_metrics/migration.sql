-- AlterTable
ALTER TABLE "BlogAnalysisHistory" ADD COLUMN "averageTitleLength" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BlogAnalysisHistory" ADD COLUMN "averageContentLength" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BlogAnalysisHistory" ADD COLUMN "averageImageCount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BlogAnalysisHistory" ADD COLUMN "titleLengthScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BlogAnalysisHistory" ADD COLUMN "contentLengthScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BlogAnalysisHistory" ADD COLUMN "imageCountScore" DOUBLE PRECISION;
