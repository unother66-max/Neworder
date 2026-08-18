import { NextRequest, NextResponse } from "next/server";
import { interleaveTrackedKeywordsByPlace } from "@/lib/place-tracking-cron";
import { prisma } from "@/lib/prisma";
import { utcRangeSeoulCalendarDay } from "@/lib/seoul-calendar";

const CRON_NEW_CLAIM_CUTOFF_MS = 260_000;
const CRON_CLEANUP_DEADLINE_MS = 285_000;
const RANK_REQUEST_TIMEOUT_MS = 110_000;
const GLOBAL_BLOCK_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const GLOBAL_BLOCK_PREFIX = "GLOBAL_BLOCK:";
const DEFAULT_REQUEST_PACE_MS = 1_000;

type TrackedKeyword = {
  id: string;
  placeId: string;
  keyword: string;
  isTracking: boolean;
  lastAttemptAt: Date | null;
  place: {
    name: string;
    category: string | null;
    x: string | null;
    y: string | null;
  };
};

type RankResponse = {
  canSaveRank?: boolean;
  rank?: string | number;
  source?: string | null;
  resultStatus?: string | null;
  displayRank?: string | null;
  checkedCount?: number | null;
  failureCode?: string | null;
  diagnostics?: {
    completedPages?: number | null;
    debugReason?: string | null;
    captchaDetected?: boolean;
    cooldownDetected?: boolean;
  } | null;
};

type TrackingResult = {
  keywordId: string;
  placeId: string;
  saved: boolean;
  observed: boolean;
  reason: string;
  blocked: boolean;
};

function clampInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function resolvePlaceTrackingCronPaceMs(
  raw = process.env.PLACE_TRACKING_CRON_PACE_MS
): number {
  return clampInteger(raw, DEFAULT_REQUEST_PACE_MS, 0, 5_000);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedReason(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim() || fallback;
  return normalized.slice(0, 500);
}

function globalBlockReason(
  response: Response,
  data: RankResponse | null
): string | null {
  if (response.status === 429) return "HTTP_429";
  if (response.status === 403) return "HTTP_403";
  if (response.status === 405) return "HTTP_405";

  const failureCode = String(data?.failureCode ?? "").toUpperCase();
  const debugReason = String(data?.diagnostics?.debugReason ?? "").toUpperCase();

  if (data?.diagnostics?.captchaDetected) {
    return /CE_EMPTY_TOKEN/.test(debugReason) ? "CE_EMPTY_TOKEN" : "NCAPTCHA";
  }
  if (data?.diagnostics?.cooldownDetected) {
    return /HTTP_429/.test(debugReason) ? "HTTP_429" : "COOLDOWN";
  }
  if (/NCAPTCHA|CE_EMPTY_TOKEN|HTTP_429|COOLDOWN/.test(failureCode)) {
    return failureCode;
  }
  if (/NCAPTCHA|CE_EMPTY_TOKEN|HTTP_429|COOLDOWN/.test(debugReason)) {
    return failureCode || boundedReason(debugReason, "NAVER_BLOCKED");
  }
  if (/HTTP_403|HTTP_405|BLOCKED_HTTP_403/.test(debugReason)) {
    return /HTTP_405/.test(debugReason) ? "HTTP_405" : "HTTP_403";
  }
  if (failureCode === "PCMAP_HTTP_405") return failureCode;

  return null;
}

async function recordFailure(keywordId: string, reason: string): Promise<void> {
  try {
    await prisma.placeKeyword.update({
      where: { id: keywordId },
      data: { lastFailureCode: boundedReason(reason, "RANK_CHECK_ERROR") },
    });
  } catch (error) {
    console.error("cron attempt 상태 저장 실패", keywordId, error);
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export async function runPlaceTrackingCron(
  req: NextRequest,
  trigger = "primary"
) {
  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET?.trim();
    const isValidSecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

    if (!cronSecret) {
      console.error("place-tracking cron: CRON_SECRET 미설정");
      return NextResponse.json(
        { error: "Cron is not configured" },
        { status: 503 }
      );
    }

    if (!isValidSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // UI의 "오늘 순위 저장"과 동일하게 KST 달력 날짜를 기준으로 중복을 막는다.
    // rolling 시간 제한을 사용하면 전날 늦게 수동 저장한 키워드가 다음 날
    // 모든 오전 슬롯에서 제외될 수 있다.
    const { start: seoulDayStart } = utcRangeSeoulCalendarDay(
      new Date(startedAt)
    );
    const globalCooldownAfter = new Date(
      startedAt - GLOBAL_BLOCK_COOLDOWN_MS
    );
    const trackedWhere = {
      isTracking: true,
      place: { type: "rank" },
    } as const;

    const [
      trackedTotal,
      recentGlobalBlock,
      trackedKeywords,
      recentSuccessfulHistories,
    ] = await Promise.all([
      prisma.placeKeyword.count({ where: trackedWhere }),
      prisma.placeKeyword.findFirst({
        where: {
          place: { type: "rank" },
          lastAttemptAt: { gte: globalCooldownAfter },
          lastFailureCode: { startsWith: GLOBAL_BLOCK_PREFIX },
        },
        orderBy: { lastAttemptAt: "desc" },
        select: {
          lastAttemptAt: true,
          lastFailureCode: true,
        },
      }),
      prisma.placeKeyword.findMany({
        where: {
          ...trackedWhere,
          OR: [
            { lastAttemptAt: null },
            { lastAttemptAt: { lt: seoulDayStart } },
          ],
        },
        include: { place: true },
        orderBy: [
          { lastAttemptAt: { sort: "asc", nulls: "first" } },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      }),
      // 배포 전 cron이나 오늘 수동 저장은 cursor가 비어 있을 수 있으므로 이력으로도 중복 방지.
      prisma.rankHistory.findMany({
        where: {
          createdAt: { gte: seoulDayStart },
          place: { type: "rank" },
        },
        select: {
          placeId: true,
          keyword: true,
        },
      }),
    ]);

    const recentlySuccessfulKeys = new Set(
      recentSuccessfulHistories.map(
        (history) => `${history.placeId}\u0000${history.keyword}`
      )
    );
    const attemptCandidates = (trackedKeywords as TrackedKeyword[]).filter(
      (keyword) =>
        !recentlySuccessfulKeys.has(
          `${keyword.placeId}\u0000${keyword.keyword}`
        )
    );

    const eligibleKeywords = interleaveTrackedKeywordsByPlace(
      attemptCandidates
    );
    const requestPaceMs = resolvePlaceTrackingCronPaceMs();
    const concurrency = 1;

    if (recentGlobalBlock?.lastAttemptAt) {
      const blockedReason = String(recentGlobalBlock.lastFailureCode).slice(
        GLOBAL_BLOCK_PREFIX.length
      );
      const cooldownUntil = new Date(
        recentGlobalBlock.lastAttemptAt.getTime() + GLOBAL_BLOCK_COOLDOWN_MS
      );

      console.warn("place tracking cron global cooldown", {
        trigger,
        blockedReason,
        cooldownUntil,
      });

      return NextResponse.json({
        ok: true,
        trigger,
        total: trackedTotal,
        eligibleTotal: eligibleKeywords.length,
        candidateCount: eligibleKeywords.length,
        selectedCount: 0,
        consideredCount: 0,
        attemptedCount: 0,
        successCount: 0,
        outOfRangeCount: 0,
        failCount: 0,
        deferredCount: eligibleKeywords.length,
        claimLostCount: 0,
        blockedReason,
        cooldownUntil,
        concurrency,
        requestPaceMs,
        durationMs: Date.now() - startedAt,
        reasonCounts: {},
      });
    }

    const origin = req.nextUrl.origin;
    const claimCutoffAt = startedAt + CRON_NEW_CLAIM_CUTOFF_MS;
    const cleanupDeadlineAt = startedAt + CRON_CLEANUP_DEADLINE_MS;
    const results: TrackingResult[] = [];
    let claimLostCount = 0;
    let nextRequestAllowedAt = 0;
    let blockedReason: string | null = null;

    for (const keyword of eligibleKeywords) {
      if (blockedReason) break;

      const paceWaitMs = Math.max(0, nextRequestAllowedAt - Date.now());
      if (claimCutoffAt - Date.now() < paceWaitMs) break;

      await sleep(paceWaitMs);

      if (Date.now() > claimCutoffAt) break;

      const claimStartedAt = new Date();
      const claim = await prisma.placeKeyword.updateMany({
        where: {
          id: keyword.id,
          isTracking: true,
          OR: [
            { lastAttemptAt: null },
            { lastAttemptAt: { lt: seoulDayStart } },
          ],
        },
        data: {
          lastAttemptAt: claimStartedAt,
          lastFailureCode: "IN_PROGRESS",
        },
      });

      if (claim.count !== 1) {
        claimLostCount += 1;
        continue;
      }

      const baseResult = {
        keywordId: keyword.id,
        placeId: keyword.placeId,
      };

      if (!keyword.place?.name) {
        const reason = "MISSING_PLACE_NAME";
        await recordFailure(keyword.id, reason);
        results.push({
          ...baseResult,
          saved: false,
          observed: false,
          reason,
          blocked: false,
        });
        continue;
      }

      try {
        const remainingMs = cleanupDeadlineAt - Date.now();
        const requestTimeoutMs = Math.max(
          1,
          Math.min(RANK_REQUEST_TIMEOUT_MS, remainingMs)
        );
        const rankRes = await fetch(`${origin}/api/check-place-rank`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cronSecret}`,
          },
          body: JSON.stringify({
            keyword: keyword.keyword,
            targetName: keyword.place.name,
            placeCategory: keyword.place.category,
            x: keyword.place.x,
            y: keyword.place.y,
            skipVolume: true,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(requestTimeoutMs),
        });

        const text = await rankRes.text();
        // 한 키워드 응답이 끝난 뒤 여유 간격을 둬 Naver 조회 버스트를 막는다.
        nextRequestAllowedAt = Date.now() + requestPaceMs;
        let rankData: RankResponse | null = null;

        try {
          rankData = text ? (JSON.parse(text) as RankResponse) : null;
        } catch {
          const detectedBlock = globalBlockReason(rankRes, null);
          const reason = detectedBlock || "INVALID_RANK_RESPONSE";
          console.error(
            "cron JSON parse 실패:",
            keyword.keyword,
            text.slice(0, 300)
          );
          if (detectedBlock) blockedReason = detectedBlock;
          await recordFailure(
            keyword.id,
            detectedBlock ? `${GLOBAL_BLOCK_PREFIX}${detectedBlock}` : reason
          );
          results.push({
            ...baseResult,
            saved: false,
            observed: false,
            reason,
            blocked: Boolean(detectedBlock),
          });
          continue;
        }

        const detectedBlock = globalBlockReason(rankRes, rankData);
        const isOutOfRange = rankData?.resultStatus === "OUT_OF_RANGE_280";

        if (
          !rankRes.ok ||
          rankData?.canSaveRank !== true ||
          !rankData?.rank ||
          rankData.rank === "-"
        ) {
          const reason = isOutOfRange
            ? "OUT_OF_RANGE_280"
            : boundedReason(
                detectedBlock || rankData?.failureCode,
                "RANK_NOT_SAVABLE"
              );
          const storedReason = detectedBlock
            ? `${GLOBAL_BLOCK_PREFIX}${detectedBlock}`
            : reason;
          console.error("cron rank 조회 실패:", keyword.keyword, rankData);
          if (detectedBlock) blockedReason = detectedBlock;
          await recordFailure(keyword.id, storedReason);
          results.push({
            ...baseResult,
            saved: false,
            observed: isOutOfRange,
            reason,
            blocked: Boolean(detectedBlock),
          });
          continue;
        }

        const rankMatch = String(rankData.rank).match(/\d+/)?.[0];
        const numericRank = rankMatch ? Number(rankMatch) : Number.NaN;

        if (!Number.isSafeInteger(numericRank) || numericRank <= 0) {
          const reason = "INVALID_NUMERIC_RANK";
          await recordFailure(keyword.id, reason);
          results.push({
            ...baseResult,
            saved: false,
            observed: false,
            reason,
            blocked: false,
          });
          continue;
        }

        const successAt = new Date();
        await prisma.$transaction([
          prisma.rankHistory.create({
            data: {
              placeId: keyword.placeId,
              keyword: keyword.keyword,
              rank: numericRank,
              source: "cron",
              resultStatus: rankData.resultStatus || "FOUND",
              rankLabel: rankData.displayRank || `${numericRank}위`,
              checkedCount:
                typeof rankData.checkedCount === "number"
                  ? rankData.checkedCount
                  : null,
              pageNum:
                typeof rankData.diagnostics?.completedPages === "number"
                  ? rankData.diagnostics.completedPages
                  : null,
              debugReason: rankData.diagnostics?.debugReason
                ? boundedReason(rankData.diagnostics.debugReason, "")
                : null,
            },
          }),
          prisma.placeKeyword.update({
            where: { id: keyword.id },
            data: {
              lastSuccessAt: successAt,
              lastFailureCode: null,
            },
          }),
        ]);

        results.push({
          ...baseResult,
          saved: true,
          observed: true,
          reason: "SAVED",
          blocked: false,
        });
      } catch (error) {
        nextRequestAllowedAt = Date.now() + requestPaceMs;
        const reason = isTimeoutError(error)
          ? "RANK_REQUEST_TIMEOUT"
          : "RANK_CHECK_ERROR";
        console.error("cron keyword update error", keyword.keyword, error);
        await recordFailure(keyword.id, reason);
        results.push({
          ...baseResult,
          saved: false,
          observed: false,
          reason,
          blocked: false,
        });
      }
    }

    const attemptedCount = results.length;
    const successCount = results.filter((result) => result.saved).length;
    const outOfRangeCount = results.filter(
      (result) => result.reason === "OUT_OF_RANGE_280"
    ).length;
    const failCount = attemptedCount - successCount - outOfRangeCount;
    const deferredCount = Math.max(
      0,
      eligibleKeywords.length - attemptedCount - claimLostCount
    );
    const durationMs = Date.now() - startedAt;
    const reasonCounts = results.reduce<Record<string, number>>(
      (acc, result) => {
        acc[result.reason] = (acc[result.reason] ?? 0) + 1;
        return acc;
      },
      {}
    );

    console.log("✅ place tracking cron 배치 완료:", {
      trigger,
      trackedTotal,
      eligibleTotal: eligibleKeywords.length,
      candidateCount: eligibleKeywords.length,
      selectedCount: eligibleKeywords.length,
      consideredCount: attemptedCount + claimLostCount,
      attemptedCount,
      successCount,
      outOfRangeCount,
      failCount,
      deferredCount,
      claimLostCount,
      blockedReason,
      concurrency,
      requestPaceMs,
      durationMs,
      reasonCounts,
    });

    return NextResponse.json({
      ok: true,
      trigger,
      total: trackedTotal,
      eligibleTotal: eligibleKeywords.length,
      candidateCount: eligibleKeywords.length,
      selectedCount: eligibleKeywords.length,
      consideredCount: attemptedCount + claimLostCount,
      attemptedCount,
      successCount,
      outOfRangeCount,
      failCount,
      deferredCount,
      claimLostCount,
      blockedReason,
      concurrency,
      requestPaceMs,
      durationMs,
      reasonCounts,
    });
  } catch (error) {
    console.error("place-tracking cron error", error);
    return NextResponse.json(
      { error: "자동 업데이트 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
