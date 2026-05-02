import * as cheerio from "cheerio";

export class NaverShoppingNextDataHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RankResult {
  rank: number | null;
  rankLabel: string;
}

export async function findProductRankViaNaverShoppingNextData({
  keyword,
  targetProductId,
  pageSize = 80,
}: {
  keyword: string;
  targetProductId: string;
  pageSize?: number;
}): Promise<RankResult> {
  const url = `https://search.shopping.naver.com/ns/search?query=${encodeURIComponent(
    keyword
  )}&pagingSize=${pageSize}`;

  // 네이버 봇 차단(403)을 피하기 위한 브라우저 위장 헤더
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
  };

  console.log(`[Plus Store Scraping] Fetching: ${url}`);
  const res = await fetch(url, { headers, cache: "no-store" });

  if (!res.ok) {
    // 여기서 차단되면 에러를 던집니다.
    console.error(`[Plus Store Scraping] 네이버 접근 차단됨 (HTTP ${res.status})`);
    throw new NaverShoppingNextDataHttpError(
      `Naver NS Search Error: ${res.status}`,
      res.status
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const nextDataString = $("#__NEXT_DATA__").text();
  if (!nextDataString) {
    return { rank: null, rankLabel: "미노출 (데이터 구조 변경)" };
  }

  let nextData;
  try {
    nextData = JSON.parse(nextDataString);
  } catch (e) {
    return { rank: null, rankLabel: "미노출 (파싱 실패)" };
  }

  const productList = extractProductArrayFallback(nextData);

  if (!productList || productList.length === 0) {
    return { rank: null, rankLabel: "미노출" };
  }

  let currentRank = 1;

  for (const rawItem of productList) {
    const item = rawItem.item || rawItem;

    // 사용자 요청: 일단 광고도 포함해서 순위가 16위가 나오는지 테스트!
    // (광고를 뺄 때는 아래 주석을 풀면 됩니다)
    // if (item.isAd || item.adId || rawItem.isAd) continue;

    const id1 = String(item.id || "");
    const id2 = String(item.productId || "");
    const id3 = String(item.mallProductId || "");
    const id4 = String(item.nvMid || "");

    if (
      id1 === targetProductId ||
      id2 === targetProductId ||
      id3 === targetProductId ||
      id4 === targetProductId
    ) {
      return {
        rank: currentRank,
        rankLabel: `${currentRank}위`,
      };
    }
    currentRank++;
  }

  return { rank: null, rankLabel: "1000위 밖" };
}

// 상품 배열 딥서치 함수
function extractProductArrayFallback(obj: any): any[] {
  let maxArray: any[] = [];
  const search = (current: any) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      const validItems = current.filter(
        (i) =>
          i &&
          typeof i === "object" &&
          (i.id || i.productId || i.nvMid || i.item?.id || i.item?.productId || i.item?.nvMid)
      );
      if (validItems.length > maxArray.length) {
        maxArray = current;
      }
    }
    for (const key of Object.keys(current)) {
      if (typeof current[key] === "object") {
        search(current[key]);
      }
    }
  };
  search(obj);
  return maxArray;
}