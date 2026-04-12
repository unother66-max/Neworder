/**
 * 스마트스토어 일반 상품 전용: 공식 네이버 쇼핑 검색 API(shop.json)로 최소 메타 보강.
 * brand.naver.com 경로에서는 호출하지 않음(호출부에서 분기).
 */

import { canonicalNaverStoreHost } from "@/lib/smartstore-url";

const SHOP_API = "https://openapi.naver.com/v1/search/shop.json";
const LOG_P = "[smartstore-search-api]";
const MAX_DISPLAY = 100;

function logNaverEnvForProcess(): void {
  const id = process.env.NAVER_CLIENT_ID;
  const sec = process.env.NAVER_CLIENT_SECRET;
  console.log("[smartstore-search-api] env", {
    NAVER_CLIENT_ID_loaded: Boolean(id?.trim()),
    NAVER_CLIENT_ID_length: id?.trim()?.length ?? 0,
    NAVER_CLIENT_SECRET_loaded: Boolean(sec?.trim()),
    NAVER_CLIENT_SECRET_length: sec?.trim()?.length ?? 0,
  });
}

export type SmartstoreSearchApiInput = {
  productUrl: string;
  productId: string;
  attemptedChannelSlug?: string | null;
  /** DB에 있던 상품명 (3순위 검색어) */
  existingNameHint?: string | null;
  /** Playwright/스크래퍼 상품명 (1순위 검색어) */
  playwrightProductName?: string | null;
  /** og:title 등 (2순위 검색어) */
  ogTitle?: string | null;
  /**
   * JSON API·병합 후 현재 페이지 상품명 (4순위, productId 직전).
   * Playwright/og/existing과 중복되면 제외됨.
   */
  pageProductNameHint?: string | null;
};

export type SmartstoreSearchApiMetaResult = {
  name: string | null;
  thumbnailLink: string | null;
  mallName: string | null;
  category: string | null;
  price: number | null;
  matchedProductId: string | null;
  matchedLink: string | null;
  searchApiUsed: boolean;
  searchApiMatched: boolean;
};

type ShopJsonItem = {
  title?: string;
  link?: string;
  image?: string;
  lprice?: string;
  hprice?: string;
  mallName?: string;
  productId?: string | number;
  category1?: string;
  category2?: string;
  category3?: string;
  category4?: string;
  brand?: string;
  maker?: string;
};

type QueryCandidate = { raw: string; source: string };

function getClientCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isSmartstoreShoppingSearchConfigured(): boolean {
  return Boolean(getClientCreds());
}

