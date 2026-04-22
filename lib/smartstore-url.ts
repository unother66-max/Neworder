/** 스마트스토어/브랜드스토어/쇼핑윈도우 상품 URL에서 숫자 상품 ID 추출 */
export function extractNaverSmartstoreProductId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    
    // 1. 일반적인 /products/12345 형식
    // 2. 쇼핑윈도우 /window-products/카테고리/12345 형식
    // 3. 가격비교 /catalog/12345 형식
    // 위 세 가지를 모두 찾을 수 있도록 정규식을 보강했습니다.
    const m = u.pathname.match(/\/(?:products|window-products|catalog)\/(?:[^\/]+\/)?(\d+)/i);
    
    if (m?.[1]) return m[1];

    // 4. 만약 위 패턴에 없는데 쿼리스트링에 nvMid(네이버상품ID)가 있는 경우도 체크
    const nvMid = u.searchParams.get("nvMid");
    if (nvMid && /^\d+$/.test(nvMid)) return nvMid;

    return null;
  } catch {
    // URL 객체 생성 실패 시 문자열에서 직접 추출 시도
    const m = trimmed.match(/\/(?:products|window-products|catalog)\/(?:[^\/]+\/)?(\d+)/i);
    return m?.[1] ?? null;
  }
}

export function isLikelySmartstoreProductUrl(rawUrl: string): boolean {
  const t = rawUrl.trim().toLowerCase();
  if (!t) return false;
  
  // 네이버 쇼핑과 관련된 모든 주요 도메인을 허용합니다.
  return (
    t.includes("smartstore.naver.com") ||
    t.includes("brand.naver.com") ||
    t.includes("shopping.naver.com") ||
    t.includes("naver.me") // 모바일 단축 주소 대비
  );
}