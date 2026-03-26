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

export async function getKeywordSearchVolume(keyword: string) {
  const accessKey = process.env.NAVER_SEARCHAD_ACCESS_KEY;
  const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY;
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID;

  if (!accessKey || !secretKey || !customerId) {
    return "-";
  }

  const method = "GET";
  const uri = "/keywordstool";
  const timestamp = Date.now().toString();
  const signature = makeSignature(timestamp, method, uri, secretKey);

  const qs = new URLSearchParams({
    hintKeywords: keyword.replace(/\s+/g, ""),
    showDetail: "1",
  });

  const url = `https://api.searchad.naver.com${uri}?${qs.toString()}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": accessKey,
      "X-Customer": customerId,
      "X-Signature": signature,
      "Content-Type": "application/json; charset=UTF-8",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`검색광고 API 호출 실패: ${res.status}`);
  }

  const data = await res.json();
  const list = (data.keywordList || []) as KeywordToolItem[];

  if (!list.length) return "-";

  const exact =
    list.find((item) => item.relKeyword?.trim() === keyword.trim()) || list[0];

  const pc = toNumber(exact.monthlyPcQcCnt);
  const mobile = toNumber(exact.monthlyMobileQcCnt);
  const total = pc + mobile;

  return total.toLocaleString("ko-KR");
}