-- Leaf category ID for Smartstore review product-summary API (optional).
ALTER TABLE "SmartstoreProduct" ADD COLUMN "leafCategoryId" INTEGER;
ALTER TABLE "SmartstoreReviewTarget" ADD COLUMN "leafCategoryId" INTEGER;
