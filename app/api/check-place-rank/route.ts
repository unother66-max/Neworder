import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchAdKeywordItem = {
  relKeyword?: string;
  monthlyPcQcCnt?: string | number;
  monthlyMobileQcCnt?: string | number;
};

function normalizeText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKeywordForVolume(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

async function fetchMobileHtml(url: string) {
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

  return {
    ok: response.ok,
    status: response.status,
    html: await response.text(),
  };
}

function pushUnique(ids: string[], seen: Set<string>, id?: string | null) {
  if (!id) return;
  const trimmed = String(id).trim();
  if (!trimmed) return;
  if (seen.has(trimmed)) return;
  seen.add(trimmed);
  ids.push(trimmed);
}

function extractIdsFromChunk(chunk: string) {
  const ids: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    /https?:\/\/m\.place\.naver\.com\/restaurant\/(\d+)\/home/gi,
    /https?:\/\/m\.place\.naver\.com\/place\/(\d+)\/home/gi,
    /https?:\\\/\\\/m\.place\.naver\.com\\\/restaurant\\\/(\d+)\\\/home/gi,
    /https?:\\\/\\\/m\.place\.naver\.com\\\/place\\\/(\d+)\\\/home/gi,
    /\/restaurant\/(\d+)\/home/gi,
    /\/place\/(\d+)\/home/gi,
    /\/entry\/place\/(\d+)/gi,
    /"placeId":"(\d+)"/gi,
    /"businessId":"(\d+)"/gi,
    /"id":"(\d+)","type":"place"/gi,
    /[?&]placePath=%2Frestaurant%2F(\d+)%2Fhome/gi,
    /[?&]placePath=%2Fplace%2F(\d+)%2Fhome/gi,
    /[?&]placeId=(\d+)/gi,
    /[?&]businessId=(\d+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of chunk.matchAll(pattern)) {
      pushUnique(ids, seen, match?.[1]);
    }
  }

  return ids;
}

function extractIdsFromHrefAttributes(chunk: string) {
  const ids: string[] = [];
  const seen = new Set<string>();

  const hrefMatches = [
    ...chunk.matchAll(/href="([^"]+)"/gi),
    ...chunk.matchAll(/href='([^']+)'/gi),
  ];

  for (const match of hrefMatches) {
    const href = match?.[1] || "";
    const found = extractIdsFromChunk(href);
    for (const id of found) pushUnique(ids, seen, id);
  }

  return ids;
}

function extractPlaceIdsFromNextData(html: string) {
  const ids: string[] = [];
  const seen = new Set<string>();

  const scriptMatches = [
    ...html.matchAll(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/gi
    ),
    ...html.matchAll(
      /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const match of scriptMatches) {
    const raw = match?.[1];
    if (!raw) continue;

    try {
      const json = JSON.parse(raw);
      const text = JSON.stringify(json);

      const patterns = [
        /"placeId":"(\d+)"/g,
        /"businessId":"(\d+)"/g,
        /\/restaurant\/(\d+)\/home/g,
        /\/place\/(\d+)\/home/g,
        /\/entry\/place\/(\d+)/g,
      ];

      for (const pattern of patterns) {
        for (const item of text.matchAll(pattern)) {
          pushUnique(ids, seen, item?.[1]);
        }
      }
    } catch {
      continue;
    }
  }

  return ids;
}

function extractCandidateIds(html: string) {
  const ids: string[] = [];
  const seen = new Set<string>();

  const fromWholeHtml = extractIdsFromChunk(html);
  for (const id of fromWholeHtml) pushUnique(ids, seen, id);

  const fromHrefs = extractIdsFromHrefAttributes(html);
  for (const id of fromHrefs) pushUnique(ids, seen, id);

  const fromNextData = extractPlaceIdsFromNextData(html);
  for (const id of fromNextData) pushUnique(ids, seen, id);

  return ids;
}

function extractOrderedPlaceIds(html: string) {
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const sections: string[] = [];

  const sectionPatterns = [
    /<ul[^>]*class="[^"]*list_place[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi,
    /<div[^>]*id="place-main-section-root"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*place_section[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<section[^>]*>([\s\S]*?)<\/section>/gi,
  ];

  for (const pattern of sectionPatterns) {
    for (const match of html.matchAll(pattern)) {
      if (match?.[1]) sections.push(match[1]);
    }
  }

  const blockPatterns = [
    /<li\b[^>]*>[\s\S]*?<\/li>/gi,
    /<div\b[^>]*class="[^"]*(?:item|place|list_item|list-place)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<article\b[^>]*>[\s\S]*?<\/article>/gi,
  ];

  for (const section of sections) {
    for (const blockPattern of blockPatterns) {
      const blocks = section.match(blockPattern) || [];
      for (const block of blocks) {
        let idsInBlock = extractIdsFromChunk(block);

        if (!idsInBlock.length) {
          idsInBlock = extractIdsFromHrefAttributes(block);
        }

        if (!idsInBlock.length) continue;

        pushUnique(orderedIds, seen, idsInBlock[0]);
      }
    }
  }

  if (!orderedIds.length) {
    for (const section of sections) {
      const ids = extractCandidateIds(section);
      for (const id of ids) pushUnique(orderedIds, seen, id);
    }
  }

  if (!orderedIds.length) {
    const ids = extractCandidateIds(html);
    for (const id of ids) pushUnique(orderedIds, seen, id);
  }

  return orderedIds;
}

function isValidRankList(ids: string[]) {
  return ids.length > 0;
}

function findRank(placeIds: string[], targetPlaceId: string) {
  const normalizedTarget = String(targetPlaceId).trim();

  const index = placeIds.findIndex((id) => String(id).trim() === normalizedTarget);

  if (index === -1) return "-";
  return `${index + 1}위`;
}

async function getMobileRank(keyword: string, placeId: string) {
  const encoded = encodeURIComponent(normalizeText(keyword));

  for (let page = 1; page <= 20; page++) {
    const urls = [
      `https://m.map.naver.com/search2/search.naver?query=${encoded}&page=${page}`,
      `https://m.search.naver.com/search.naver?query=${encoded}&where=m&sm=mtb_hty&page=${page}`,
    ];

    for (const url of urls) {
      try {
        const result = await fetchMobileHtml(url);
        if (!result.ok) continue;

        const ids = extractOrderedPlaceIds(result.html);
        if (!isValidRankList(ids)) continue;

        const rank = findRank(ids, placeId);

        if (rank !== "-") {
          const currentRank = Number(rank.replace("위", ""));
          const globalRank = (page - 1) * 15 + currentRank;

          console.log("[check-place-rank][mobile] matched", {
            keyword,
            placeId,
            page,
            url,
            rank: globalRank,
          });

          return `${globalRank}위`;
        }

        console.log("[check-place-rank][mobile] not found", {
          keyword,
          placeId,
          page,
          url,
          idsCount: ids.length,
          sampleIds: ids.slice(0, 20),
        });
      } catch (error) {
        console.error("getMobileRank error:", error);
      }
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

  return response.json();
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

    const [mobileRank, volume] = await Promise.all([
      getMobileRank(keyword, placeId),
      getKeywordVolume(keyword),
    ]);

    return Response.json({
      monthly: volume.monthly || "-",
      mobile: volume.mobile || "-",
      pc: volume.pc || "-",
      rank: mobileRank,
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