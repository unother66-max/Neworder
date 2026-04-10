/** 스마트스토어/브랜드스토어 상품 URL에서 숫자 상품 ID 추출 */
export function extractNaverSmartstoreProductId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const m = u.pathname.match(/\/products\/(\d+)/i);
    return m?.[1] ?? null;
  } catch {
    const m = trimmed.match(/\/products\/(\d+)/i);
    return m?.[1] ?? null;
  }
}

export function isLikelySmartstoreProductUrl(rawUrl: string): boolean {
  const t = rawUrl.trim().toLowerCase();
  if (!t) return false;
  const withProto = t.startsWith("http") ? t : `https://${t}`;
  return (
    /smartstore\.naver\.com/.test(withProto) ||
    /brand\.naver\.com/.test(withProto) ||
    /shopping\.naver\.com/.test(withProto)
  );
}
