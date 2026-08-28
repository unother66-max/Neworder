import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cronRunCreate: vi.fn(),
  cronRunUpdateMany: vi.fn(),
  cronResultCreateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronRun: {
      create: mocks.cronRunCreate,
      updateMany: mocks.cronRunUpdateMany,
    },
    cronResult: {
      createMany: mocks.cronResultCreateMany,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  finishPlaceTrackingCronRun,
  PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS,
  PLACE_TRACKING_CRON_JOB,
  PLACE_TRACKING_CRON_STALE_AFTER_MS,
  startPlaceTrackingCronRun,
  type PlaceTrackingCronDiagnostic,
  type PlaceTrackingCronSummary,
} from "@/lib/place-tracking-cron-store";

const DAY_MS = 24 * 60 * 60 * 1000;
const diagnosticStatuses = [
  "SUCCESS",
  "OUT_OF_RANGE",
  "NCAPTCHA",
  "HTTP_429",
  "TIMEOUT",
  "FETCH_ERROR",
  "GLOBAL_COOLDOWN_SKIP",
  "DEADLINE_SKIP",
  "CLAIM_LOST",
  "UNKNOWN_ERROR",
] as const satisfies readonly PlaceTrackingCronDiagnostic["status"][];

const summary: PlaceTrackingCronSummary = {
  trackedTotal: 12,
  eligibleTotal: 8,
  durationMs: 12_345,
  total: 8,
  success: 3,
  outOfRange: 1,
  ncaptcha: 1,
  http429: 0,
  timeout: 1,
  cooldownSkip: 1,
  error: 1,
};

function diagnostic(
  status: PlaceTrackingCronDiagnostic["status"],
  overrides: Partial<PlaceTrackingCronDiagnostic> = {}
): PlaceTrackingCronDiagnostic {
  return {
    cronStartedAt: "2026-08-28T00:00:00.000Z",
    trigger: "slot-1",
    keywordId: `keyword-${status.toLowerCase()}`,
    placeId: "place-1",
    placeName: "테스트 업체",
    keyword: "테스트 키워드",
    status,
    rank: status === "SUCCESS" ? 7 : null,
    errorMessage: status === "SUCCESS" ? null : `${status} failure`,
    httpStatus: status === "SUCCESS" ? 200 : 503,
    durationMs: 321,
    ...overrides,
  };
}