function extractSmartstoreSlugFromUrl(productUrl: string): string | null {
  try {
    const raw = productUrl.trim();
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (canonicalNaverStoreHost(u.hostname) !== "smartstore.naver.com") {
      return null;
    }
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    if (pi > 0 && /^\d+$/.test(String(segs[pi + 1] ?? ""))) {
      return segs[pi - 1] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function joinCategories(it: ShopJsonItem): string | null {
  const parts = [
    it.category1,
    it.category2,
    it.category3,
    it.category4,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" > ");
}

function parsePrice(l: string | undefined, h: string | undefined): number | null {
  const raw = (l ?? h ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** 쇼핑 검색 쿼리용: 브랜드 접미사·괄호·특수문자 정제 */
function sanitizeShoppingSearchQuery(raw: string): string {
  let s = raw.trim();
  if (!s) return "";

  const colonIdx = s.search(/\s*[:：]\s+/);
  if (colonIdx !== -1) {
    s = s.slice(0, colonIdx).trim();
  }

  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\s*\/\s*/g, " ");
  s = s.replace(/[^\p{L}\p{N}\s가-힣ㄱ-ㅎㅏ-ㅣ]/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(s: string): string {
  return sanitizeShoppingSearchQuery(s).toLowerCase();
}

function meaningfulTokens(norm: string): string[] {
  return norm.split(/\s+/).filter((t) => {
    if (t.length >= 2) return true;
    return /[가-힣]/.test(t);
  });
}

function buildQueryCandidates(input: SmartstoreSearchApiInput): QueryCandidate[] {
  const out: QueryCandidate[] = [];
  const seenRaw = new Set<string>();

  const push = (source: string, v: string | null | undefined) => {
    const t = v?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seenRaw.has(key)) return;
    seenRaw.add(key);
    out.push({ raw: t, source });
  };

  push("playwrightName", input.playwrightProductName);
  push("ogTitle", input.ogTitle);
  push("existingName", input.existingNameHint);
  push("pageName", input.pageProductNameHint);
  push("productId", input.productId);

  return out;
}

/** productId·링크·슬러그 기반 (숫자 쿼리·토큰 없을 때) */
function pickLegacyPidSlug(
  items: ShopJsonItem[],
  targetProductId: string,
  slug: string | null
): ShopJsonItem | null {
  const pid = targetProductId.trim();
  if (!pid || items.length === 0) return null;
  const slugL = slug?.trim().toLowerCase() ?? "";

  const byPid = items.filter((i) => String(i.productId ?? "") === pid);
  if (byPid.length > 0) return byPid[0];

  const byLink = items.filter((i) => {
    const link = typeof i.link === "string" ? i.link : "";
    if (!link.includes(pid)) return false;
    return (
      /smartstore\.naver\.com/i.test(link) ||
      /brand\.naver\.com/i.test(link) ||
      /shopping\.naver\.com/i.test(link)
    );
  });
  if (byLink.length > 0) return byLink[0];

  if (slugL.length >= 2) {
    const byMallOrTitle = items.filter((i) => {
      const m = (i.mallName || "").toLowerCase();
      const t = stripHtmlTags(i.title || "").toLowerCase();
      return (m && m.includes(slugL)) || (t && t.includes(slugL));
    });
    if (byMallOrTitle.length > 0) return byMallOrTitle[0];
  }

  return null;
}

type ItemMatchEval = {
  score: number;
  matchedTokens: number;
  pidExact: boolean;
  linkHasPid: boolean;
};

function minMatchedTokensRequired(tokenCount: number): number {
  if (tokenCount <= 0) return 1;
  if (tokenCount === 1) return 1;
  return Math.min(tokenCount, Math.max(2, Math.ceil(tokenCount * 0.45)));
}

function evaluateItemMatch(
  it: ShopJsonItem,
  pid: string,
  slug: string | null,
  queryNorm: string,
  queryTokens: string[]
): ItemMatchEval {
  const link = (typeof it.link === "string" ? it.link : "").toLowerCase();
  const title = stripHtmlTags(typeof it.title === "string" ? it.title : "");
  const titleNorm = normalizeForMatch(title);
  const pidStr = String(it.productId ?? "").trim();
  const mall = (it.mallName || "").toLowerCase();
  const slugL = slug?.trim().toLowerCase() ?? "";

  const pidExact = pidStr === pid;
  const linkHasPid = Boolean(pid && link.includes(pid));

  let score = 0;
  if (pidExact) score += 2000;
  else if (linkHasPid) score += 900;

  let matchedTokens = 0;
  for (const tok of queryTokens) {
    if (tok.length < 1) continue;
    if (titleNorm.includes(tok)) matchedTokens += 1;
  }
  score += matchedTokens * 55;

  if (slugL.length >= 2) {
    if (mall.includes(slugL)) score += 85;
    if (titleNorm.includes(slugL)) score += 45;
  }

  const qCompact = queryNorm.replace(/\s+/g, "");
  const tCompact = titleNorm.replace(/\s+/g, "");
  if (qCompact.length >= 4 && tCompact.includes(qCompact)) {
    score += 120;
  }

  return { score, matchedTokens, pidExact, linkHasPid };
}

function pickBestByTitleSimilarity(
  items: ShopJsonItem[],
  targetProductId: string,
  slug: string | null,
  finalQuery: string
): ShopJsonItem | null {
  if (items.length === 0) return null;
  const pid = targetProductId.trim();
  const fq = finalQuery.trim();

  if (/^\d+$/.test(fq)) {
    return pickLegacyPidSlug(items, pid, slug);
  }

  const queryNorm = normalizeForMatch(fq);
  const queryTokens = meaningfulTokens(queryNorm);
  if (queryTokens.length === 0) {
    return pickLegacyPidSlug(items, pid, slug);
  }

  let best: ShopJsonItem | null = null;
  let bestScore = -1;

  for (const it of items) {
    const ev = evaluateItemMatch(it, pid, slug, queryNorm, queryTokens);
    if (ev.score > bestScore) {
      bestScore = ev.score;
      best = it;
    }
  }

  if (!best) return null;

  const bestEv = evaluateItemMatch(best, pid, slug, queryNorm, queryTokens);
  if (bestEv.pidExact || bestEv.linkHasPid) {
    return best;
  }

  const need = minMatchedTokensRequired(queryTokens.length);
  if (bestEv.matchedTokens < need) {
    return null;
  }
  if (bestEv.score < 75) {
    return null;
  }
  return best;
}

async function fetchShopPage(
  query: string,
  creds: { clientId: string; clientSecret: string },
  signal?: AbortSignal
): Promise<ShopJsonItem[]> {
  const q = query.trim();
  if (!q) return [];
  const url =
    `${SHOP_API}?query=${encodeURIComponent(q)}&display=${MAX_DISPLAY}&start=1&sort=sim`;
  const res = await fetch(url, {
    signal,
    headers: {
      "X-Naver-Client-Id": creds.clientId,
      "X-Naver-Client-Secret": creds.clientSecret,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const rawText = await res.text();
  let data: { items?: ShopJsonItem[] };
  try {
    data = JSON.parse(rawText) as { items?: ShopJsonItem[] };
  } catch {
    console.error(`${LOG_P} JSON 파싱 실패`, {
      httpStatus: res.status,
      head: rawText.slice(0, 200),
    });
    return [];
  }
  if (!res.ok) {
    const msg =
      typeof (data as { errorMessage?: string }).errorMessage === "string"
        ? (data as { errorMessage: string }).errorMessage
        : rawText.slice(0, 200);
    console.error(`${LOG_P} HTTP 오류`, { httpStatus: res.status, msg });
    return [];
  }
  return Array.isArray(data.items) ? data.items : [];
}

function itemToMeta(
  it: ShopJsonItem,
  targetProductId: string
): SmartstoreSearchApiMetaResult {
  const title = stripHtmlTags(typeof it.title === "string" ? it.title : "");
  const image = typeof it.image === "string" && it.image.trim() ? it.image.trim() : null;
  const mall =
    typeof it.mallName === "string" && it.mallName.trim() ? it.mallName.trim() : null;
  const link = typeof it.link === "string" && it.link.trim() ? it.link.trim() : null;
  const mid = it.productId != null ? String(it.productId).trim() : null;
  const price = parsePrice(it.lprice, it.hprice);
  return {
    name: title.length > 0 ? title : null,
    thumbnailLink: image,
    mallName: mall,
    category: joinCategories(it),
    price,
    matchedProductId: mid || targetProductId,
    matchedLink: link,
    searchApiUsed: true,
    searchApiMatched: true,
  };
}

/**
 * 스마트스토어 상품 메타가 비었을 때 쇼핑 검색으로 1건 매칭.
 */
export async function fetchSmartstoreMetaViaShoppingSearchApi(
  input: SmartstoreSearchApiInput,
  signal?: AbortSignal
): Promise<SmartstoreSearchApiMetaResult> {
  const empty: SmartstoreSearchApiMetaResult = {
    name: null,
    thumbnailLink: null,
    mallName: null,
    category: null,
    price: null,
    matchedProductId: null,
    matchedLink: null,
    searchApiUsed: false,
    searchApiMatched: false,
  };

  console.log("[smartstore-search-api] started", {
    productId: input.productId,
    productUrl: input.productUrl,
    attemptedChannelSlug: input.attemptedChannelSlug ?? null,
    playwrightProductName: input.playwrightProductName?.trim() || null,
    ogTitle: input.ogTitle?.trim() || null,
    existingNameHint: input.existingNameHint?.trim() || null,
    pageProductNameHint: input.pageProductNameHint?.trim() || null,
  });
  logNaverEnvForProcess();

  const creds = getClientCreds();
  if (!creds) {
    console.log("[smartstore-search-api] finalPayload", empty);
    return empty;
  }

  const pid = String(input.productId ?? "").trim();
  if (!pid) {
    console.log("[smartstore-search-api] finalPayload", empty);
    return empty;
  }

  const slug =
    (input.attemptedChannelSlug?.trim() || null) ??
    extractSmartstoreSlugFromUrl(input.productUrl);

  const labeled = buildQueryCandidates(input);
  const tried: Array<{ source: string; finalQuery: string }> = [];

  for (const { raw, source } of labeled) {
    const finalQuery = sanitizeShoppingSearchQuery(raw);
    if (!finalQuery) {
      continue;
    }
    if (finalQuery.length < 2 && !/^\d+$/.test(finalQuery)) {
      continue;
    }

    tried.push({ source, finalQuery });
    console.log("[smartstore-search-api] finalQuery", { finalQuery, source });
    const items = await fetchShopPage(finalQuery, creds, signal);
    console.log("[smartstore-search-api] resultCount", {
      finalQuery,
      resultCount: items.length,
    });
    const top3Titles = items.slice(0, 3).map((it) =>
      stripHtmlTags(typeof it.title === "string" ? it.title : "").slice(0, 200)
    );
    console.log("[smartstore-search-api] top3 titles", {
      finalQuery,
      titles: top3Titles,
    });

    const pick = pickBestByTitleSimilarity(items, pid, slug, finalQuery);
    console.log("[smartstore-search-api] matched", {
      finalQuery,
      source,
      matched: Boolean(pick),
      pickProductId: pick != null ? String(pick.productId ?? "") || null : null,
      pickLink:
        typeof pick?.link === "string" ? pick.link.slice(0, 200) : null,
    });
    if (!pick) {
      continue;
    }

    const meta = itemToMeta(pick, pid);
    console.log("[smartstore-search-api] finalPayload", meta);
    return meta;
  }

  const unmatched: SmartstoreSearchApiMetaResult = {
    ...empty,
    searchApiUsed: true,
    searchApiMatched: false,
  };
  console.log("[smartstore-search-api] finalPayload", {
    ...unmatched,
    triedQueries: tried,
  });
  return unmatched;
}
