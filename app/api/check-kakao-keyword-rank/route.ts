import { authOptions } from "@/auth";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import {
  extractKakaoPlaceId,
  fetchKakaoKeywordRankDiagnostic,
  KakaoKeywordRankError,
  type KakaoKeywordRankResult,
} from "@/lib/kakao-keyword-rank";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchVolumeDiagnostic = {
  searchVolumeStatus: string;
  searchVolumeValue: number | null;
  mobileVolume: number | null;
  pcVolume: number | null;
  debugReason: string | null;
};

type KeywordCheckResult = {
  keyword: string;
  saved: boolean;
  historyId: string | null;
  rank: number | null;
  rankLabel: string | null;
  reason: string;
  debugReason: string | null;
  diagnostic: KakaoKeywordRankResult | null;
  searchVolumeStatus: string;
  searchVolumeValue: number | null;
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return Response.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    if (!placeId) {
      return Response.json(
        { ok: false, error: "placeId가 필요합니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, userId, type: "kakao-place" },
      include: { keywords: { orderBy: { createdAt: "asc" } } },
    });
    if (!place) {
      return Response.json(
        { ok: false, error: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const storedKakaoPlaceId = extractKakaoPlaceId(place.placeUrl);
    const results: KeywordCheckResult[] = [];

    for (const keyword of place.keywords) {
      const volume = await refreshKeywordVolume({
        id: keyword.id,
        keyword: keyword.keyword,
        mobileVolume: keyword.mobileVolume,
        pcVolume: keyword.pcVolume,
        totalVolume: keyword.totalVolume,
        volumeStatus: keyword.volumeStatus,
      });

      try {
        const diagnostic = await fetchKakaoKeywordRankDiagnostic({
          keyword: keyword.keyword,
          targetPlaceName: place.name,
          targetAddress: place.address,
          storedKakaoPlaceId,
          storedPlaceUrl: place.placeUrl,
        });
        const rankLabel = buildRankLabel(diagnostic);

        let history;
        try {
          history = await prisma.rankHistory.create({
            data: {
              placeId,
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
        } catch (historyError) {
          const debugReason =
            historyError instanceof Error
              ? historyError.message
              : String(historyError);
          console.error("[check-kakao-keyword-rank history-save-failed]", {
            keyword: keyword.keyword,
            placeId,
            reason: "HISTORY_SAVE_FAILED",
            debugReason,
          });
          results.push({
            keyword: keyword.keyword,
            saved: false,
            historyId: null,
            rank: diagnostic.ranking,
            rankLabel,
            reason: "HISTORY_SAVE_FAILED",
            debugReason,
            diagnostic,
            searchVolumeStatus: volume.searchVolumeStatus,
            searchVolumeValue: volume.searchVolumeValue,
          });
          continue;
        }

        logKeywordDiagnostic(diagnostic, volume);
        results.push({
          keyword: keyword.keyword,
          saved: true,
          historyId: history.id,
          rank: diagnostic.ranking,
          rankLabel,
          reason: diagnostic.reason,
          debugReason: diagnostic.debugReason,
          diagnostic,
          searchVolumeStatus: volume.searchVolumeStatus,
          searchVolumeValue: volume.searchVolumeValue,
        });
      } catch (error) {
        const reason =
          error instanceof KakaoKeywordRankError
            ? error.reason
            : "RANK_CHECK_FAILED";
        const debugReason =
          error instanceof Error ? error.message : String(error);
        console.error("[check-kakao-keyword-rank failed]", {
          keyword: keyword.keyword,
          targetPlaceName: place.name,
          targetAddress: place.address,
          storedKakaoPlaceId,
          storedPlaceUrl: place.placeUrl,
          reason,
          debugReason,
          searchVolumeStatus: volume.searchVolumeStatus,
          searchVolumeValue: volume.searchVolumeValue,
        });
        results.push({
          keyword: keyword.keyword,
          saved: false,
          historyId: null,
          rank: null,
          rankLabel: null,
          reason,
          debugReason,
          diagnostic: null,
          searchVolumeStatus: volume.searchVolumeStatus,
          searchVolumeValue: volume.searchVolumeValue,
        });
      }
    }

    const savedCount = results.filter((result) => result.saved).length;
    const failedCount = results.length - savedCount;
    return Response.json({
      ok: failedCount === 0,
      savedCount,
      failedCount,
      results,
      ...(failedCount > 0
        ? { error: `일부 키워드 조회 또는 저장 실패 (${failedCount}건)` }
        : null),
    });
  } catch (error) {
    console.error("check-kakao-keyword-rank error:", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "순위 조회 실패",
      },
      { status: 500 }
    );
  }
}

function buildRankLabel(result: KakaoKeywordRankResult): string {
  if (result.reason === "FOUND" && result.ranking) return `${result.ranking}위`;
  if (result.reason === "OUT_OF_RANGE_45") return "45위 밖";
  return `${result.checkedCount}개 확인 / 미발견`;
}

async function refreshKeywordVolume(keyword: {
  id: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  volumeStatus: string | null;
}): Promise<SearchVolumeDiagnostic> {
  try {
    const volume = await getKeywordSearchVolume(keyword.keyword);
    const isReliable =
      volume.ok === true &&
      (volume.total > 0 || volume.persistentlyConfirmedZero === true);
    const status = isReliable
      ? volume.persistentlyConfirmedZero
        ? "CONFIRMED_ZERO"
        : "FOUND"
      : `UNKNOWN_${volume.reason ?? "UNAVAILABLE"}`.toUpperCase();

    const legacyFalseZero =
      keyword.volumeStatus == null &&
      keyword.mobileVolume === 0 &&
      keyword.pcVolume === 0 &&
      keyword.totalVolume === 0;
    await prisma.placeKeyword.update({
      where: { id: keyword.id },
      data: isReliable
        ? {
            mobileVolume: volume.mobile,
            pcVolume: volume.pc,
            totalVolume: volume.total,
            volumeStatus: status,
            volumeDebugReason: null,
          }
        : {
            ...(legacyFalseZero
              ? { mobileVolume: null, pcVolume: null, totalVolume: null }
              : null),
            volumeStatus: status,
            volumeDebugReason: volume.reason ?? "UNAVAILABLE",
          },
    });

    return {
      searchVolumeStatus: status,
      searchVolumeValue: isReliable ? volume.total : null,
      mobileVolume: isReliable ? volume.mobile : null,
      pcVolume: isReliable ? volume.pc : null,
      debugReason: isReliable ? null : volume.reason ?? "UNAVAILABLE",
    };
  } catch (error) {
    const debugReason = error instanceof Error ? error.message : String(error);
    return {
      searchVolumeStatus: "UNKNOWN_EXCEPTION",
      searchVolumeValue: null,
      mobileVolume: null,
      pcVolume: null,
      debugReason,
    };
  }
}

function logKeywordDiagnostic(
  diagnostic: KakaoKeywordRankResult,
  volume: SearchVolumeDiagnostic
): void {
  console.log("[check-kakao-keyword-rank result]", {
    keyword: diagnostic.keyword,
    targetPlaceName: diagnostic.targetPlaceName,
    targetAddress: diagnostic.targetAddress,
    storedKakaoPlaceId: diagnostic.storedKakaoPlaceId,
    storedPlaceUrl: diagnostic.storedPlaceUrl,
    matchedKakaoPlaceId: diagnostic.matchedKakaoPlaceId,
    matchedPlaceName: diagnostic.matchedPlaceName,
    matchedAddress: diagnostic.matchedAddress,
    ranking: diagnostic.ranking,
    page: diagnostic.page,
    position: diagnostic.position,
    totalFetchedCount: diagnostic.totalFetchedCount,
    dedupedCount: diagnostic.dedupedCount,
    checkedCount: diagnostic.checkedCount,
    isMatched: diagnostic.isMatched,
    reason: diagnostic.reason,
    debugReason: diagnostic.debugReason,
    searchVolumeStatus: volume.searchVolumeStatus,
    searchVolumeValue: volume.searchVolumeValue,
  });
}
