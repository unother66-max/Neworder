// app/api/smartstore-keyword-recommend/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import * as cheerio from "cheerio";
import { extractNaverSmartstoreProductId } from "@/lib/smartstore-url";

const MIN_MONTHLY_VOLUME = 100;
const MAX_CANDIDATES = 40;
const MAX_RETURN = 15;

const STOPWORDS = new Set(
  [
    // 구매 유도/마케팅성
    "판매", "추천", "세일", "할인", "특가", "이벤트", "무료", "배송",
    "당일", "빠른", "정품", "공식", "인기", "베스트", "best", "hot", "sale",
    // 너무 일반적/의미 약함
    "상품", "제품", "구매", "후기", "리뷰", "가격", "최저가", "가성비", "신상",
    // 조사/접속사/기능어
    "및", "또는", "그리고",
  ].map((s) => s.toLowerCase())
);

function normalizeToken(s: string) {
  return String(s ?? "").trim().normalize("NFKC");
}

function isMeaninglessToken(token: string) {
  const t = normalizeToken(token);
  if (!t) return true;
  if (t.length < 2) return true;
  if (STOPWORDS.has(t.toLowerCase())) return true;
  if (!/[a-zA-Z가-힣]/.test(t)) return true;
  if (t.length <= 3 && /(은|는|이|가|을|를|에|의|로|와|과|도|만|까지|부터|에서)$/.test(t)) {
    return true;
  }
  return false;
}

function relevanceScore(productName: string, token: string) {
  const name = normalizeToken(productName);
  const t = normalizeToken(token);
  if (!name || !t) return 0;

  const idx = name.indexOf(t);
  const inName = idx >= 0 ? 1 : 0;
  const positionBoost = idx >= 0 ? 1 - Math.min(idx / Math.max(1, name.length), 0.95) : 0;
  const lengthBoost = Math.min(t.length / 6, 1);

  return inName * 1.5 + positionBoost * 1.0 + lengthBoost * 0.6;
}

function dedupeKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = normalizeToken(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function extractChannelIdFromProductUrl(normalized: string): string | null {
  try {
    const u = new URL(normalized);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h !== "smartstore.naver.com" && h !== "brand.naver.com") return null;
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    if (pi > 0 && /^\d+$/.test(segs[pi + 1] ?? "")) {
      return segs[pi - 1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

// 🔥 1순위: 내부 API 스니핑 (강력한 위장 헤더 장착)
async function fetchSellerTagsFromInternalApi(input: {
  productUrl: string;
  channelId: string;
  productId: string;
}): Promise<{ tags: string[]; status: number | null }> {
  const apiUrl = `https://smartstore.naver.com/i/v2/channels/${encodeURIComponent(
    input.channelId
  )}/products/${encodeURIComponent(input.productId)}?withWindow=false`;

  try {
    const cookie = process.env.NAVER_COOKIE?.trim() || process.env.SMARTSTORE_COOKIE?.trim() || "";
    
    // 네이버가 모바일 브라우저로 착각하게 만드는 풀세트 헤더
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": input.productUrl,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
    });

    const status = res.status;
    const text = await res.text();
    if (!res.ok) return { tags: [], status };
    
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { tags: [], status };
    }
    
    const list = Array.isArray(json?.seoInfo?.sellerTags)
      ? (json.seoInfo.sellerTags as any[])
      : [];
    const tags = list
      .map((x) => (typeof x?.text === "string" ? x.text.trim() : ""))
      .filter(Boolean);
      
    return { tags: dedupeKeepOrder(tags), status };
  } catch {
    return { tags: [], status: null };
  }
}

// 🔥 폴백: HTML 메타 태그 (여기도 위장 헤더 장착)
async function fetchKeywordsFromHtmlMeta(productUrl: string): Promise<{
  keywords: string[];
  status: number | null;
}> {
  try {
    const cookie = process.env.NAVER_COOKIE?.trim() || process.env.SMARTSTORE_COOKIE?.trim() || "";
    const res = await fetch(productUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
    });
    
    const status = res.status;
    const html = await res.text();
    if (!res.ok) return { keywords: [], status };
    
    const $ = cheerio.load(html);
    const raw =
      $('meta[property="og:keywords"]').attr("content") ||
      $('meta[name="keywords"]').attr("content") ||
      "";
    const kws = String(raw || "")
      .split(/[,|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const cleaned = dedupeKeepOrder(kws).filter((t) => !isMeaninglessToken(t));
    
    return { keywords: cleaned.slice(0, 30), status };
  } catch {
    return { keywords: [], status: null };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const n = Math.max(1, Math.floor(limit));
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (!productId) return NextResponse.json({ error: "상품 ID가 필요합니다." }, { status: 400 });

  const product = await prisma.smartstoreProduct.findUnique({
    where: { id: productId },
  });

  if (!product) return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });

  const normalizedUrl = (() => {
    const raw = String(product.productUrl ?? "").trim();
    if (!raw) return "";
    return raw.startsWith("http") ? raw : `https://${raw}`;
  })();

  const naverProductId =
    extractNaverSmartstoreProductId(normalizedUrl) || String(product.productId ?? "").trim();
  const channelId = normalizedUrl ? extractChannelIdFromProductUrl(normalizedUrl) : null;

  // 1순위: 내부 API seoInfo.sellerTags
  const sellerTagsResult =
    channelId && naverProductId
      ? await fetchSellerTagsFromInternalApi({
          productUrl: normalizedUrl,
          channelId,
          productId: naverProductId,
        })
      : { tags: [], status: null };

  // 2순위(폴백): HTML meta 태그
  const metaResult =
    sellerTagsResult.tags.length === 0 && normalizedUrl
      ? await fetchKeywordsFromHtmlMeta(normalizedUrl)
      : { keywords: [], status: null };

  // 3순위: 상품명 토큰 (최후의 보루)
  const nameTokens = String(product.name ?? "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[()[\]{}]/g, "").trim())
    .filter((w) => !isMeaninglessToken(w));

  const candidates = dedupeKeepOrder([
    ...sellerTagsResult.tags,
    ...metaResult.keywords,
    ...nameTokens,
  ]).slice(0, MAX_CANDIDATES);

  // 검색량 조회
  const recommendationsRaw = await mapWithConcurrency(candidates, 1, async (word) => {
    const vol = await getKeywordSearchVolume(word);
    const monthlyVolume = Number(vol.total ?? 0) || 0;
    return {
      keyword: word,
      monthlyVolume,
      _rel: relevanceScore(product.name, word),
      _src: sellerTagsResult.tags.includes(word)
        ? "sellerTags"
        : metaResult.keywords.includes(word)
          ? "meta"
          : "name",
    };
  });

  // 정렬 및 반환
  const recommendations = recommendationsRaw
    .filter((r) => r.monthlyVolume >= MIN_MONTHLY_VOLUME)
    .sort((a, b) => {
      // 우선순위 1: 태그에서 가져온 진짜 데이터인가?
      if (a._src === "sellerTags" && b._src !== "sellerTags") return -1;
      if (b._src === "sellerTags" && a._src !== "sellerTags") return 1;
      
      // 우선순위 2: 연관도
      if (b._rel !== a._rel) return b._rel - a._rel;
      
      // 우선순위 3: 검색량
      return b.monthlyVolume - a.monthlyVolume;
    })
    .map(({ keyword, monthlyVolume }) => ({ keyword, monthlyVolume }));

  const debug = {
    channelId,
    naverProductId,
    sellerTagsStatus: sellerTagsResult.status,
    metaStatus: metaResult.status,
    sellerTagsCount: sellerTagsResult.tags.length,
    metaCount: metaResult.keywords.length,
  };
  console.log("[DEBUG INFO]", debug);

  return NextResponse.json({
    ok: true,
    recommendations: recommendations.slice(0, MAX_RETURN),
    debug,
  });
}