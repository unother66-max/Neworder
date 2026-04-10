import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PLACES = 30;
const PANEL3_CONCURRENCY = 4;

type KakaoDoc = {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  place_url: string;
  x: string;
  y: string;
};

async function searchKakaoByKeyword(keyword: string): Promise<KakaoDoc[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return [];

  const seen = new Set<string>();
  const out: KakaoDoc[] = [];

  for (let page = 1; page <= 3; page++) {
    try {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&size=15&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        cache: "no-store",
      });
      if (!res.ok) break;
      const data = await res.json();
      const docs: KakaoDoc[] = data.documents ?? [];
      for (const d of docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          out.push(d);
        }
        if (out.length >= MAX_PLACES) return out;
      }
      if (docs.length < 15) break;
    } catch {
      break;
    }
  }

  return out;
}

async function fetchKakaoPlaceImage(kakaoId: string): Promise<string> {
  try {
    const res = await fetch(`https://place.map.kakao.com/${kakaoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });
    if (!res.ok) return "";
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

async function fetchPanel3(kakaoId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://place-api.map.kakao.com/places/panel3/${kakaoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        appVersion: "6.6.0",
        pf: "MW",
        Referer: `https://place.map.kakao.com/${kakaoId}`,
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** panel3 JSON 구조가 버전마다 달라 가능한 경로·키워드 스캔 */
function extractReviewFromPanel3(panel3: Record<string, unknown> | null): {
  total: number;
  rating: number | null;
} {
  if (!panel3) return { total: 0, rating: null };

  let total = 0;
  let rating: number | null = null;

  const summary = panel3.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary.review === "object" && summary.review) {
    const rev = summary.review as Record<string, unknown>;
    total =
      toNum(rev.count) ??
      toNum(rev.review_count) ??
      toNum(rev.total_count) ??
      toNum(rev.totalCount) ??
      0;
    if (total === 0) {
      const n = toNum(rev.reviewCount);
      if (n !== null) total = Math.floor(n);
    }
    rating =
      toNum(rev.score) ??
      toNum(rev.star_score) ??
      toNum(rev.star_rating) ??
      toNum(rev.average) ??
      toNum(rev.point) ??
      null;
  }

  const walk = (obj: unknown, depth: number) => {
    if (depth > 8 || obj === null || obj === undefined) return;
    if (typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        (key.includes("review") && (key.includes("count") || key.includes("cnt") || key.includes("total"))) ||
        key === "reviewcount" ||
        key === "total_review_count"
      ) {
        const n = toNum(v);
        if (n !== null && n > total) total = Math.floor(n);
      }
      if (
        key === "score" ||
        key === "star_score" ||
        key === "starrating" ||
        key === "average_score" ||
        key === "point"
      ) {
        const n = toNum(v);
        if (n !== null && n >= 0 && n <= 5 && rating === null) rating = n;
      }
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };

  if (total === 0 || rating === null) walk(panel3, 0);

  return { total: Math.max(0, total), rating };
}

async function mapPool<T, R>(items: T[], pool: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += pool) {
    const chunk = items.slice(i, i + pool);
    const part = await Promise.all(chunk.map((item) => fn(item)));
    out.push(...part);
  }
  return out;
}

async function buildRelatedKeywords(keyword: string) {
  const candidates = [
    keyword,
    `${keyword} 추천`,
    `${keyword} 근처`,
    `${keyword} 데이트`,
    `${keyword} 맛집`,
  ];

  const unique = Array.from(
    new Set(candidates.map((item) => String(item || "").trim()).filter(Boolean))
  ).slice(0, 5);

  return Promise.all(
    unique.map(async (item) => {
      try {
        const volume = await getKeywordSearchVolume(item);
        const mobile = volume?.mobile ?? 0;
        const pc = volume?.pc ?? 0;
        return {
          keyword: item,
          total: mobile + pc,
          mobile,
          pc,
        };
      } catch {
        return { keyword: item, total: 0, mobile: 0, pc: 0 };
      }
    })
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();

    if (!keyword) {
      return NextResponse.json({ ok: false, message: "keyword 없음" }, { status: 400 });
    }

    if (!process.env.KAKAO_REST_API_KEY) {
      return NextResponse.json(
        { ok: false, message: "KAKAO_REST_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const docs = await searchKakaoByKeyword(keyword);

    const images = await mapPool(docs, PANEL3_CONCURRENCY, async (d) => fetchKakaoPlaceImage(d.id));

    const panelResults = await mapPool(docs, PANEL3_CONCURRENCY, async (d) => fetchPanel3(d.id));

    const list = docs.map((doc, index) => {
      const panel3 = panelResults[index];
      const { total, rating } = extractReviewFromPanel3(panel3);

      return {
        rank: index + 1,
        placeId: doc.id,
        name: doc.place_name || "-",
        category: String(doc.category_name || "").trim(),
        address: String(doc.road_address_name || doc.address_name || "").trim(),
        imageUrl: images[index] || "",
        review: {
          total,
          rating,
        },
      };
    });

    const related = await buildRelatedKeywords(keyword);

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list,
    });
  } catch (error) {
    console.error("kakao-rank-analyze error:", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "분석 실패",
      },
      { status: 500 }
    );
  }
}
