import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchAdKeywordItem = {
  relKeyword?: string;
  monthlyPcQcCnt?: string | number;
  monthlyMobileQcCnt?: string | number;
};

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywordForVolume(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://map.naver.com/",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
    cache: "no-store",
  });

  const html = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    html,
  };
}

function extractOrderedPlaceIds(html: string) {
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    /https?:\/\/m\.place\.naver\.com\/restaurant\/(\d+)\/home/gi,
    /https?:\/\/m\.place\.naver\.com\/place\/(\d+)\/home/gi,
    /https?:\\\/\\\/m\.place\.naver\.com\\\/restaurant\\\/(\d+)\\\/home/gi,
    /https?:\\\/\\\/m\.place\.naver\.com\\\/place\\\/(\d+)\\\/home/gi,
    /"placeId":"(\d+)"/gi,
    /"businessId":"(\d+)"/gi,
    /\/restaurant\/(\d+)\/home/gi,
    /\/place\/(\d+)\/home/gi,
    /\/entry\/place\/(\d+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const id = match?.[1];
      if (!id) continue;
      if (seen.has(id)) continue;

      seen.add(id);
      orderedIds.push(id);
    }
  }

  return orderedIds;
}

function findRank(placeIds: string[], targetPlaceId: string) {
  const index = placeIds.findIndex((id) => id === targetPlaceId);
  if (index === -1) return "-";
  return `${index + 1}위`;
}

async function getMobileRank(keyword: string, placeId: string) {
  const encoded = encodeURIComponent(normalizeText(keyword));
  const urls = [
    `https://m.map.naver.com/search2/search.naver?query=${encoded}`,
    `https://m.search.naver.com/search.naver?query=${encoded}`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchHtml(url);
      if (!result.ok) continue;

      const ids = extractOrderedPlaceIds(result.html);
      if (!ids.length) continue;

      const rank = findRank(ids, placeId);
      if (rank !== "-") return rank;
    } catch (error) {
      console.error("getMobileRank error:", error);
    }
  }

  return "-";
}

async function getPcRank(keyword: string, placeId: string) {
  const encoded = encodeURIComponent(normalizeText(keyword));
  const urls = [
    `https://map.naver.com/p/search/${encoded}`,
    `https://pcmap.place.naver.com/restaurant/list?query=${encoded}`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchHtml(url);
      if (!result.ok) continue;

      const ids = extractOrderedPlaceIds(result.html);
      if (!ids.length) continue;

      const rank = findRank(ids, placeId);
      if (rank !== "-") return rank;
    } catch (error) {
      console.error("getPcRank error:", error);
    }
  }

  return "-";
}

function createSignature(
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

function parseCountValue(value: string | number | undefined) {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.includes("<")) return 0;

  const numeric = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(numeric)) return null;

  return numeric;
}

function formatCountValue(value: string | number | undefined) {
  if (value === undefined || value === null) return "-";

  const raw = String(value).trim();
  if (!raw) return "-";

  if (raw.includes("<")) return "10 미만";

  const numeric = Number(raw.replace(/,/g, ""));
  if (Number.isNaN(numeric)) return raw;

  return numeric.toLocaleString("ko-KR");
}

async function requestKeywordVolume(keywordForVolume: string) {
  const apiKey = process.env.NAVER_SEARCHAD_ACCESS_KEY || "";
  const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY || "";
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID || "";

  if (!apiKey || !secretKey || !customerId) {
    console.warn("NAVER_SEARCHAD 환경변수가 비어있습니다.");
    return null;
  }

  const method = "GET";
  const uri = "/keywordstool";
  const timestamp = Date.now().toString();
  const signature = createSignature(timestamp, method, uri, secretKey);

  const params = new URLSearchParams();
  params.set("hintKeywords", keywordForVolume);
  params.set("showDetail", "1");

  const url = `https://api.searchad.naver.com${uri}?${params.toString()}`;

  console.log("keyword volume request keyword:", keywordForVolume);
  console.log("keyword volume request url:", url);

  const response = await fetch(url, {
    method,
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": apiKey,
      "X-Customer": customerId,
      "X-Signature": signature,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("keyword volume api error:", response.status, text);
    return null;
  }

  const data = await response.json();
  console.log("keyword volume raw response:", JSON.stringify(data));

  return data;
}

async function getKeywordVolume(keyword: string) {
  const normalizedKeyword = normalizeText(keyword);
  const compactKeyword = normalizeKeywordForVolume(keyword);

  if (!compactKeyword) {
    return {
      monthly: "-",
      mobile: "-",
      pc: "-",
    };
  }

  const data =
    (await requestKeywordVolume(compactKeyword)) ||
    (compactKeyword !== normalizedKeyword
      ? await requestKeywordVolume(normalizedKeyword)
      : null);

  const keywordList: SearchAdKeywordItem[] = Array.isArray(data?.keywordList)
    ? data.keywordList
    : [];

  if (!keywordList.length) {
    return {
      monthly: "-",
      mobile: "-",
      pc: "-",
    };
  }

  const target =
    keywordList.find(
      (item) => normalizeKeywordForVolume(item.relKeyword || "") === compactKeyword
    ) ||
    keywordList.find((item) =>
      normalizeKeywordForVolume(item.relKeyword || "").includes(compactKeyword)
    ) ||
    keywordList[0];

  if (!target) {
    return {
      monthly: "-",
      mobile: "-",
      pc: "-",
    };
  }

  const pcRaw = target.monthlyPcQcCnt;
  const mobileRaw = target.monthlyMobileQcCnt;

  const pcNumber = parseCountValue(pcRaw);
  const mobileNumber = parseCountValue(mobileRaw);

  const total =
    pcNumber !== null && mobileNumber !== null ? pcNumber + mobileNumber : null;

  return {
    monthly: total !== null ? total.toLocaleString("ko-KR") : "-",
    mobile: formatCountValue(mobileRaw),
    pc: formatCountValue(pcRaw),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const keyword = normalizeText(body.keyword || "");
    const placeId = normalizeText(body.placeId || "");

    if (!keyword || !placeId) {
      return Response.json(
        { error: "keyword와 placeId가 필요합니다." },
        { status: 400 }
      );
    }

    const [mobileRank, pcRank, volume] = await Promise.all([
      getMobileRank(keyword, placeId),
      getPcRank(keyword, placeId),
      getKeywordVolume(keyword),
    ]);

    return Response.json({
      monthly: volume.monthly || "-",
      mobile: volume.mobile || "-",
      pc: volume.pc || "-",
      rank: mobileRank !== "-" ? mobileRank : pcRank,
    });
  } catch (error) {
    console.error("check-place-rank error:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "순위 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}