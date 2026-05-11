import crypto from "crypto";

type KeywordToolItem = {
  relKeyword?: string;
  monthlyPcQcCnt?: number | string;
  monthlyMobileQcCnt?: number | string;
};

export type KeywordVolumeResult = {
  mobile: number;
  pc: number;
  total: number;
  ok: boolean;
  reason?:
    | "empty"
    | "missing-env"
    | "rate-limited"
    | "api-error"
    | "not-found"
    | "exception";
  matchedKeyword?: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const volumeCache = new Map<string, { value: KeywordVolumeResult; timestamp: number }>();

const isDevLogs = process.env.NODE_ENV !== "production";

/** 입력 문자열 통일용 (NFKC, 제로폭 제거, trim) */
export function normalizeVolumeKeywordInput(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

/**
 * 검색량(SearchAD keywordstool) 힌트·행 매칭용: 공백 제거 ("한남동 피자" → "한남동피자").
 * 캐시/유사 매칭용 normalizeKeywordKey(소문자·앤 치환)와 역할 분리.
 */
export function compactKeywordForVolumeHint(keyword: string): string {
  return normalizeVolumeKeywordInput(keyword).replace(/\s+/g, "");
}

function makeSignature(
  timestamp: string,
  method: string,
  uri: string,
  secretKey: string
) {
  const message = `${timestamp}.${method}.${uri}`;
  return crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("base64");
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (cleaned === "< 10") return 0;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

/** relKeyword와 사용자 입력의 공백·유니코드 정규화 차이 흡수 + 캐시 키 */
function normalizeKeywordKey(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/앤/g, "and")
    .toLowerCase();
}

const COMMON_SUFFIX =
  "피자|맛집|치킨|카페|데이트|회식|술집|브런치|파스타|떡볶이|순대|족발|한식|중식|일식|양식";

/** SearchAD keywordstool: hintKeywords는 공백 구분이 아니라 콤마 구분 토큰이어야 함 */
function hintKeywordsToApiParam(hint: string): string {
  const s = String(hint ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(",");
  return s;
}

/**
 * 네이버 키워드도구는 hint 형태에 따라 빈 keywordList를 줄 수 있어
 * 공백 유·무 등 여러 변형을 순서대로 시도한다.
 */
function hintCandidates(keyword: string): string[] {
  const trimmed = normalizeVolumeKeywordInput(keyword);
  if (!trimmed) return [];

  const spaced = trimmed.replace(/\s+/g, " ").trim();
  const compact = compactKeywordForVolumeHint(trimmed);

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (hint: string) => {
    const h = hint.trim();
    if (!h || seen.has(h)) return;
    seen.add(h);
    out.push(h);
  };

  if (compact !== spaced) add(compact);
  add(spaced);
  // "○○ 추천" / "○○ 근처" 는 도구 응답에 정확 행이 없을 때가 많아 본문(접두) 힌트를 추가
  if (/ 추천$/.test(spaced)) {
    add(spaced.replace(/ 추천$/, "").trim());
  }
  if (/ 근처$/.test(spaced)) {
    add(spaced.replace(/ 근처$/, "").trim());
  }
  if (!trimmed.includes(" ")) {
    const re = new RegExp(`^(.+)(${COMMON_SUFFIX})$`, "u");
    const m = trimmed.match(re);
    if (m?.[1] && m?.[2]) {
      add(`${m[1]} ${m[2]}`);
    }
  }

  return out.slice(0, 2);
}

/**
 * keywordstool 응답 keywordList에서 사용자 입력과 같은 키워드 행만 선택.
 * 일치 행이 없을 때 list[0] 등 임의 행을 쓰면 '맛집' 단독(고검색량)처럼 엉뚱한 수치가 들어간다.
 */
function pickKeywordVolumeRow(
  list: KeywordToolItem[],
  kwRaw: string
): KeywordToolItem | null {
  const pickForTarget = (target: string): KeywordToolItem | null => {
    const trimmed = normalizeVolumeKeywordInput(target);
    const key = normalizeKeywordKey(trimmed);
    const compact = compactKeywordForVolumeHint(trimmed);
    if (!list.length || !key) return null;

    const byNorm = list.find(
      (item) => normalizeKeywordKey(item.relKeyword ?? "") === key
    );
    if (byNorm) return byNorm;

    const byTrim = list.find(
      (item) => (item.relKeyword ?? "").trim() === trimmed
    );
    if (byTrim) return byTrim;

    const byCompact = list.find(
      (item) =>
        compactKeywordForVolumeHint(item.relKeyword ?? "") === compact
    );
    if (byCompact) return byCompact;

    return null;
  };

  const direct = pickForTarget(kwRaw);
  if (direct) return direct;

  const t = kwRaw.trim();
  if (/ 추천$/.test(t)) {
    const base = t.replace(/ 추천$/, "").trim();
    if (base) {
      const row = pickForTarget(base);
      if (row) return row;
    }
  }
  if (/ 근처$/.test(t)) {
    const base = t.replace(/ 근처$/, "").trim();
    if (base) {
      const row = pickForTarget(base);
      if (row) return row;
    }
  }

  return null;
}

function pruneExpiredVolumeCache(now: number) {
  for (const [k, v] of volumeCache) {
    if (now - v.timestamp > CACHE_TTL_MS) {
      volumeCache.delete(k);
    }
  }
}

async function fetchKeywordSearchVolumeUncached(
  keyword: string,
  accessKey: string,
  secretKey: string,
  customerId: string
): Promise<KeywordVolumeResult> {
  const method = "GET";
  const uri = "/keywordstool";
  const kwRaw = normalizeVolumeKeywordInput(String(keyword ?? ""));
  if (!kwRaw || !kwRaw.replace(/\s/g, "")) {
    console.warn(`[getKeywordSearchVolume] 비정상/빈 키워드: "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const hints = hintCandidates(kwRaw);

  if (!hints.length) {
    console.warn(`[getKeywordSearchVolume] 빈 키워드: "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const attemptFetch = (hintKeywords: string) => {
    const qs = new URLSearchParams({ hintKeywords, showDetail: "1" });
    const url = `https://api.searchad.naver.com${uri}?${qs.toString()}`;
    const ts = Date.now().toString();
    const sig = makeSignature(ts, method, uri, secretKey);
    return fetch(url, {
      method,
      headers: {
        "X-Timestamp": ts,
        "X-API-KEY": accessKey,
        "X-Customer": customerId,
        "X-Signature": sig,
        "Content-Type": "application/json; charset=UTF-8",
      },
      cache: "no-store",
    });
  };

  let chosen: KeywordToolItem | null = null;

  try {
    for (const hint of hints) {
      const hintKeywords = hintKeywordsToApiParam(hint);
      if (!hintKeywords) continue;

      const res = await attemptFetch(hintKeywords);

      // 429: 즉시 0 반환 (retry 없음)
      if (res.status === 429) {
        console.warn(`[getKeywordSearchVolume] 429 keyword="${kwRaw}"`);
        return { mobile: 0, pc: 0, total: 0, ok: false, reason: "rate-limited" };
      }

      if (!res.ok) {
        console.warn(
          `[getKeywordSearchVolume] 실패 keyword="${kwRaw}" status=${res.status}`
        );
        continue;
      }

      const data = (await res.json()) as { keywordList?: KeywordToolItem[] };
      const next = (data.keywordList || []) as KeywordToolItem[];
      if (isDevLogs) {
        console.log("[getKeywordSearchVolume raw]", {
          keyword: kwRaw,
          hintKeywords,
          count: next.length,
          sample: next.slice(0, 5).map((item) => ({
            relKeyword: item.relKeyword,
            monthlyPcQcCnt: item.monthlyPcQcCnt,
            monthlyMobileQcCnt: item.monthlyMobileQcCnt,
          })),
        });
      }
      if (!next.length) continue;

      const row = pickKeywordVolumeRow(next, kwRaw);
      if (row) {
        chosen = row;
        break;
      }
    }

    if (!chosen) {
      return { mobile: 0, pc: 0, total: 0, ok: false, reason: "not-found" };
    }

    const pc = toNumber(chosen.monthlyPcQcCnt);
    const mobile = toNumber(chosen.monthlyMobileQcCnt);
    return {
      mobile,
      pc,
      total: pc + mobile,
      ok: true,
      matchedKeyword: chosen.relKeyword,
    };
  } catch (error) {
    console.error(`[getKeywordSearchVolume] 예외 keyword="${kwRaw}"`, error);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "exception" };
  }
}

export async function getKeywordSearchVolume(
  keyword: string
): Promise<KeywordVolumeResult> {
  const accessKey = process.env.NAVER_SEARCHAD_ACCESS_KEY;
  const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY;
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID;

  if (!accessKey || !secretKey || !customerId) {
    console.warn(
      "[getKeywordSearchVolume] NAVER_SEARCHAD_ACCESS_KEY / SECRET_KEY / CUSTOMER_ID 중 일부가 비어 있습니다."
    );
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "missing-env" };
  }

  const kwInput = normalizeVolumeKeywordInput(String(keyword ?? ""));
  if (!kwInput || !kwInput.replace(/\s/g, "")) {
    console.warn(`[getKeywordSearchVolume] 빈 키워드: "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const cacheKey = normalizeKeywordKey(kwInput);
  if (!cacheKey) {
    console.warn(`[getKeywordSearchVolume] 빈 키워드(정규화 후): "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const now = Date.now();
  pruneExpiredVolumeCache(now);

  const hit = volumeCache.get(cacheKey);
  if (hit && now - hit.timestamp < CACHE_TTL_MS) {
    return { ...hit.value };
  }

  const value = await fetchKeywordSearchVolumeUncached(
    kwInput,
    accessKey,
    secretKey,
    customerId
  );

  volumeCache.set(cacheKey, { value, timestamp: Date.now() });
  return { ...value };
}
