import * as cheerio from "cheerio";

export type NaverShoppingNextDataRankResult = {
  source: "naver_shopping_next_data";
  rank: number | null;
  pageNum: number | null;
  position: number | null;
  rankLabel: string;
  notFound: boolean;
  scannedCount: number;
  totalHint: number | null;
  elapsedMs: number;
};

export class NaverShoppingNextDataHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function nowMs(): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = (globalThis as any).performance;
  return typeof p?.now === "function" ? p.now() : Date.now();
}

function isAdLike(o: Record<string, unknown>): boolean {
  const truthy = (v: unknown) =>
    v === true ||
    v === 1 ||
    v === "1" ||
    v === "Y" ||
    v === "y" ||
    (typeof v === "string" && v.toLowerCase() === "true");

  const keys = [
    "isAd",
    "isAD",
    "ad",
    "ads",
    "adTarget",
    "adType",
    "adId",
    "adNo",
    "adYn",
    "isSponsored",
    "sponsored",
    "promotion",
    "promoted",
    "isPromotion",
    "isPaid",
    "paid",
    "clickUrl",
    "impUrl",
    "impressionUrl",
  ];

  for (const k of keys) {
    if (!(k in o)) continue;
    const v = o[k];
    if (truthy(v)) return true;
    if (typeof v === "string" && v.trim()) {
      const t = v.toLowerCase();
      if (t.includes("sponsor") || t.includes("promotion")) return true;
    }
  }

  return false;
}

function extractCandidateIds(o: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  push(o.productId);
  push(o.id);
  push(o.nvMid);
  push(o.nv_mid);
  push(o.mallProductId);
  push(o.itemId);
  push(o.catalogId);
  push(o.productNo);
  return out;
}

function findProductListInNextData(nextData: unknown): {
  items: Record<string, unknown>[];
  totalHint: number | null;
} {
  const queue: unknown[] = [nextData];
  let totalHint: number | null = null;
  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const x of cur) queue.push(x);
      continue;
    }
    if (typeof cur !== "object") continue;
    const obj = cur as Record<string, unknown>;

    if (totalHint == null && typeof obj.total === "number" && Number.isFinite(obj.total)) {
      totalHint = obj.total;
    }

    for (const key of ["products", "items", "list", "productList", "results", "result"]) {
      const v = obj[key];
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        return { items: v as Record<string, unknown>[], totalHint };
      }
    }

    for (const v of Object.values(obj)) queue.push(v);
  }
  return { items: [], totalHint };
}

function parseNextDataFromHtml(html: string): unknown {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").text();
  if (!raw?.trim()) {
    throw new Error("__NEXT_DATA__를 찾지 못했습니다. (차단/캡차/페이지 구조 변경 가능)");
  }
  return JSON.parse(raw) as unknown;
}

export async function findProductRankViaNaverShoppingNextData(opts: {
  keyword: string;
  targetProductId: string;
  pageSize?: number;
  cookie?: string | null;
}): Promise<NaverShoppingNextDataRankResult> {
  const t0 = nowMs();
  const keyword = String(opts.keyword ?? "").trim();
  const targetProductId = String(opts.targetProductId ?? "").trim();
  const pageSize = Math.min(Math.max(Number(opts.pageSize) || 40, 10), 200);
  if (!keyword) throw new Error("검색 키워드가 비어 있습니다.");
  if (!targetProductId) throw new Error("상품 ID가 비어 있습니다.");

  const url = `https://search.shopping.naver.com/ns/search?query=${encodeURIComponent(keyword)}`;

  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      ...(opts.cookie?.trim() ? { Cookie: opts.cookie.trim() } : {}),
    },
    cache: "no-store",
  });

  const html = await res.text();
  if (!res.ok) {
    throw new NaverShoppingNextDataHttpError(
      res.status,
      `네이버 쇼핑 HTML 응답 오류 (HTTP ${res.status})`
    );
  }

  const nextData = parseNextDataFromHtml(html);
  const { items, totalHint } = findProductListInNextData(nextData);

  let organicPos = 0;
  for (const it of items) {
    if (isAdLike(it)) continue;
    organicPos += 1;
    const ids = extractCandidateIds(it);
    if (ids.includes(targetProductId)) {
      const rank = organicPos;
      const elapsedMs = Math.round(nowMs() - t0);
      return {
        source: "naver_shopping_next_data",
        rank,
        pageNum: 1,
        position: rank,
        rankLabel: `${rank}위`,
        notFound: false,
        scannedCount: Math.min(organicPos, pageSize),
        totalHint,
        elapsedMs,
      };
    }
  }

  const elapsedMs = Math.round(nowMs() - t0);
  return {
    source: "naver_shopping_next_data",
    rank: null,
    pageNum: null,
    position: null,
    rankLabel: `${pageSize}위 밖`,
    notFound: true,
    scannedCount: Math.min(organicPos, pageSize),
    totalHint,
    elapsedMs,
  };
}

