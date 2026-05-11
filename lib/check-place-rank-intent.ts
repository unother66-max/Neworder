/**
 * `/api/check-place-rank`와 동일한 추천형 키워드 판별.
 * 클라이언트 디버그 fetch 조건에도 사용.
 */

function normalizeForIntent(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

export function isIntentMixedKeyword(keyword: string): boolean {
  const n = normalizeForIntent(keyword);

  const hints = [
    "데이트",
    "모임",
    "핫플",
    "가볼만한",
    "놀거리",
    "분위기",
    "코스",
  ];

  return hints.some((h) => n.includes(normalizeForIntent(h)));
}
