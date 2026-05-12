/**
 * 블로그 제목에서 키워드 후보 추출 (공개 데이터만 사용).
 */

const NON_WORD = /[^\u3131-\u318E\uAC00-\uD7A3a-zA-Z0-9]+/g;

const STOPWORDS_RAW = [
  "오늘",
  "후기",
  "추천",
  "리뷰",
  "내돈내산",
  "일상",
  "정보",
  "방법",
  "사용",
  "정말",
  "너무",
  "그리고",
  "하지만",
  "있는",
  "없는",
  "좋은",
  "많은",
  "이번",
  "여기",
  "저기",
] as const;

function normKey(s: string): string {
  return s
    .normalize("NFKC")
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

const STOPWORDS = new Set(STOPWORDS_RAW.map((w) => normKey(w)));

function isStopword(token: string): boolean {
  return STOPWORDS.has(normKey(token));
}

/**
 * 최근 포스트 제목에서 토큰 단위 후보를 뽑습니다.
 * 한글·영문·숫자만 유지하고, 2글자 미만·불용어·중복을 제거합니다. 최대 `maxCandidates`개.
 */
export function extractKeywordCandidatesFromTitles(
  titles: string[],
  maxCandidates = 30
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const title of titles) {
    if (out.length >= maxCandidates) break;
    const raw = String(title ?? "");
    const spaced = raw.replace(NON_WORD, " ");
    const tokens = spaced.split(/\s+/).filter(Boolean);

    for (const rawToken of tokens) {
      if (out.length >= maxCandidates) break;
      const token = rawToken.trim();
      if (token.length < 2) continue;
      if (isStopword(token)) continue;

      const dedupe = normKey(token);
      if (!dedupe || seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(token.normalize("NFKC").trim());
    }
  }

  return out;
}
