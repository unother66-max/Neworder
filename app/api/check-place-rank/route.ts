import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import { mapAllSearchRowsToCheckPlaceRankList } from "@/lib/naver-map-all-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DISPLAY = 15;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 필요" },
        { status: 400 }
      );
    }

    console.log("[check-place-rank] 시작:", keyword);

    const auto = await fetchAllSearchPlacesAutoDetailed(keyword);
    const pack = auto.ok ? auto : null;

    const list =
      pack && pack.places.length > 0
        ? mapAllSearchRowsToCheckPlaceRankList(pack.places, DISPLAY)
        : [];

    console.log("[check-place-rank 결과]", {
      total: pack?.places.length ?? 0,
      parsed: list.length,
      autoOk: auto.ok,
    });

    const relatedCandidates = [keyword, `${keyword} 추천`, `${keyword} 근처`];

    const related = [];

    for (const k of relatedCandidates) {
      try {
        const volume = await getKeywordSearchVolume(k);
        related.push({
          keyword: k,
          ...volume,
        });
      } catch {
        related.push({
          keyword: k,
          total: 0,
          mobile: 0,
          pc: 0,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list,
    });
  } catch (e) {
    console.error("[check-place-rank ERROR]", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
