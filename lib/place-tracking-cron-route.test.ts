import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  rankHistoryFindMany: vi.fn(),
  rankHistoryCreate: vi.fn(),
  keywordUpdate: vi.fn(),
  keywordUpdateMany: vi.fn(),
  transaction: vi.fn(),
  startCronRun: vi.fn(),
  finishCronRun: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    placeKeyword: {
      count: mocks.count,
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
      update: mocks.keywordUpdate,
      updateMany: mocks.keywordUpdateMany,
    },
    rankHistory: {
      findMany: mocks.rankHistoryFindMany,
      create: mocks.rankHistoryCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/place-tracking-cron-store", () => ({
  startPlaceTrackingCronRun: mocks.startCronRun,
  finishPlaceTrackingCronRun: mocks.finishCronRun,
}));

import { GET, maxDuration } from "@/app/api/cron/place-tracking/route";
import { GET as GET_SLOT } from "@/app/api/cron/place-tracking/[slot]/route";
import { interleaveTrackedKeywordsByPlace } from "@/lib/place-tracking-cron";

describe("place tracking cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PLACE_TRACKING_CRON_PACE_MS", "0");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.count.mockResolvedValue(1);
    mocks.findFirst.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([
      {
        id: "keyword-1",
        placeId: "place-1",
        keyword: "평택 동물체험",
        isTracking: true,
        lastAttemptAt: null,
        place: {
          name: "소풍동물원",
          category: "키즈카페,실내놀이터",
          x: "127.072",
          y: "37.117",
        },
      },
    ]);
    mocks.rankHistoryFindMany.mockResolvedValue([]);
    mocks.rankHistoryCreate.mockResolvedValue({ id: "history-1" });
    mocks.keywordUpdate.mockResolvedValue({ id: "keyword-1" });
    mocks.keywordUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (operations) =>
      Promise.all(operations)
    );
    mocks.startCronRun.mockResolvedValue("cron-run-1");
    mocks.finishCronRun.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the KST calendar day to select eligible Naver rank keywords", async () => {
    vi.useFakeTimers();
    // 2026-08-18 02:00 KST. 오늘의 시작은 2026-08-17 15:00 UTC이다.
    vi.setSystemTime(new Date("2026-08-17T17:00:00.000Z"));
    const seoulDayStart = new Date("2026-08-17T15:00:00.000Z");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, canSaveRank: true, rank: "2" })
      )
    );

    await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );

    expect(maxDuration).toBe(300);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        isTracking: true,
        place: { type: "rank" },
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
    });
    expect(mocks.keywordUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "keyword-1",
        isTracking: true,
        OR: [
          { lastAttemptAt: null },
          { lastAttemptAt: { lt: seoulDayStart } },
        ],
      },
      data: {
        lastAttemptAt: expect.any(Date),
        lastFailureCode: "IN_PROGRESS",
      },
    });
    expect(mocks.rankHistoryFindMany).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: seoulDayStart },
        place: { type: "rank" },
      },
      select: {
        placeId: true,
        keyword: true,
      },
    });
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );

    expect(response.status).toBe(503);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.startCronRun).not.toHaveBeenCalled();
  });

  it("does not create a diagnostic run for an unauthorized request", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.startCronRun).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("round-robins keywords across places instead of exhausting one place first", () => {
    const scheduled = interleaveTrackedKeywordsByPlace([
      { id: "place-1-keyword-1", placeId: "place-1" },
      { id: "place-1-keyword-2", placeId: "place-1" },
      { id: "place-1-keyword-3", placeId: "place-1" },
      { id: "place-2-keyword-1", placeId: "place-2" },
      { id: "place-2-keyword-2", placeId: "place-2" },
      { id: "place-3-keyword-1", placeId: "place-3" },
    ]);

    expect(scheduled.map((item) => item.id)).toEqual([
      "place-1-keyword-1",
      "place-2-keyword-1",
      "place-3-keyword-1",
      "place-1-keyword-2",
      "place-2-keyword-2",
      "place-1-keyword-3",
    ]);
  });

  it("runs the fair queue sequentially and processes every keyword", async () => {
    mocks.count.mockResolvedValue(4);
    mocks.findMany.mockResolvedValue([
      {
        id: "place-1-keyword-1",
        placeId: "place-1",
        keyword: "첫 업체 키워드 1",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "첫 업체", category: null, x: null, y: null },
      },
      {
        id: "place-1-keyword-2",
        placeId: "place-1",
        keyword: "첫 업체 키워드 2",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "첫 업체", category: null, x: null, y: null },
      },
      {
        id: "place-2-keyword-1",
        placeId: "place-2",
        keyword: "둘째 업체 키워드 1",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "둘째 업체", category: null, x: null, y: null },
      },
      {
        id: "place-2-keyword-2",
        placeId: "place-2",
        keyword: "둘째 업체 키워드 2",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "둘째 업체", category: null, x: null, y: null },
      },
    ]);
    const requestedKeywords: string[] = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      requestedKeywords.push(JSON.parse(String(init?.body)).keyword);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;
      return Response.json({ ok: true, canSaveRank: true, rank: "3" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(requestedKeywords).toEqual([
      "첫 업체 키워드 1",
      "둘째 업체 키워드 1",
      "첫 업체 키워드 2",
      "둘째 업체 키워드 2",
    ]);
    expect(maxActiveRequests).toBe(1);
    expect(body).toMatchObject({
      total: 4,
      attemptedCount: 4,
      successCount: 4,
      failCount: 0,
      deferredCount: 0,
      concurrency: 1,
    });
    expect(body.attemptedCount).toBe(
      body.successCount + body.outOfRangeCount + body.failCount
    );
    expect(body.eligibleTotal).toBe(
      body.attemptedCount + body.claimLostCount + body.deferredCount
    );
    expect(
      Object.values(body.reasonCounts as Record<string, number>).reduce(
        (sum, count) => sum + count,
        0
      )
    ).toBe(body.attemptedCount);
  });

  it("does not stop at the former 70-keyword batch boundary", async () => {
    const keywords = Array.from({ length: 75 }, (_, index) => ({
      id: `keyword-${index + 1}`,
      placeId: `place-${index + 1}`,
      keyword: `키워드 ${index + 1}`,
      isTracking: true,
      lastAttemptAt: null,
      place: {
        name: `업체 ${index + 1}`,
        category: null,
        x: null,
        y: null,
      },
    }));
    mocks.count.mockResolvedValue(keywords.length);
    mocks.findMany.mockResolvedValue(keywords);
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({ ok: true, canSaveRank: true, rank: "3" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(75);
    expect(body).toMatchObject({
      total: 75,
      eligibleTotal: 75,
      selectedCount: 75,
      attemptedCount: 75,
      successCount: 75,
      deferredCount: 0,
      concurrency: 1,
    });
  });

  it("continues with other places when one rank cannot be saved", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        id: "failed-keyword",
        placeId: "failed-place",
        keyword: "조회 실패 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "조회 실패 업체", category: null, x: null, y: null },
      },
      {
        id: "saved-keyword",
        placeId: "saved-place",
        keyword: "조회 성공 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "조회 성공 업체", category: null, x: null, y: null },
      },
    ]);
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const { keyword } = JSON.parse(String(init?.body));
      return keyword === "조회 실패 키워드"
        ? Response.json({
            ok: true,
            canSaveRank: false,
            rank: "-",
            failureCode: "PCMAP_GRAPHQL_FAILED",
          })
        : Response.json({ ok: true, canSaveRank: true, rank: "8" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.rankHistoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.keywordUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.keywordUpdate).toHaveBeenCalledWith({
      where: { id: "failed-keyword" },
      data: { lastFailureCode: "PCMAP_GRAPHQL_FAILED" },
    });
    expect(body).toMatchObject({
      total: 2,
      attemptedCount: 2,
      successCount: 1,
      failCount: 1,
      deferredCount: 0,
    });
  });

  it("stops starting work at the soft deadline and reports skipped keywords", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        id: "keyword-1",
        placeId: "place-1",
        keyword: "키워드 1",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "업체 1", category: null, x: null, y: null },
      },
      {
        id: "keyword-2",
        placeId: "place-2",
        keyword: "키워드 2",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "업체 2", category: null, x: null, y: null },
      },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValue(286_001);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      total: 2,
      attemptedCount: 0,
      successCount: 0,
      failCount: 0,
      deferredCount: 2,
    });
    expect(mocks.keywordUpdateMany).not.toHaveBeenCalled();
    const keywordDiagnostics = vi
      .mocked(console.log)
      .mock.calls.filter(
        ([message]) => message === "[place-tracking-cron][keyword-result]"
      )
      .map(([, payload]) => payload as Record<string, unknown>);
    expect(keywordDiagnostics).toEqual([
      expect.objectContaining({
        keywordId: "keyword-1",
        status: "DEADLINE_SKIP",
        errorMessage: "CRON_CLAIM_DEADLINE",
      }),
      expect.objectContaining({
        keywordId: "keyword-2",
        status: "DEADLINE_SKIP",
        errorMessage: "CRON_CLAIM_DEADLINE",
      }),
    ]);
  });

  it("leaves the deadline tail unclaimed so the next slot can continue it", async () => {
    vi.useFakeTimers();
    const baseTime = new Date("2026-08-17T00:00:00.000Z").getTime();
    vi.setSystemTime(baseTime);
    const firstKeyword = {
      id: "keyword-1",
      placeId: "place-1",
      keyword: "첫 키워드",
      isTracking: true,
      lastAttemptAt: null,
      place: { name: "첫 업체", category: null, x: null, y: null },
    };
    const tailKeyword = {
      id: "keyword-2",
      placeId: "place-2",
      keyword: "다음 슬롯 키워드",
      isTracking: true,
      lastAttemptAt: null,
      place: { name: "둘째 업체", category: null, x: null, y: null },
    };
    mocks.count.mockResolvedValue(2);
    mocks.findMany
      .mockResolvedValueOnce([firstKeyword, tailKeyword])
      .mockResolvedValueOnce([tailKeyword]);
    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        vi.setSystemTime(baseTime + 261_000);
      }
      return Response.json({ ok: true, canSaveRank: true, rank: "3" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstResponse = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking/1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const firstBody = await firstResponse.json();

    expect(firstBody).toMatchObject({
      selectedCount: 2,
      attemptedCount: 1,
      deferredCount: 1,
    });
    expect(mocks.keywordUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.keywordUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "keyword-1" },
    });

    vi.setSystemTime(baseTime + 2 * 60 * 60 * 1000);
    const secondResponse = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking/2", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const secondBody = await secondResponse.json();

    expect(secondBody).toMatchObject({
      selectedCount: 1,
      attemptedCount: 1,
      successCount: 1,
      deferredCount: 0,
    });
    expect(mocks.keywordUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.keywordUpdateMany.mock.calls[1]![0]).toMatchObject({
      where: { id: "keyword-2" },
    });
  });

  it("passes the registered place coordinates to the rank collector", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ ok: true, canSaveRank: true, rank: "2" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      total: 1,
      successCount: 1,
      failCount: 0,
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      keyword: "평택 동물체험",
      targetName: "소풍동물원",
      placeCategory: "키즈카페,실내놀이터",
      x: "127.072",
      y: "37.117",
      skipVolume: true,
    });
    expect(mocks.rankHistoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        placeId: "place-1",
        keyword: "평택 동물체험",
        rank: 2,
        source: "cron",
        resultStatus: "FOUND",
      }),
    });
  });

  it("logs a structured keyword result and cron summary after a successful save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, canSaveRank: true, rank: "6" })
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();
    const keywordDiagnostics = vi
      .mocked(console.log)
      .mock.calls.filter(
        ([message]) => message === "[place-tracking-cron][keyword-result]"
      )
      .map(([, payload]) => payload as Record<string, unknown>);
    const summaries = vi
      .mocked(console.log)
      .mock.calls.filter(
        ([message]) => message === "[place-tracking-cron][summary]"
      )
      .map(([, payload]) => payload as Record<string, unknown>);

    expect(body).toMatchObject({
      attemptedCount: 1,
      successCount: 1,
      failCount: 0,
    });
    expect(keywordDiagnostics).toHaveLength(1);
    expect(keywordDiagnostics[0]).toMatchObject({
      cronStartedAt: expect.any(String),
      trigger: "primary",
      keywordId: "keyword-1",
      placeId: "place-1",
      placeName: "소풍동물원",
      keyword: "평택 동물체험",
      status: "SUCCESS",
      rank: 6,
      errorMessage: null,
      httpStatus: 200,
      durationMs: expect.any(Number),
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      total: 1,
      success: 1,
      outOfRange: 0,
      ncaptcha: 0,
      http429: 0,
      timeout: 0,
      cooldownSkip: 0,
      error: 0,
      statusCounts: { SUCCESS: 1 },
    });
    expect(mocks.startCronRun).toHaveBeenCalledWith({
      trigger: "primary",
      startedAt: expect.any(Date),
    });
    expect(mocks.finishCronRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "cron-run-1",
        status: "COMPLETED",
        finishedAt: expect.any(Date),
        diagnostics: [
          expect.objectContaining({
            keywordId: "keyword-1",
            status: "SUCCESS",
            rank: 6,
          }),
        ],
        summary: expect.objectContaining({
          total: 1,
          success: 1,
          error: 0,
        }),
      })
    );
  });

  it("marks an authorized cron as failed when core setup throws", async () => {
    mocks.count.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );

    expect(response.status).toBe(500);
    expect(mocks.startCronRun).toHaveBeenCalledTimes(1);
    expect(mocks.finishCronRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "cron-run-1",
        status: "FAILED",
        errorMessage: "database unavailable",
        diagnostics: [],
        summary: expect.objectContaining({ error: 1 }),
      })
    );
  });

  it("keeps the original rank-save response when diagnostic finalization fails", async () => {
    mocks.finishCronRun.mockRejectedValueOnce(
      new Error("diagnostic database unavailable")
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, canSaveRank: true, rank: "4" })
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ successCount: 1, failCount: 0 });
    expect(mocks.rankHistoryCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps the original rank-save response when diagnostic run creation fails", async () => {
    mocks.startCronRun.mockRejectedValueOnce(
      new Error("diagnostic database unavailable")
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, canSaveRank: true, rank: "5" })
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ successCount: 1, failCount: 0 });
    expect(mocks.rankHistoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.finishCronRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: null, status: "COMPLETED" })
    );
  });

  it("records out-of-range as an observed attempt without a fake rank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          canSaveRank: false,
          rank: "-",
          resultStatus: "OUT_OF_RANGE_280",
          failureCode: null,
        })
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(mocks.rankHistoryCreate).not.toHaveBeenCalled();
    expect(mocks.keywordUpdate).toHaveBeenCalledWith({
      where: { id: "keyword-1" },
      data: { lastFailureCode: "OUT_OF_RANGE_280" },
    });
    expect(body).toMatchObject({
      attemptedCount: 1,
      successCount: 0,
      outOfRangeCount: 1,
      failCount: 0,
    });
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      "[place-tracking-cron][keyword-result]",
      expect.objectContaining({
        status: "OUT_OF_RANGE",
        rank: null,
        errorMessage: null,
        httpStatus: 200,
      })
    );
  });

  it("distinguishes NCAPTCHA without changing the existing global block behavior", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          canSaveRank: false,
          rank: "-",
          failureCode: "PCMAP_GRAPHQL_FAILED",
          message: "현재 조회 차단됨 / 마지막 저장 순위 유지",
          diagnostics: {
            captchaDetected: true,
            cooldownDetected: false,
            debugReason: "HTML_CONFIRMED_NCAPTCHA",
          },
        })
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(body).toMatchObject({
      attemptedCount: 1,
      failCount: 1,
      blockedReason: "NCAPTCHA",
    });
    expect(mocks.keywordUpdate).toHaveBeenCalledWith({
      where: { id: "keyword-1" },
      data: { lastFailureCode: "GLOBAL_BLOCK:NCAPTCHA" },
    });
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      "[place-tracking-cron][keyword-result]",
      expect.objectContaining({
        status: "NCAPTCHA",
        rank: null,
        httpStatus: 200,
      })
    );
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      "[place-tracking-cron][summary]",
      expect.objectContaining({
        total: 1,
        ncaptcha: 1,
        http429: 0,
        cooldownSkip: 0,
        error: 0,
      })
    );
  });

  it("distinguishes request timeout from a fetch error in keyword diagnostics", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        id: "timeout-keyword",
        placeId: "timeout-place",
        keyword: "타임아웃 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "타임아웃 업체", category: null, x: null, y: null },
      },
      {
        id: "fetch-keyword",
        placeId: "fetch-place",
        keyword: "통신 오류 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "통신 오류 업체", category: null, x: null, y: null },
      },
    ]);
    const timeoutError = new Error("rank lookup timed out");
    timeoutError.name = "TimeoutError";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(new TypeError("fetch failed"))
    );

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();
    const keywordDiagnostics = vi
      .mocked(console.log)
      .mock.calls.filter(
        ([message]) => message === "[place-tracking-cron][keyword-result]"
      )
      .map(([, payload]) => payload as Record<string, unknown>);

    expect(body).toMatchObject({
      attemptedCount: 2,
      successCount: 0,
      failCount: 2,
    });
    expect(mocks.rankHistoryCreate).not.toHaveBeenCalled();
    expect(keywordDiagnostics).toEqual([
      expect.objectContaining({
        keywordId: "timeout-keyword",
        status: "TIMEOUT",
        errorMessage: "rank lookup timed out",
        httpStatus: null,
      }),
      expect.objectContaining({
        keywordId: "fetch-keyword",
        status: "FETCH_ERROR",
        errorMessage: "fetch failed",
        httpStatus: null,
      }),
    ]);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      "[place-tracking-cron][summary]",
      expect.objectContaining({
        total: 2,
        timeout: 1,
        error: 1,
        statusCounts: { TIMEOUT: 1, FETCH_ERROR: 1 },
      })
    );
  });

  it("stops the batch on a global cooldown and leaves the tail unclaimed", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        id: "blocked-keyword",
        placeId: "blocked-place",
        keyword: "차단 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "차단 업체", category: null, x: null, y: null },
      },
      {
        id: "tail-keyword",
        placeId: "tail-place",
        keyword: "후속 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "후속 업체", category: null, x: null, y: null },
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        canSaveRank: false,
        rank: "-",
        failureCode: "PCMAP_GRAPHQL_FAILED",
        diagnostics: {
          cooldownDetected: true,
          debugReason: "HTTP_429",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.keywordUpdateMany).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      attemptedCount: 1,
      failCount: 1,
      deferredCount: 1,
      blockedReason: "HTTP_429",
    });
    expect(mocks.keywordUpdate).toHaveBeenCalledWith({
      where: { id: "blocked-keyword" },
      data: { lastFailureCode: "GLOBAL_BLOCK:HTTP_429" },
    });
    const keywordDiagnostics = vi
      .mocked(console.log)
      .mock.calls.filter(
        ([message]) => message === "[place-tracking-cron][keyword-result]"
      )
      .map(([, payload]) => payload as Record<string, unknown>);
    expect(keywordDiagnostics).toEqual([
      expect.objectContaining({
        keywordId: "blocked-keyword",
        status: "HTTP_429",
        httpStatus: 200,
      }),
      expect.objectContaining({
        keywordId: "tail-keyword",
        status: "GLOBAL_COOLDOWN_SKIP",
        httpStatus: null,
      }),
    ]);
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      "[place-tracking-cron][summary]",
      expect.objectContaining({
        total: 2,
        http429: 1,
        cooldownSkip: 1,
        error: 0,
      })
    );
  });

  it("honors a persisted global block cooldown in the next cron slot", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.findFirst.mockResolvedValue({
      lastAttemptAt: new Date(),
      lastFailureCode: "GLOBAL_BLOCK:HTTP_429",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      attemptedCount: 0,
      eligibleTotal: 1,
      deferredCount: 1,
      blockedReason: "HTTP_429",
    });
  });

  it("does not recheck a keyword with a successful history earlier today in KST", async () => {
    mocks.rankHistoryFindMany.mockResolvedValue([
      { placeId: "place-1", keyword: "평택 동물체험" },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.keywordUpdateMany).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      total: 1,
      eligibleTotal: 0,
      attemptedCount: 0,
    });
  });

  it("does not fetch when another cron invocation already claimed the keyword", async () => {
    mocks.keywordUpdateMany.mockResolvedValue({ count: 0 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      attemptedCount: 0,
      claimLostCount: 1,
    });
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      "[place-tracking-cron][keyword-result]",
      expect.objectContaining({
        keywordId: "keyword-1",
        status: "CLAIM_LOST",
        errorMessage: "KEYWORD_CLAIM_NOT_ACQUIRED",
      })
    );
  });

  it("continues past a lost claim to the next eligible keyword", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        id: "lost-keyword",
        placeId: "lost-place",
        keyword: "이미 선점된 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "첫 업체", category: null, x: null, y: null },
      },
      {
        id: "next-keyword",
        placeId: "next-place",
        keyword: "다음 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "둘째 업체", category: null, x: null, y: null },
      },
    ]);
    mocks.keywordUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({ ok: true, canSaveRank: true, rank: "5" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      keyword: "다음 키워드",
    });
    expect(body).toMatchObject({
      eligibleTotal: 2,
      attemptedCount: 1,
      successCount: 1,
      claimLostCount: 1,
      deferredCount: 0,
    });
  });

  it("accepts all configured slots and rejects slots outside the allowlist", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({ ok: true, canSaveRank: true, rank: "2" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const validResponse = await GET_SLOT(
      new NextRequest("http://localhost/api/cron/place-tracking/7", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
      { params: Promise.resolve({ slot: "7" }) }
    );
    expect(validResponse.status).toBe(200);
    expect(await validResponse.json()).toMatchObject({ trigger: "slot-7" });

    vi.clearAllMocks();
    const invalidResponse = await GET_SLOT(
      new NextRequest("http://localhost/api/cron/place-tracking/8", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
      { params: Promise.resolve({ slot: "8" }) }
    );
    expect(invalidResponse.status).toBe(404);
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("paces sequential requests after each keyword response", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    vi.stubEnv("PLACE_TRACKING_CRON_PACE_MS", "1000");
    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        id: "keyword-1",
        placeId: "place-1",
        keyword: "첫 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "첫 업체", category: null, x: null, y: null },
      },
      {
        id: "keyword-2",
        placeId: "place-2",
        keyword: "둘째 키워드",
        isTracking: true,
        lastAttemptAt: null,
        place: { name: "둘째 업체", category: null, x: null, y: null },
      },
    ]);
    const requestStartedAt: number[] = [];
    const fetchMock = vi.fn().mockImplementation(async () => {
      requestStartedAt.push(Date.now());
      return Response.json({ ok: true, canSaveRank: true, rank: "3" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestStartedAt[1]! - requestStartedAt[0]!).toBeGreaterThanOrEqual(
      1_000
    );
  });
});
