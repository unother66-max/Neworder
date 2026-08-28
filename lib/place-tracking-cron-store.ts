import { prisma } from "@/lib/prisma";

export const PLACE_TRACKING_CRON_JOB = "PLACE_RANK_TRACKING";
export const PLACE_TRACKING_CRON_STALE_AFTER_MS = 10 * 60 * 1000;
export const PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS = 3_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_RETENTION_MS = 90 * DAY_MS;
const SUCCESS_RESULT_RETENTION_MS = 14 * DAY_MS;
const FAILURE_RESULT_RETENTION_MS = 90 * DAY_MS;
const RUN_CREATE_TRANSACTION_MAX_WAIT_MS = 1_000;
const RUN_CREATE_TRANSACTION_TIMEOUT_MS = 1_500;

class DiagnosticDbTimeoutError extends Error {
  constructor(operationName: string) {
    super(`DIAGNOSTIC_DB_TIMEOUT:${operationName}`);
    this.name = "DiagnosticDbTimeoutError";
  }
}

export type PlaceTrackingCronDiagnosticStatus =
  | "SUCCESS"
  | "OUT_OF_RANGE"
  | "NCAPTCHA"
  | "HTTP_429"
  | "TIMEOUT"
  | "FETCH_ERROR"
  | "GLOBAL_COOLDOWN_SKIP"
  | "DEADLINE_SKIP"
  | "CLAIM_LOST"
  | "UNKNOWN_ERROR";

export type PlaceTrackingCronDiagnostic = {
  cronStartedAt: string;
  trigger: string;
  keywordId: string;
  placeId: string;
  placeName: string;
  keyword: string;
  status: PlaceTrackingCronDiagnosticStatus;
  rank: number | null;
  errorMessage: string | null;
  httpStatus: number | null;
  durationMs: number;
};

export type PlaceTrackingCronSummary = {
  trackedTotal: number | null;
  eligibleTotal: number;
  durationMs: number;
  total: number;
  success: number;
  outOfRange: number;
  ncaptcha: number;
  http429: number;
  timeout: number;
  cooldownSkip: number;
  error: number;
};

function plusMs(value: Date, ms: number): Date {
  return new Date(value.getTime() + ms);
}

function boundedInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return Math.max(0, Math.min(2_147_483_647, value));
}

function errorText(error: unknown): string {
  return (
    (error instanceof Error ? error.message : String(error || "UNKNOWN_ERROR"))
      .trim()
      .slice(0, 500) || "UNKNOWN_ERROR"
  );
}

function resultRetentionMs(status: PlaceTrackingCronDiagnosticStatus): number {
  return status === "SUCCESS" || status === "OUT_OF_RANGE"
    ? SUCCESS_RESULT_RETENTION_MS
    : FAILURE_RESULT_RETENTION_MS;
}

async function withDiagnosticDbTimeout<T>(
  operation: Promise<T>,
  operationName: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new DiagnosticDbTimeoutError(operationName));
    }, PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function startPlaceTrackingCronRun(input: {
  trigger: string;
  startedAt: Date;
}): Promise<string | null> {
  let runId: string;
  const createOperation = prisma.$transaction(
    (transaction) =>
      transaction.cronRun.create({
        data: {
          job: PLACE_TRACKING_CRON_JOB,
          trigger: input.trigger.trim().slice(0, 80) || "primary",
          status: "RUNNING",
          startedAt: input.startedAt,
          expiresAt: plusMs(input.startedAt, RUN_RETENTION_MS),
        },
        select: { id: true },
      }),
    {
      maxWait: RUN_CREATE_TRANSACTION_MAX_WAIT_MS,
      timeout: RUN_CREATE_TRANSACTION_TIMEOUT_MS,
    },
  );

  try {
    const run = await withDiagnosticDbTimeout(
      createOperation,
      "CRON_RUN_CREATE"
    );
    runId = run.id;
  } catch (error) {
    console.error("[place-tracking-cron][db] RUNNING 생성 실패", {
      error: errorText(error),
    });

    if (error instanceof DiagnosticDbTimeoutError) {
      void createOperation
        .then(async (lateRun) => {
          const finishedAt = new Date();
          try {
            await withDiagnosticDbTimeout(
              prisma.cronRun.updateMany({
                where: { id: lateRun.id, status: "RUNNING" },
                data: {
                  status: "FAILED",
                  finishedAt,
                  durationMs: boundedInteger(
                    finishedAt.getTime() - input.startedAt.getTime()
                  ),
                  error: 1,
                  errorMessage: "DIAGNOSTIC_RUN_CREATE_TIMEOUT",
                },
              }),
              "LATE_CRON_RUN_UPDATE"
            );
          } catch (lateError) {
            console.error("[place-tracking-cron][db] 지연 생성 run 정리 실패", {
              runId: lateRun.id,
              error: errorText(lateError),
            });
          }
        })
        .catch((lateError) => {
          console.error("[place-tracking-cron][db] 지연 RUNNING 생성 실패", {
            error: errorText(lateError),
          });
        });
    }

    return null;
  }

  try {
    await withDiagnosticDbTimeout(
      prisma.cronRun.updateMany({
        where: {
          id: { not: runId },
          job: PLACE_TRACKING_CRON_JOB,
          status: "RUNNING",
          startedAt: {
            lt: new Date(
              input.startedAt.getTime() - PLACE_TRACKING_CRON_STALE_AFTER_MS
            ),
          },
        },
        data: {
          status: "ABORTED",
          finishedAt: input.startedAt,
          error: { increment: 1 },
          errorMessage: `STALE_RUNNING_AFTER_${PLACE_TRACKING_CRON_STALE_AFTER_MS}_MS`,
        },
      }),
      "STALE_RUN_UPDATE"
    );
  } catch (error) {
    console.error("[place-tracking-cron][db] stale RUNNING 정리 실패", {
      runId,
      error: errorText(error),
    });
  }

  return runId;
}

