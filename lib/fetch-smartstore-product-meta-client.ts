/**
 * 브라우저에서 네이버 brand/smartstore JSON API **직접 fetch는 CORS로 불가**하여 비활성화됨.
 * `fetchSmartstoreProductInBrowser`는 네트워크 없이 빈 결과만 반환합니다.
 *
 * 스마트스토어 상품 등록은 `lib/smartstore-register-client-meta.ts` → 서버 저장 API만 사용.
 */

export {
  fetchSmartstoreProductInBrowser,
  type SmartstoreProductFetchResult,
} from "@/lib/fetch-smartstore-product-meta";
