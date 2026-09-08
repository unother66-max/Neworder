import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { fetchKakaoMapTop150, KakaoTop150SearchError } from "@/lib/kakao-map-top150";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  ).slice(0, 3);

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

    const [searchResult, related] = await Promise.all([
      fetchKakaoMapTop150(keyword),
      buildRelatedKeywords(keyword),
    ]);

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list: searchResult.list,
      warning: searchResult.partial
        ? `${searchResult.failedPage}페이지 수집에 실패해 ${searchResult.list.length}개 부분 결과만 표시합니다.`
        : null,
      meta: {
        source: "KAKAO_MAP_WEB_SEARCH",
        maxResults: 150,
        requestCount: searchResult.requestCount,
        duplicateCount: searchResult.duplicateCount,
        availableCount: searchResult.availableCount,
        partial: searchResult.partial,
        failedPage: searchResult.failedPage,
        durationMs: searchResult.durationMs,
      },
    });
  } catch (error) {
    console.error("kakao-rank-analyze error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof KakaoTop150SearchError
            ? `카카오맵 ${error.page}페이지 수집 실패: ${error.message}`
            : error instanceof Error
              ? error.message
              : "분석 실패",
      },
      { status: 500 }
    );
  }
}
