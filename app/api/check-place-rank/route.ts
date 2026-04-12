import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISPLAY = 15;

// 서울 기본 좌표
const DEFAULT_X = 126.9779692;
const DEFAULT_Y = 37.566535;

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

    console.log("[place-rank-analyze] 시작:", keyword);

    /**
     * ✅ 핵심: allSearch API
     */
    const url = `https://map.naver.com/p/api/search/allSearch?query=${encodeURIComponent(
      keyword
    )}&type=all&searchCoord=${DEFAULT_X};${DEFAULT_Y}&boundary=${DEFAULT_X};${DEFAULT_Y};${DEFAULT_X};${DEFAULT_Y}&sscode=svc.mapv5.search`;

    const res = await fetch(url, {
      headers: {
        Referer: `https://map.naver.com/p/search/${encodeURIComponent(
          keyword
        )}?c=15.00,0,0,0,dh`,
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)",
      },
    });

    const json = await res.json();

    console.log("🔥 allSearch raw:", JSON.stringify(json).slice(0, 500));

    const items =
      json?.result?.place?.list ||
      json?.data?.result?.place?.list ||
      [];

    /**
     * ✅ 리스트 변환
     */
    const list = items.slice(0, DISPLAY).map((item: any, index: number) => {
      const visitor = Number(item.visitorReviewCount || 0);
      const blog = Number(item.blogReviewCount || 0);

      return {
        rank: index + 1,
        placeId: item.id,
        name: item.name,
        category:
          Array.isArray(item.categoryPath)
            ? item.categoryPath.join(" > ")
            : item.category,
        address: item.roadAddress || item.address,
        imageUrl:
          item.imageUrl ||
          item.thumUrl ||
          item.thumbnail,
        review: {
          visitor,
          blog,
          total: visitor + blog,
        },
      };
    });

    console.log("[place-rank-analyze 결과]", {
      total: items.length,
      parsed: list.length,
    });

    /**
     * ✅ 관련 키워드
     */
    const relatedCandidates = [
      keyword,
      `${keyword} 추천`,
      `${keyword} 근처`,
    ];

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
    console.error("[place-rank-analyze ERROR]", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}