/** 스마트스토어/브랜드스토어/쇼핑윈도우 상품 URL에서 숫자 상품 ID 추출 */
export function extractNaverSmartstoreProductId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);

    // 1) 스마트스토어/브랜드스토어: /{storeSlug}/products/{id} 또는 /products/{id}
    // 2) 쇼핑윈도우: /window-products/.../{id}
    // 3) 쇼핑 가격비교/기획전: /catalog/{id}
    // 위 케이스들을 위해 pathname 어디에 있든 "products|window-products|catalog" 뒤 숫자를 찾습니다.
    const path = u.pathname;
    const patterns: RegExp[] = [
      /\/products\/(\d+)(?:\/|$)/i,
      /\/window-products\/(?:[^\/]+\/)*(\d+)(?:\/|$)/i,
      /\/catalog\/(\d+)(?:\/|$)/i,
    ];
    for (const re of patterns) {
      const m = path.match(re);
      if (m?.[1]) return m[1];
    }

    // 4. 만약 위 패턴에 없는데 쿼리스트링에 nvMid(네이버상품ID)가 있는 경우도 체크
    const nvMid = u.searchParams.get("nvMid");
    if (nvMid && /^\d+$/.test(nvMid)) return nvMid;

    return null;
  } catch {
    // URL 객체 생성 실패 시 문자열에서 직접 추출 시도
    const patterns: RegExp[] = [
      /\/products\/(\d+)(?:\/|$)/i,
      /\/window-products\/(?:[^\/]+\/)*(\d+)(?:\/|$)/i,
      /\/catalog\/(\d+)(?:\/|$)/i,
      /[?&]nvMid=(\d+)(?:&|$)/i,
    ];
    for (const re of patterns) {
      const m = trimmed.match(re);
      if (m?.[1]) return m[1];
    }
    return null;
  }
}

export function isLikelySmartstoreProductUrl(rawUrl: string): boolean {
  const t = rawUrl.trim();
  if (!t) return false;

  // shortlink (may redirect to any of the below)
  if (t.toLowerCase().includes("naver.me")) return true;

  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    const host = u.hostname.toLowerCase();

    // Allow: smartstore (pc/mobile), brandstore (pc/mobile), shopping (pc; window/campaign links 포함)
    const allowedHosts = new Set([
      "smartstore.naver.com",
      "m.smartstore.naver.com",
      "brand.naver.com",
      "m.brand.naver.com",
      "shopping.naver.com",
    ]);

    if (allowedHosts.has(host)) return true;

    // Be slightly permissive for subdomains like "m.shopping.naver.com" if they appear.
    if (host.endsWith(".smartstore.naver.com")) return true;
    if (host.endsWith(".brand.naver.com")) return true;
    if (host.endsWith(".shopping.naver.com")) return true;

    return false;
  } catch {
    const low = t.toLowerCase();
    return (
      low.includes("smartstore.naver.com") ||
      low.includes("m.smartstore.naver.com") ||
      low.includes("brand.naver.com") ||
      low.includes("m.brand.naver.com") ||
      low.includes("shopping.naver.com") ||
      low.includes("naver.me")
    );
  }
}