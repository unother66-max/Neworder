import { executeSmartstoreProductSavePost } from "@/lib/execute-smartstore-product-save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/smartstore-product-save
 * - productUrl 수신 → productId 추출
 * - 공통 실행: lib/execute-smartstore-product-save.ts (리뷰 추적 라우트에서도 재사용)
 */
export async function POST(req: Request) {
  return executeSmartstoreProductSavePost(req);
}
