/**
 * "압구정 필라테스" → "필라테스" 처럼 지역 토큰을 뺀 검색어.
 * place-rank-analyze·place-analysis 브라우저 GraphQL에서 서버와 동일 규칙 사용.
 */

/** 자주 나오는 지역 오타(압국정→압구정 등) — 좌표·폴백 토큰이 깨지지 않게 */
const PLACE_REGION_TYPOS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /압국정/g, replacement: "압구정" },
  { pattern: /강낭/g, replacement: "강남" },
  { pattern: /홍데/g, replacement: "홍대" },
];

export function normalizePlaceSearchKeywordTypos(keyword: string): {
  normalized: string;
  typoCorrected: boolean;
} {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) return { normalized: "", typoCorrected: false };

  let out = trimmed;
  let typoCorrected = false;
  for (const { pattern, replacement } of PLACE_REGION_TYPOS) {
    if (pattern.test(out)) {
      const next = out.replace(pattern, replacement);
      if (next !== out) typoCorrected = true;
      out = next;
    }
  }
  return { normalized: out, typoCorrected };
}

/**
 * 주소·행정구역 문자열 매칭용(역/상권명 → 실제 주소에 자주 등장하는 토큰).
 * "서울역 필라테스"처럼 API 후보가 적을 때 지역 일치 항목을 우선한다.
 */
export const LOCATION_ADDRESS_HINT_EXPANSIONS: Record<string, string[]> = {
  서울역: [
    "서울역",
    "한강대로",
    "용산구",
    "중구",
    "남대문로",
    "소공동",
    "회현동",
    "충정로",
  ],
  압구정: [
    "압구정",
    "압구정로",
    "강남구",
    "신사동",
    "논현동",
    "청담동",
    "도산대로",
    "가로수길",
    "압구정동",
  ],
  청담: ["청담", "청담동", "강남구", "도산대로", "압구정로"],
  신사: ["신사", "신사동", "강남구", "도산대로", "가로수길"],
  강남: ["강남", "강남구", "강남대로", "테헤란로", "역삼동"],
  강남역: ["강남역", "강남구", "강남대로", "역삼동"],
  홍대: ["홍대", "마포구", "서교동", "합정", "양화로", "홍익로"],
  홍대입구: ["홍대입구", "마포구", "서교동", "양화로"],
  명동: ["명동", "중구", "명동길", "퇴계로"],
  종로: ["종로", "종로구", "종로타워", "세종대로", "청계천"],
  을지로: ["을지로", "중구", "을지로로", "명동"],
  동대문: ["동대문", "종로구", "동대문로", "을지로"],
  신촌: ["신촌", "서대문구", "연세로", "창천동"],
  여의도: ["여의도", "영등포구", "여의대로", "국회대로"],
  잠실: ["잠실", "송파구", "올림픽로", "석촌"],
  성수: ["성수", "성동구", "성수이로", "뚝섬"],
  /** 한남 — SET에는 "한남"만 있고 "한남동" 검색이 많아 동 단위도 확장 */
  한남동: [
    "한남동",
    "한남",
    "용산구",
    "독서당로",
    "이태원로",
    "한남대로",
  ],
};

export function expandLocationAddressHints(keyword: string): string[] {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const hints = new Set<string>();

  for (const p of parts) {
    if (LOCATION_QUERY_TOKEN_SET.has(p)) {
      for (const h of LOCATION_ADDRESS_HINT_EXPANSIONS[p] ?? [p]) {
        hints.add(h);
      }
      continue;
    }
    if (/역$/.test(p) && p.length >= 2 && p.length <= 12) {
      for (const h of LOCATION_ADDRESS_HINT_EXPANSIONS[p] ?? [p]) {
        hints.add(h);
      }
    }
  }

  return Array.from(hints);
}

export const LOCATION_QUERY_TOKEN_SET = new Set([
  "서울역",
  "강남",
  "강남역",
  "역삼",
  "역삼역",
  "선릉",
  "논현",
  "신논현",
  "홍대",
  "홍대입구",
  "합정",
  "마포",
  "여의도",
  "잠실",
  "송파",
  "종로",
  "광화문",
  "명동",
  "을지로",
  "동대문",
  "신촌",
  "건대",
  "성수",
  "판교",
  "분당",
  "수원",
  "신림",
  "이태원",
  "한남",
  "한남동",
  "압구정",
  "청담",
  "신사",
  "대치",
  "삼성",
]);

export function buildLocationFallbackSearchKeyword(keyword: string): string | null {
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const filtered = parts.filter((p) => {
    if (LOCATION_QUERY_TOKEN_SET.has(p)) return false;
    if (p.endsWith("역") && p.length >= 2 && p.length <= 10) return false;
    return true;
  });

  const next = filtered.join(" ").trim();
  if (!next || next === trimmed) return null;
  return next;
}

/** GraphQL getPlacesList 배열 응답에서 businesses·adBusinesses items 개수(배치 내 합산) */
export function countBusinessesItemsInBatch(parsed: unknown): number {
  if (!Array.isArray(parsed) || parsed.length === 0) return 0;
  let n = 0;
  for (const part of parsed) {
    const data = (part as { data?: unknown })?.data as
      | {
          businesses?: { items?: unknown[] };
          places?: { items?: unknown[] };
          adBusinesses?: { items?: unknown[] };
        }
      | undefined;
    if (!data) continue;
    const b = data.businesses?.items;
    const pl = data.places?.items;
    const a = data.adBusinesses?.items;
    const bLen = Array.isArray(b) ? b.length : 0;
    const plLen = Array.isArray(pl) ? pl.length : 0;
    if (plLen > 0) n += plLen;
    else if (bLen > 0) n += bLen;
    if (Array.isArray(a)) n += a.length;
  }
  return n;
}
