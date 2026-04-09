import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KakaoDoc = { id: string; place_name: string; address_name: string; road_address_name: string };

function extractKakaoId(placeUrl: string): string {
  const match = placeUrl.match(/\/(\d+)(?:\/|$)/);
  return match?.[1] ?? "";
}

async function searchKakaoByKeyword(keyword: string): Promise<KakaoDoc[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return [];

  const results: KakaoDoc[] = [];
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
      results.push(...docs);
      if (docs.length < 15) break; // 마지막 페이지
    } catch {
      break;
    }
  }
  return results;
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return Response.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    if (!placeId) {
      return Response.json({ ok: false, error: "placeId가 필요합니다." }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, userId, type: "kakao-place" },
      include: { keywords: true },
    });
    if (!place) {
      return Response.json({ ok: false, error: "매장을 찾을 수 없습니다." }, { status: 404 });
    }

    const kakaoId = extractKakaoId(place.placeUrl ?? "");
    if (!kakaoId) {
      return Response.json({ ok: false, error: "카카오 ID를 확인할 수 없습니다." }, { status: 400 });
    }

    const results: { keyword: string; rank: number | null }[] = [];

    for (const kw of place.keywords) {
      const docs = await searchKakaoByKeyword(kw.keyword);
      const idx = docs.findIndex((d) => d.id === kakaoId);
      const rank = idx >= 0 ? idx + 1 : null;

      // RankHistory에 저장
      await prisma.rankHistory.create({
        data: { placeId, keyword: kw.keyword, rank: rank ?? 0 },
      });

      console.log(`[check-kakao-keyword-rank] "${kw.keyword}" → rank: ${rank ?? "미진입"}`);
      results.push({ keyword: kw.keyword, rank });
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    console.error("check-kakao-keyword-rank error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "순위 조회 실패" },
      { status: 500 }
    );
  }
}