export async function finishPlaceTrackingCronRun(input: {
  runId: string | null;
  status: "COMPLETED" | "FAILED";
  finishedAt: Date;
  diagnostics: readonly PlaceTrackingCronDiagnostic[];
  summary: PlaceTrackingCronSummary;
  errorMessage?: string | null;
}): Promise<void> {
  const runId = input.runId;
  if (!runId) return;

  if (input.diagnostics.length > 0) {
    try {
      await withDiagnosticDbTimeout(
        prisma.cronResult.createMany({
          data: input.diagnostics.map((diagnostic) => ({
            runId,
            keywordId: diagnostic.keywordId.slice(0, 191),
            placeId: diagnostic.placeId.slice(0, 191),
            placeName: diagnostic.placeName.slice(0, 500),
            keyword: diagnostic.keyword.slice(0, 500),
            status: diagnostic.status,
            rank: boundedInteger(diagnostic.rank),
            errorMessage: diagnostic.errorMessage?.slice(0, 500) || null,
            httpStatus: boundedInteger(diagnostic.httpStatus),
            durationMs: boundedInteger(diagnostic.durationMs),
            expiresAt: plusMs(
              input.finishedAt,
              resultRetentionMs(diagnostic.status)
            ),
          })),
          skipDuplicates: true,
        }),
        "CRON_RESULT_CREATE_MANY"
      );
    } catch (error) {
      console.error("[place-tracking-cron][db] 키워드 결과 저장 실패", {
        runId: input.runId,
        resultCount: input.diagnostics.length,
        error: errorText(error),
      });
    }
  }

  try {
    const updateResult = await withDiagnosticDbTimeout(
      prisma.cronRun.updateMany({
        where: { id: runId, status: "RUNNING" },
        data: {
          status: input.status,
          finishedAt: input.finishedAt,
          durationMs: boundedInteger(input.summary.durationMs),
          trackedTotal: boundedInteger(input.summary.trackedTotal),
          eligibleTotal: boundedInteger(input.summary.eligibleTotal),
          total: boundedInteger(input.summary.total) ?? 0,
          success: boundedInteger(input.summary.success) ?? 0,
          outOfRange: boundedInteger(input.summary.outOfRange) ?? 0,
          ncaptcha: boundedInteger(input.summary.ncaptcha) ?? 0,
          http429: boundedInteger(input.summary.http429) ?? 0,
          timeout: boundedInteger(input.summary.timeout) ?? 0,
          cooldownSkip: boundedInteger(input.summary.cooldownSkip) ?? 0,
          error: boundedInteger(input.summary.error) ?? 0,
          errorMessage: input.errorMessage
            ? errorText(input.errorMessage)
            : null,
        },
      }),
      "CRON_RUN_UPDATE"
    );
    if (updateResult.count === 0) {
      console.warn("[place-tracking-cron][db] 실행 summary 갱신 생략", {
        runId,
        status: input.status,
        reason: "RUN_NOT_IN_RUNNING_STATE",
      });
    }
  } catch (error) {
    console.error("[place-tracking-cron][db] 실행 summary 저장 실패", {
      runId: input.runId,
      status: input.status,
      error: errorText(error),
    });
  }
}
