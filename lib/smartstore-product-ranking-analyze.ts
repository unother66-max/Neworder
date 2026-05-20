import {
  cooldownOn429,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";

const SHOP_API = "https://openapi.naver.com/v1/search/shop.json";
const MAX_LIMIT = 40;

export type ProductRankingItem = {
  rank: number;
  productName: string;
  productUrl?: string;
  imageUrl?: string;
  storeName?: string;
  category?: string;
  price?: number | null;
  deliveryFee?: string | null;
  reviewCount?: number | null;
  rating?: number | null;
  sellerGrade?: string | null;
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
  adId?: string | number;
  ad?: boolean;
  isAd?: boolean;
  mallProductId?: string | number;
};

type ShopJsonResponse = {
  total?: number;
  start?: number;
  display?: number;
  items?: ShopJsonItem[];
  errorMessage?: string;
};

function getClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되어 있지 않습니다.");
  }
  return { clientId, clientSecret };
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function parseOptionalInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function joinCategory(it: ShopJsonItem): string | undefined {
  const parts = [it.category1, it.category2, it.category3, it.category4]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" > ") : undefined;
}

function looksLikeAd(it: ShopJsonItem): boolean {
  if (it.ad === true || it.isAd === true) return true;
  if (it.adId != null && String(it.adId).trim()) return true;
  return false;
}

function itemToRankingItem(it: ShopJsonItem, rank: number): ProductRankingItem {
  const productName = stripHtmlTags(typeof it.title === "string" ? it.title : "");
  const link = typeof it.link === "string" && it.link.trim() ? it.link.trim() : undefined;
  const image = typeof it.image === "string" && it.image.trim() ? it.image.trim() : undefined;
  const mallName =
    typeof it.mallName === "string" && it.mallName.trim() ? it.mallName.trim() : undefined;
  const price = parseOptionalInt(it.lprice ?? it.hprice);
  return {
    rank,
    productName: productName || "상품명 없음",
    productUrl: link,
    imageUrl: image,
    storeName: mallName,
    category: joinCategory(it),
    price,
    deliveryFee: null,
    reviewCount: null,
    rating: null,
    sellerGrade: null,
  };
}

export async function analyzeSmartstoreProductRanking(input: {
  keyword: string;
  limit?: number;
}): Promise<{ keyword: string; items: ProductRankingItem[] }> {
  const keyword = input.keyword.trim();
  if (!keyword) throw new Error("검색 키워드를 입력해 주세요.");
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? MAX_LIMIT), 1), MAX_LIMIT);
  const { clientId, clientSecret } = getClientCreds();

  const url = new URL(SHOP_API);
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", String(Math.min(100, limit + 20)));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 429) {
    await cooldownOn429();
    throw new SmartstoreNaverRateLimitedError("네이버 쇼핑 검색 API가 일시적으로 제한되었습니다.");
  }

  const raw = await res.text();
  let data: ShopJsonResponse;
  try {
    data = JSON.parse(raw) as ShopJsonResponse;
  } catch {
    throw new Error("네이버 쇼핑 검색 응답을 해석하지 못했습니다.");
  }

  if (!res.ok) {
    const msg = typeof data.errorMessage === "string" ? data.errorMessage : raw.slice(0, 160);
    throw new Error(`네이버 쇼핑 검색 API 오류 (HTTP ${res.status}): ${msg}`);
  }

  const organic = (Array.isArray(data.items) ? data.items : []).filter((it) => !looksLikeAd(it));
  return {
    keyword,
    items: organic.slice(0, limit).map((it, idx) => itemToRankingItem(it, idx + 1)),
  };
}
