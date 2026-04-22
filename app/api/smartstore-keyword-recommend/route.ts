// app/api/smartstore-keyword-recommend/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

const MIN_MONTHLY_VOLUME = 100;
const MAX_CANDIDATES = 20;

const STOPWORDS = new Set(
  [
    // 구매 유도/마케팅성
    "판매",
    "추천",
    "세일",
    "할인",
    "특가",
    "이벤트",
    "무료",
    "배송",
    "당일",
    "빠른",
    "정품",
    "공식",
    "인기",
    "베스트",
    "best",
    "hot",
    "sale",
    // 너무 일반적/의미 약함
    "상품",
    "제품",
    "구매",
    "후기",
    "리뷰",
    "가격",
    "최저가",
    "가성비",
    "신상",
    // 조사/접속사/기능어 (토큰화가 공백 기준이어서 최소한만)
    "및",
    "또는",
    "그리고",
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
  // 숫자/기호 위주 토큰 제거
  if (!/[a-zA-Z가-힣]/.test(t)) return true;
  // 조사/어미로 끝나는 짧은 토큰(대충 걸러냄)
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

  // 앞쪽에 있을수록 핵심일 가능성
  const positionBoost = idx >= 0 ? 1 - Math.min(idx / Math.max(1, name.length), 0.95) : 0;
  // 너무 짧은 토큰은 중요도가 낮음, 일정 길이까지 가중
  const lengthBoost = Math.min(t.length / 6, 1);

  return inName * 1.5 + positionBoost * 1.0 + lengthBoost * 0.6;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (!productId) return NextResponse.json({ error: "상품 ID가 필요합니다." }, { status: 400 });

  // 1. DB에서 상품 정보(이름, 카테고리) 가져오기
  const product = await prisma.smartstoreProduct.findUnique({
    where: { id: productId },
  });

  if (!product) return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });

  // 2. 상품명에서 키워드 후보 뽑기 (간단하게 띄어쓰기 기준)
  // 예: "어퍼컷디럭스 페더웨이트 수성포마드" -> ["어퍼컷", "디럭스", "포마드"...]
  const wordsRaw = product.name
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1);

  // 중복 제거 + 너무 긴 리스트 방지 (네이버 키워드도구는 요청/응답이 무거울 수 있음)
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of wordsRaw) {
    const t = normalizeToken(w);
    if (!t) continue;
    if (isMeaninglessToken(t)) continue;
    if (seen.has(t)) continue;
    seen.add(w);
    words.push(t);
    if (words.length >= MAX_CANDIDATES) break;
  }

  /**
   * 3) 네이버 검색광고(Search Ads) 키워드도구로 실제 월 검색량을 조회합니다.
   *
   * - `.env` 설정(서버 전용, 절대 NEXT_PUBLIC_*로 두지 마세요)
   *
   *   NAVER_SEARCHAD_ACCESS_KEY=...
   *   NAVER_SEARCHAD_SECRET_KEY=...
   *   NAVER_SEARCHAD_CUSTOMER_ID=...
   *
   * - 에러 핸들링
   *   키가 없거나 호출 실패 시 `getKeywordSearchVolume()`은 로그를 남기고 total=0을 반환합니다.
   */

  const recommendationsRaw = await Promise.all(
    words.map(async (word) => {
      const vol = await getKeywordSearchVolume(word);
      const monthlyVolume = Number(vol.total ?? 0) || 0;
      return {
        keyword: word,
        monthlyVolume,
        _rel: relevanceScore(product.name, word),
      };
    })
  );

  const recommendations = recommendationsRaw
    .filter((r) => r.monthlyVolume >= MIN_MONTHLY_VOLUME)
    .sort((a, b) => {
      // 1) 연관도 우선 (상품명 핵심 토큰)  2) 검색량
      if (b._rel !== a._rel) return b._rel - a._rel;
      return b.monthlyVolume - a.monthlyVolume;
    })
    .map(({ keyword, monthlyVolume }) => ({ keyword, monthlyVolume }));

  return NextResponse.json({ ok: true, recommendations });
}