describe("place tracking cron store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.cronRunCreate.mockResolvedValue({ id: "cron-run-1" });
    mocks.cronRunUpdateMany.mockResolvedValue({ count: 1 });
    mocks.cronResultCreateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(
      async (callback: (transaction: unknown) => unknown) =>
        callback({
          cronRun: { create: mocks.cronRunCreate },
        })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a RUNNING run with a 90-day retention date", async () => {
    const startedAt = new Date("2026-08-28T00:00:00.000Z");

    await expect(
      startPlaceTrackingCronRun({ trigger: "slot-1", startedAt })
    ).resolves.toBe("cron-run-1");

    expect(mocks.cronRunCreate).toHaveBeenCalledWith({
      data: {
        job: PLACE_TRACKING_CRON_JOB,
        trigger: "slot-1",
        status: "RUNNING",
        startedAt,
        expiresAt: new Date(startedAt.getTime() + 90 * DAY_MS),
      },
      select: { id: true },
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 1_000,
      timeout: 1_500,
    });
  });

  it("marks older RUNNING executions as ABORTED after creating the new run", async () => {
    const startedAt = new Date("2026-08-28T03:15:00.000Z");

    await startPlaceTrackingCronRun({ trigger: "primary", startedAt });

    expect(mocks.cronRunUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { not: "cron-run-1" },
        job: PLACE_TRACKING_CRON_JOB,
        status: "RUNNING",
        startedAt: {
          lt: new Date(startedAt.getTime() - PLACE_TRACKING_CRON_STALE_AFTER_MS),
        },
      },
      data: {
        status: "ABORTED",
        finishedAt: startedAt,
        error: { increment: 1 },
        errorMessage: "STALE_RUNNING_AFTER_600000_MS",
      },
    });
  });

  it("stores every diagnostic status with 14/90-day retention and saves the run summary", async () => {
    const finishedAt = new Date("2026-08-28T00:05:00.000Z");
    const diagnostics = diagnosticStatuses.map((status, index) =>
      diagnostic(status, {
        keywordId: `keyword-${index + 1}`,
        placeId: `place-${index + 1}`,
        placeName: `테스트 업체 ${index + 1}`,
        keyword: `테스트 키워드 ${index + 1}`,
        rank: status === "SUCCESS" ? 7 : null,
        errorMessage:
          status === "SUCCESS" || status === "OUT_OF_RANGE"
            ? null
            : `${status} failure`,
        httpStatus: status === "SUCCESS" ? 200 : 503,
        durationMs: 300 + index,
      })
    );
    mocks.cronResultCreateMany.mockResolvedValue({ count: diagnostics.length });

    await finishPlaceTrackingCronRun({
      runId: "cron-run-1",
      status: "COMPLETED",
      finishedAt,
      diagnostics,
      summary,
    });

    expect(mocks.cronResultCreateMany).toHaveBeenCalledTimes(1);
    const createManyInput = mocks.cronResultCreateMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
      skipDuplicates: boolean;
    };
    expect(createManyInput.skipDuplicates).toBe(true);
    expect(createManyInput.data).toHaveLength(diagnosticStatuses.length);

    for (const [index, status] of diagnosticStatuses.entries()) {
      const source = diagnostics[index];
      const retentionDays =
        status === "SUCCESS" || status === "OUT_OF_RANGE" ? 14 : 90;
      expect(createManyInput.data[index]).toEqual({
        runId: "cron-run-1",
        keywordId: source.keywordId,
        placeId: source.placeId,
        placeName: source.placeName,
        keyword: source.keyword,
        status,
        rank: source.rank,
        errorMessage: source.errorMessage,
        httpStatus: source.httpStatus,
        durationMs: source.durationMs,
        expiresAt: new Date(
          finishedAt.getTime() + retentionDays * DAY_MS
        ),
      });
    }
    expect(mocks.cronRunUpdateMany).toHaveBeenCalledWith({
      where: { id: "cron-run-1", status: "RUNNING" },
      data: {
        status: "COMPLETED",
        finishedAt,
        durationMs: 12_345,
        trackedTotal: 12,
        eligibleTotal: 8,
        total: 8,
        success: 3,
        outOfRange: 1,
        ncaptcha: 1,
        http429: 0,
        timeout: 1,
        cooldownSkip: 1,
        error: 1,
        errorMessage: null,
      },
    });
  });

  it("still saves the run summary when keyword result persistence fails", async () => {
    const finishedAt = new Date("2026-08-28T00:05:00.000Z");
    mocks.cronResultCreateMany.mockRejectedValue(new Error("result DB unavailable"));

    await expect(
      finishPlaceTrackingCronRun({
        runId: "cron-run-1",
        status: "COMPLETED",
        finishedAt,
        diagnostics: [diagnostic("SUCCESS")],
        summary,
      })
    ).resolves.toBeUndefined();

    expect(mocks.cronRunUpdateMany).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[place-tracking-cron][db] 키워드 결과 저장 실패",
      expect.objectContaining({
        runId: "cron-run-1",
        resultCount: 1,
        error: "result DB unavailable",
      })
    );
  });

  it("does not reject the cron flow when the final run update fails", async () => {
    const finishedAt = new Date("2026-08-28T00:05:00.000Z");
    mocks.cronResultCreateMany.mockResolvedValue({ count: 1 });
    mocks.cronRunUpdateMany.mockRejectedValue(
      new Error("summary DB unavailable")
    );

    await expect(
      finishPlaceTrackingCronRun({
        runId: "cron-run-1",
        status: "FAILED",
        finishedAt,
        diagnostics: [diagnostic("TIMEOUT")],
        summary,
        errorMessage: "fatal setup error",
      })
    ).resolves.toBeUndefined();

    expect(mocks.cronResultCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.cronRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "fatal setup error",
        }),
      })
    );
    expect(console.error).toHaveBeenCalledWith(
      "[place-tracking-cron][db] 실행 summary 저장 실패",
      expect.objectContaining({
        runId: "cron-run-1",
        status: "FAILED",
        error: "summary DB unavailable",
      })
    );
  });

  it("returns control when RUNNING creation remains pending", async () => {
    vi.useFakeTimers();
    mocks.cronRunCreate.mockReturnValue(new Promise(() => undefined));

    const startPromise = startPlaceTrackingCronRun({
      trigger: "primary",
      startedAt: new Date("2026-08-28T00:00:00.000Z"),
    });
    await vi.advanceTimersByTimeAsync(
      PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS
    );

    await expect(startPromise).resolves.toBeNull();
    expect(mocks.cronRunUpdateMany).not.toHaveBeenCalled();
  });

  it("marks a RUNNING row as failed when creation resolves after its timeout", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-08-28T00:00:00.000Z");
    vi.setSystemTime(startedAt);
    let resolveCreate: ((value: { id: string }) => void) | undefined;
    mocks.cronRunCreate.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        resolveCreate = resolve;
      })
    );

    const startPromise = startPlaceTrackingCronRun({
      trigger: "primary",
      startedAt,
    });
    await vi.advanceTimersByTimeAsync(
      PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS
    );
    await expect(startPromise).resolves.toBeNull();

    resolveCreate?.({ id: "late-cron-run" });
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.cronRunUpdateMany).toHaveBeenCalledWith({
      where: { id: "late-cron-run", status: "RUNNING" },
      data: {
        status: "FAILED",
        finishedAt: new Date(
          startedAt.getTime() + PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS
        ),
        durationMs: PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS,
        error: 1,
        errorMessage: "DIAGNOSTIC_RUN_CREATE_TIMEOUT",
      },
    });
  });

  it("returns the run id when stale-run cleanup remains pending", async () => {
    vi.useFakeTimers();
    mocks.cronRunUpdateMany.mockReturnValue(new Promise(() => undefined));

    const startPromise = startPlaceTrackingCronRun({
      trigger: "primary",
      startedAt: new Date("2026-08-28T00:00:00.000Z"),
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(
      PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS
    );

    await expect(startPromise).resolves.toBe("cron-run-1");
  });

  it("continues to the run summary when result persistence remains pending", async () => {
    vi.useFakeTimers();
    mocks.cronResultCreateMany.mockReturnValue(new Promise(() => undefined));

    const finishPromise = finishPlaceTrackingCronRun({
      runId: "cron-run-1",
      status: "COMPLETED",
      finishedAt: new Date("2026-08-28T00:05:00.000Z"),
      diagnostics: [diagnostic("SUCCESS")],
      summary,
    });
    await vi.advanceTimersByTimeAsync(
      PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS
    );

    await expect(finishPromise).resolves.toBeUndefined();
    expect(mocks.cronRunUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("returns control when the final run update remains pending", async () => {
    vi.useFakeTimers();
    mocks.cronRunUpdateMany.mockReturnValue(new Promise(() => undefined));

    const finishPromise = finishPlaceTrackingCronRun({
      runId: "cron-run-1",
      status: "COMPLETED",
      finishedAt: new Date("2026-08-28T00:05:00.000Z"),
      diagnostics: [],
      summary,
    });
    await vi.advanceTimersByTimeAsync(
      PLACE_TRACKING_CRON_DB_OPERATION_TIMEOUT_MS
    );

    await expect(finishPromise).resolves.toBeUndefined();
  });
});
