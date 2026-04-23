/**
 * 네이버 검색 오픈 API — 쇼핑(shop.json) 기준 순위.
 * - 내부 search.shopping.naver.com JSON 은 비브라우저·데이터센터 IP에서 자주 차단됨 → 공식 API 사용.
 * - display 최대 100, start 최대 1000 → 한 키워드당 최대 약 1000건까지 순회 가능.
 * - 기존 플레이스/블로그와 동일하게 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 사용.
 *   개발자센터 앱에 「검색」API의 쇼핑 검색이 켜져 있어야 함.
 */

const SHOP_API = "https://openapi.naver.com/v1/search/shop.json";
const MAX_START = 1000;
const MAX_DISPLAY = 100;

export type NaverOpenApiShopRankResult = {
  source: "naver_openapi_shop";
  rank: number | null;
  pageNum: number | null;
  position: number | null;
  rankLabel: string;
  notFound: boolean;
  scannedCount: number;
  /** 첫 응답의 total (검색 결과 총량 추정치) */
  totalHint: number | null;
};

type ShopItem = {
  productId?: string | number;
  link?: string;
  mallName?: string;
  mallProductId?: string | number;
};

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없습니다. 네이버 개발자센터에서 발급 후 .env에 설정하세요.");
  }
  return { clientId, clientSecret };
}

function normalizeComparableUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return input.trim();
  }
}

function itemMatchesTarget(
  item: ShopItem,
  targetProductId: string,
  ctx: { space: "NAVER_PRICE" | "PLUS_STORE"; targetProductUrl: string | null }
): boolean {
  const tid = String(targetProductId).trim();
  if (!tid) return false;

  if (ctx.space === "NAVER_PRICE") {
    if (item.productId != null && String(item.productId) === tid) return true;
    if (item.mallProductId != null && String(item.mallProductId) === tid) return true;
  }

  const link = typeof item.link === "string" ? item.link.trim() : "";
  if (!link) return false;
  if (link.includes(`/products/${tid}`) || link.includes(`products/${tid}?`)) return true;
  if (link.includes(`productId=${tid}`) || link.includes(`&productId=${tid}`)) return true;

  if (ctx.space === "PLUS_STORE" && ctx.targetProductUrl) {
    const a = normalizeComparableUrl(ctx.targetProductUrl);
    const b = normalizeComparableUrl(link);
    if (a && b && a === b) return true;

    try {
      const tu = new URL(ctx.targetProductUrl);
      const lu = new URL(link);
      const tHost = tu.hostname.toLowerCase();
      const lHost = lu.hostname.toLowerCase();
      const tPath = tu.pathname.replace(/\/+$/, "");
      const lPath = lu.pathname.replace(/\/+$/, "");
      if (
        (tHost.includes("brand.naver.com") || tHost.includes("smartstore.naver.com")) &&
        tHost === lHost &&
        tPath === lPath
      ) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * @param maxResults 조회할 최대 상품 건수 (기본 1000, API 한도 내로 캡)
 */
export async function findProductRankViaNaverShopOpenApi(
  keyword: string,
  targetProductId: string,
  options?: {
    maxResults?: number;
    sort?: "sim" | "date" | "asc" | "dsc";
    space?: "NAVER_PRICE" | "PLUS_STORE";
    targetProductUrl?: string | null;
  }
): Promise<NaverOpenApiShopRankResult> {
  const kw = String(keyword ?? "").trim();
  const tid = String(targetProductId ?? "").trim();
  if (!kw) throw new Error("검색 키워드가 비어 있습니다.");
  if (!tid) throw new Error("상품 ID가 비어 있습니다.");

  const maxResults = Math.min(Math.max(Number(options?.maxResults) || 1000, 1), MAX_START);
  const sort = options?.sort ?? "sim";
  const space = options?.space ?? "NAVER_PRICE";
  const targetProductUrl = options?.targetProductUrl?.trim()
    ? options?.targetProductUrl!.trim()
    : null;
  const { clientId, clientSecret } = getClientCreds();

  let totalHint: number | null = null;
  let scannedCount = 0;

  for (let start = 1; start <= MAX_START && scannedCount < maxResults; ) {
    const remaining = maxResults - scannedCount;
    const display = Math.min(MAX_DISPLAY, remaining, MAX_START - start + 1);
    if (display < 1) break;

    const url =
      `${SHOP_API}?query=${encodeURIComponent(kw)}` +
      `&display=${display}&start=${start}&sort=${sort}`;

    console.log("[naver-openapi-shopping-rank] 요청", { start, display, keyword: kw });

    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const rawText = await res.text();
    let data: { total?: number; items?: ShopItem[] };
    try {
      data = JSON.parse(rawText) as { total?: number; items?: ShopItem[] };
    } catch {
      console.error("[naver-openapi-shopping-rank] JSON 파싱 실패", {
        httpStatus: res.status,
        head: rawText.slice(0, 200),
      });
      throw new Error(`네이버 쇼핑 API 응답이 JSON이 아닙니다. (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const msg =
        typeof (data as { errorMessage?: string }).errorMessage === "string"
          ? (data as { errorMessage: string }).errorMessage
          : rawText.slice(0, 200);
      console.error("[naver-openapi-shopping-rank] API 오류", { httpStatus: res.status, msg });
      throw new Error(`네이버 쇼핑 API 오류 (HTTP ${res.status}): ${msg}`);
    }

    if (totalHint == null && typeof data.total === "number" && Number.isFinite(data.total)) {
      totalHint = data.total;
    }

    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      console.log("[naver-openapi-shopping-rank] 더 이상 결과 없음", { start });
      break;
    }

    for (let i = 0; i < items.length; i++) {
      const globalRank = start + i;
      scannedCount += 1;
      if (itemMatchesTarget(items[i], tid, { space, targetProductUrl })) {
        const pageNum = Math.floor((start - 1) / MAX_DISPLAY) + 1;
        const position = i + 1;
        return {
          source: "naver_openapi_shop",
          rank: globalRank,
          pageNum,
          position,
          rankLabel: `${globalRank}위`,
          notFound: false,
          scannedCount,
          totalHint,
        };
      }
      if (scannedCount >= maxResults) break;
    }

    if (scannedCount >= maxResults) break;

    const nextStart = start + items.length;
    if (nextStart > MAX_START) break;
    if (items.length < display) break;
    start = nextStart;
  }

  return {
    source: "naver_openapi_shop",
    rank: null,
    pageNum: null,
    position: null,
    rankLabel: "1000위 밖",
    notFound: true,
    scannedCount,
    totalHint,
  };
}

export function isNaverOpenApiConfiguredForShopping(): boolean {
  return Boolean(
    process.env.NAVER_CLIENT_ID?.trim() && process.env.NAVER_CLIENT_SECRET?.trim()
  );
}
