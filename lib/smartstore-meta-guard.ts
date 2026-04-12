/**
 * 스마트스토어/네이버 상품 메타 수집 시 장애·에러 HTML/제목을 DB에 넣지 않기 위한 판별.
 */

const TITLE_ERROR_RE =
  /\[에러페이지\]|에러\s*페이지|오류\s*페이지|error\s*page|서비스\s*이용에\s*불편|서비스\s*이용\s*불가|접속\s*불가|일시적\s*오류|시스템\s*점검|접속이\s*제한/i;

/** HTML/텍스트 본문 앞부분이 네이버 장애·에러 안내인지 (JSON API가 HTML을 준 경우 등) */
export function looksLikeNaverHtmlOrTextErrorHead(sample: string): boolean {
  const s = sample.slice(0, 4000).toLowerCase();
  if (!s.trim()) return false;
  const isHtml = s.includes("<!doctype") || s.includes("<html");
  if (isHtml) {
    return (
      s.includes("에러페이지") ||
      s.includes("error page") ||
      s.includes("서비스 이용에 불편") ||
      s.includes("sorry, an error") ||
      s.includes("접속이 제한") ||
      s.includes("시스템 점검")
    );
  }
  return (
    TITLE_ERROR_RE.test(sample) ||
    /일시적으로\s*서비스/.test(sample) ||
    /접속이\s*제한/.test(sample)
  );
}

export function isSuspiciousSmartstoreMetaName(
  name: string | null | undefined
): boolean {
  const t = name?.trim() || "";
  if (!t) return false;
  return TITLE_ERROR_RE.test(t);
}
