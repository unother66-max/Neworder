import crypto from "crypto";

type KeywordToolItem = {
  relKeyword?: string;
  monthlyPcQcCnt?: number | string;
  monthlyMobileQcCnt?: number | string;
};

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

/** relKeyword와 사용자 입력의 공백·유니코드 정규화 차이 흡수 */
function normalizeKeywordKey(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const COMMON_SUFFIX =
  "피자|맛집|치킨|카페|데이트|회식|술집|브런치|파스타|떡볶이|순대|족발|한식|중식|일식|양식";

/** API는 hint에 쉼표로 여러 키워드를 넣으면 오류/빈 목록이 나는 경우가 있어, 한 번에 하나만 전달 */
function hintCandidates(keyword: string): string[] {
  const trimmed = keyword.trim();
  const compact = trimmed.replace(/\s+/g, "");
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const h = s.replace(/\s+/g, "");
    if (h && !seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  };
  add(compact);
  if (!trimmed.includes(" ")) {
    const re = new RegExp(`^(.+)(${COMMON_SUFFIX})$`, "u");
    const m = trimmed.match(re);
    if (m?.[1] && m?.[2]) {
      add(`${m[1]} ${m[2]}`);
    }
  }
  return out.slice(0, 3);
}

export async function getKeywordSearchVolume(keyword: string) {
  const accessKey = process.env.NAVER_SEARCHAD_ACCESS_KEY;
  const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY;
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID;

  if (!accessKey || !secretKey || !customerId) {
    return {
      mobile: 0,
      pc: 0,
      total: 0,
    };
  }

  const method = "GET";
  const uri = "/keywordstool";
  const key = normalizeKeywordKey(keyword);

  const attemptFetch = (hintKeywords: string) => {
    const qs = new URLSearchParams({
      hintKeywords,
      showDetail: "1",
    });
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

  let list: KeywordToolItem[] = [];

  for (const hint of hintCandidates(keyword)) {
    let res = await attemptFetch(hint);
    if (!res.ok && (res.status === 429 || res.status === 503)) {
      await new Promise((r) => setTimeout(r, 400));
      res = await attemptFetch(hint);
    }
    if (!res.ok) continue;

    const data = await res.json();
    const next = (data.keywordList || []) as KeywordToolItem[];
    if (next.length) {
      list = next;
      break;
    }
  }

  if (!list.length) {
    return { mobile: 0, pc: 0, total: 0 };
  }

  const exact =
    list.find((item) => normalizeKeywordKey(item.relKeyword ?? "") === key) ||
    list.find((item) => item.relKeyword?.trim() === keyword.trim()) ||
    list[0];

  const pc = toNumber(exact.monthlyPcQcCnt);
  const mobile = toNumber(exact.monthlyMobileQcCnt);

  return {
    mobile,
    pc,
    total: pc + mobile,
  };
}