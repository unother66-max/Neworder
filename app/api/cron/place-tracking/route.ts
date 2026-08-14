import { NextRequest, NextResponse } from "next/server";
import {
  mapWithConcurrencyLimit,
  PLACE_RANK_KEYWORD_CHECK_CONCURRENCY,
} from "@/lib/place-rank-keyword-concurrency";
import { interleaveTrackedKeywordsByPlace } from "@/lib/place-tracking-cron";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Function 종료 전에 진행 상황을 응답/로그로 남길 수 있도록 여유를 둔다.
const CRON_SOFT_DEADLINE_MS = 285_000;
const RANK_REQUEST_TIMEOUT_MS = 110_000;

type TrackedKeyword = {
  id: string;
  placeId: string;
  keyword: string;
  isTracking: boolean;
  place: {
    name: string;
    category: string | null;
    x: string | null;
    y: string | null;
  };
};

type TrackingResult = {
  keywordId: string;
  placeId: string;
  saved: boolean;
  skipped: boolean;
  reason: string;
};

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET?.trim();
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const isValidSecret =
      Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

    if (!isVercelCron && !isValidSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const trackedKeywords = (await prisma.placeKeyword.findMany({
      where: {
        isTracking: true,
        place: {
          type: "rank",
        },
      },
      include: {
        place: true,
      },
      // 오래 갱신되지 않은 키워드/업체가 먼저 라운드로빈에 들어간다.
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    })) as TrackedKeyword[];

    const scheduledKeywords =
      interleaveTrackedKeywordsByPlace(trackedKeywords);
    const origin = req.nextUrl.origin;
    const deadlineAt = startedAt + CRON_SOFT_DEADLINE_MS;

    const results = await mapWithConcurrencyLimit(
      scheduledKeywords,
      PLACE_RANK_KEYWORD_CHECK_CONCURRENCY,
      async (keyword): Promise<TrackingResult> => {
        const baseResult = {
          keywordId: keyword.id,
          placeId: keyword.placeId,
        };
        const remainingMs = deadlineAt - Date.now();

        if (remainingMs <= 0) {
          return {
            ...baseResult,
            saved: false,
            skipped: true,
            reason: "CRON_DEADLINE_EXCEEDED",
          };
        }

        if (!keyword.place?.name) {
          return {
            ...baseResult,
            saved: false,
            skipped: false,
            reason: "MISSING_PLACE_NAME",
          };
        }

        try {
          const requestTimeoutMs = Math.max(
            1,
            Math.min(RANK_REQUEST_TIMEOUT_MS, remainingMs)
          );
          const rankRes = await fetch(`${origin}/api/check-place-rank`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cronSecret
                ? { Authorization: `Bearer ${cronSecret}` }
                : {}),
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
          let rankData: {
            canSaveRank?: boolean;
            rank?: string | number;
            failureCode?: string | null;
          } | null = null;

          try {
            rankData = text ? JSON.parse(text) : null;
          } catch {
            console.error(
              "cron JSON parse 실패:",
              keyword.keyword,
              text.slice(0, 300)
            );
            return {
              ...baseResult,
              saved: false,
              skipped: false,
              reason: "INVALID_RANK_RESPONSE",
            };
          }

          if (
            !rankRes.ok ||
            rankData?.canSaveRank !== true ||
            !rankData?.rank ||
            rankData.rank === "-"
          ) {
            console.error("cron rank 조회 실패:", keyword.keyword, rankData);
            return {
              ...baseResult,
              saved: false,
              skipped: false,
              reason: rankData?.failureCode || "RANK_NOT_SAVABLE",
            };
          }

          const rankMatch = String(rankData.rank).match(/\d+/)?.[0];
          const numericRank = rankMatch ? Number(rankMatch) : Number.NaN;

          if (!Number.isSafeInteger(numericRank) || numericRank <= 0) {
            return {
              ...baseResult,
              saved: false,
              skipped: false,
              reason: "INVALID_NUMERIC_RANK",
            };
          }

          await prisma.rankHistory.create({
            data: {
              placeId: keyword.placeId,
              keyword: keyword.keyword,
              rank: numericRank,
            },
          });

          // 목록의 "마지막 업데이트"가 성공한 순위 저장 시각을 반영하게 한다.
          await prisma.placeKeyword.update({
            where: { id: keyword.id },
            data: { isTracking: keyword.isTracking },
          });

          return {
            ...baseResult,
            saved: true,
            skipped: false,
            reason: "SAVED",
          };
        } catch (error) {
          console.error("cron keyword update error", keyword.keyword, error);
          return {
            ...baseResult,
            saved: false,
            skipped: false,
            reason:
              error instanceof Error && error.name === "TimeoutError"
                ? "RANK_REQUEST_TIMEOUT"
                : "RANK_CHECK_ERROR",
          };
        }
      }
    );

    const successCount = results.filter((result) => result.saved).length;
    const skippedCount = results.filter((result) => result.skipped).length;
    const failCount = results.length - successCount - skippedCount;
    const attemptedCount = results.length - skippedCount;
    const durationMs = Date.now() - startedAt;

    console.log("✅ cron 완료:", {
      total: trackedKeywords.length,
      attemptedCount,
      successCount,
      failCount,
      skippedCount,
      concurrency: PLACE_RANK_KEYWORD_CHECK_CONCURRENCY,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      total: trackedKeywords.length,
      attemptedCount,
      successCount,
      failCount,
      skippedCount,
      concurrency: PLACE_RANK_KEYWORD_CHECK_CONCURRENCY,
      durationMs,
    });
  } catch (error) {
    console.error("place-tracking cron error", error);
    return NextResponse.json(
      { error: "자동 업데이트 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
