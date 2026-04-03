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

async function fetchMobileHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
    },
    cache: "no-store",
  });

  return {
    ok: res.ok,
    html: await res.text(),
  };
}

async function fetchPcHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
    cache: "no-store",
  });

  return {
    ok: res.ok,
    html: await res.text(),
  };
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
  ];

  for (const pattern of patterns) {
    for (const match of chunk.matchAll(pattern)) {
      const id = match?.[1];
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function extractOrderedPlaceIds(html: string) {
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  // 1) 검색 결과 영역 후보를 먼저 좁힘
  const sections: string[] = [];

  const listSectionMatch =
    html.match(/<ul[^>]*class="[^"]*list_place[^"]*"[^>]*>([\s\S]*?)<\/ul>/i) ||
    html.match(/<div[^>]*id="place-main-section-root"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div[^>]*class="[^"]*place_section[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (listSectionMatch?.[1]) {
    sections.push(listSectionMatch[1]);
  }

  // 2) 블록 단위로 먼저 추출 (순서 보존)
  const blockPatterns = [
    /<li\b[^>]*>[\s\S]*?<\/li>/gi,
    /<div\b[^>]*class="[^"]*(?:item|place|list_item)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
  ];

  for (const section of sections) {
    for (const blockPattern of blockPatterns) {
      const blocks = section.match(blockPattern) || [];
      for (const block of blocks) {
        const idsInBlock = extractIdsFromChunk(block);
        if (!idsInBlock.length) continue;

        const firstId = idsInBlock[0];
        if (!seen.has(firstId)) {
          seen.add(firstId);
          orderedIds.push(firstId);
        }
      }
    }
  }

  // 3) 블록 추출이 약하면 섹션 전체에서 fallback
  if (!orderedIds.length) {
    for (const section of sections) {
      const ids = extractIdsFromChunk(section);
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        orderedIds.push(id);
      }
    }
  }

  // 4) 그래도 없으면 전체 html fallback
  if (!orderedIds.length) {
    const ids = extractIdsFromChunk(html);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }
  }

  return orderedIds;
}

function isValidRankList(ids: string[]) {
  if (!ids.length) return false;

  // 너무 적으면 실패로 보되, 너무 많다고 버리지는 않음
  // "한남동 맛집" 같은 넓은 키워드는 id가 많이 섞일 수 있어서
  // 기존 50개 초과 필터가 오히려 정상 후보를 버렸을 가능성이 큼
  return true;
}

function findRank(placeIds: string[], targetPlaceId: string) {
  const normalizedTarget = String(targetPlaceId).trim();

  const index = placeIds.findIndex((id) => {
    const current = String(id).trim();
    return current === normalizedTarget;
  });

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

        let ids = extractOrderedPlaceIds(result.html);

        if (!ids.length) {
          const jsonIds = extractPlaceIdsFromNextData(result.html);
          ids = jsonIds;
        }

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

async function getPcRank(keyword: string, placeId: string) {
  const encoded = encodeURIComponent(normalizeText(keyword));

  for (let page = 1; page <= 20; page++) {
    const url = `https://map.naver.com/p/search/${encoded}?page=${page}`;

    try {
      const result = await fetchPcHtml(url);
      if (!result.ok) continue;

      let ids = extractOrderedPlaceIds(result.html);

      if (!ids.length) {
        const jsonIds = extractPlaceIdsFromNextData(result.html);
        ids = jsonIds;
      }

      if (!isValidRankList(ids)) continue;

      const rank = findRank(ids, placeId);

      if (rank !== "-") {
        const currentRank = Number(rank.replace("위", ""));
        const globalRank = (page - 1) * 15 + currentRank;

        console.log("[check-place-rank][pc] matched", {
          keyword,
          placeId,
          page,
          rank: globalRank,
        });

        return `${globalRank}위`;
      }

      console.log("[check-place-rank][pc] not found", {
        keyword,
        placeId,
        page,
        idsCount: ids.length,
      });
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

function extractPlaceIdsFromNextData(html: string) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  if (!match) return [];

  try {
    const json = JSON.parse(match[1]);

    const text = JSON.stringify(json);

    const ids = [...text.matchAll(/"placeId":"(\d+)"/g)].map((m) => m[1]);

    return [...new Set(ids)];
  } catch (e) {
    return [];
  }
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