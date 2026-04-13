import { NextResponse } from "next/server";
import { normalizePlaceSearchKeywordTypos } from "@/lib/place-keyword-fallback";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import { fetchAllSearchPlacesWithTokenDetailed } from "@/lib/naver-map-all-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 네이버 지도 map.naver.com `allSearch` 프록시.
 * 토큰 없으면 서버에서 환경변수·캐시·무토큰·Playwright 순으로 자동 시도합니다.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = String(body.keyword || "").trim();
    const tokenFromBody = String(body.token || "").trim();
    const { normalized: keyword } = normalizePlaceSearchKeywordTypos(raw);

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 없음" },
        { status: 400 }
      );
    }

    if (tokenFromBody) {
      const r = await fetchAllSearchPlacesWithTokenDetailed(
        keyword,
        tokenFromBody
      );
      if (!r.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "TOKEN_REJECT",
            keyword,
            message: r.userMessage,
            places: [],
          },
          { status: 502 }
        );
      }
      return NextResponse.json({
        ok: true,
        keyword,
        totalCount: r.totalCount,
        places: r.places,
        mode: "bodyToken",
      });
    }

    const r = await fetchAllSearchPlacesAutoDetailed(keyword);
    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        code: "AUTO_FAILED",
        keyword,
        message: r.userMessage,
        places: [],
      });
    }

    return NextResponse.json({
      ok: true,
      keyword,
      totalCount: r.totalCount,
      places: r.places,
      mode: "auto",
    });
  } catch (e) {
    console.error("[naver-map-all-search]", e);
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "실패",
        places: [],
      },
      { status: 500 }
    );
  }
}
