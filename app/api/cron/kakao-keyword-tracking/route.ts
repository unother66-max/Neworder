import { NextResponse } from "next/server";

import {
  extractKakaoPlaceId,
  fetchKakaoKeywordRankDiagnostic,
  KakaoKeywordRankError,
  type KakaoKeywordRankResult,
} from "@/lib/kakao-keyword-rank";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrackingResult = {
  placeId: string;
  keywordId: string;
  keyword: string;
  saved: boolean;
  rank: number | null;
  reason: string;
  debugReason: string | null;
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const places = await prisma.place.findMany({
      where: {
        type: "kakao-place",
        keywords: { some: { isTracking: true } },
      },
      select: {
        id: true,
        name: true,
        address: true,
        placeUrl: true,
        keywords: {
          where: { isTracking: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, keyword: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const results: TrackingResult[] = [];

    for (const place of places) {
      const storedKakaoPlaceId = extractKakaoPlaceId(place.placeUrl);

      for (const keyword of place.keywords) {
        try {
          const diagnostic = await fetchKakaoKeywordRankDiagnostic({
            keyword: keyword.keyword,
            targetPlaceName: place.name,
            targetAddress: place.address,
            storedKakaoPlaceId,
            storedPlaceUrl: place.placeUrl,
          });
          const rankLabel = buildRankLabel(diagnostic);
          await prisma.rankHistory.create({
            data: {
              placeId: place.id,
              keyword: keyword.keyword,
              rank: diagnostic.ranking ?? 0,
              source: diagnostic.source,
              resultStatus: diagnostic.reason,
              rankLabel,
              checkedCount: diagnostic.checkedCount,
              pageNum: diagnostic.page,
              position: diagnostic.position,
              matchedId: diagnostic.matchedKakaoPlaceId,
              debugReason: diagnostic.debugReason,
            },
          });

          results.push({
            placeId: place.id,
            keywordId: keyword.id,
            keyword: keyword.keyword,
            saved: true,
            rank: diagnostic.ranking,
            reason: diagnostic.reason,
            debugReason: diagnostic.debugReason,
          });
        } catch (error) {
          const reason =
            error instanceof KakaoKeywordRankError
              ? error.reason
              : "RANK_CHECK_FAILED";
          const debugReason =
            error instanceof Error ? error.message : String(error);
          console.error("[kakao-keyword-tracking cron] keyword failed", {
            placeId: place.id,
            keywordId: keyword.id,
            keyword: keyword.keyword,
            reason,
            debugReason,
          });
          results.push({
            placeId: place.id,
            keywordId: keyword.id,
            keyword: keyword.keyword,
            saved: false,
            rank: null,
            reason,
            debugReason,
          });
        }
      }
    }

    const savedCount = results.filter((result) => result.saved).length;
    const failedCount = results.length - savedCount;
    console.log("[kakao-keyword-tracking cron] complete", {
      totalPlaces: places.length,
      totalKeywords: results.length,
      savedCount,
      failedCount,
    });

    return NextResponse.json({
      ok: true,
      totalPlaces: places.length,
      totalKeywords: results.length,
      savedCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("[kakao-keyword-tracking cron] fatal", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Cron failed",
      },
      { status: 500 }
    );
  }
}

function buildRankLabel(result: KakaoKeywordRankResult): string {
  if (result.reason === "FOUND" && result.ranking) {
    return `${result.ranking}위`;
  }
  if (result.reason === "OUT_OF_RANGE_45") return "45위 밖";
  return `${result.checkedCount}개 확인 / 미발견`;
}
