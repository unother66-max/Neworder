import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNaverPlaceReviewSnapshot: vi.fn(),
  getKeywordSearchVolume: vi.fn(),
  findFirst: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  loadRegisteredKeywordCacheState: vi.fn(),
  hasFreshRegisteredKeywordCache: vi.fn(),
  saveRegisteredKeywordSuccess: vi.fn(),
  saveRegisteredKeywordFailure: vi.fn(),
}));

vi.mock("@/lib/getNaverPlaceReviewSnapshot", () => ({
  getNaverPlaceReviewSnapshot: mocks.getNaverPlaceReviewSnapshot,
}));

vi.mock("@/lib/getKeywordSearchVolume", () => ({
  getKeywordSearchVolume: mocks.getKeywordSearchVolume,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    placeRegisteredKeywordCache: {
      findFirst: mocks.findFirst,
      createMany: mocks.createMany,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/lib/place-registered-keyword-cache", () => ({
  getRegisteredKeywordRefreshLeaseMs: () => 60_000,
  getRegisteredKeywordSuccessTtlMs: () => 24 * 60 * 60 * 1000,
  hasFreshRegisteredKeywordCache: mocks.hasFreshRegisteredKeywordCache,
  isRegisteredKeywordBlockReason: (reason: unknown) =>
    /CONFIRMED_NCAPTCHA|HTTP_429|COOLDOWN/i.test(String(reason ?? "")),
  loadRegisteredKeywordCacheState: mocks.loadRegisteredKeywordCacheState,
  saveRegisteredKeywordSuccess: mocks.saveRegisteredKeywordSuccess,
  saveRegisteredKeywordFailure: mocks.saveRegisteredKeywordFailure,
}));

import {
  REGISTERED_KEYWORD_QUEUE_CONCURRENCY,
  enqueueRegisteredKeywordCollectionTargets,
  enqueueRegisteredKeywordVolumeBackfillTargets,
  getRegisteredKeywordCronQueueOptions,
  processRegisteredKeywordQueue,
  refreshRegisteredKeywordSearchVolumes,
} from "@/lib/place-registered-keyword-queue";

function candidate(id: string, name: string) {
  return {
    id: `cache-${id}`,
    publicPlaceId: id,
    placeName: name,
    category: "양식",
    businessType: "restaurant",
    x: "127.0007",
    y: "37.5359",
    keywords: [],
    hasSuccessfulValue: false,
    collectedAt: null,
  };
}

function savedRow(overrides: Record<string, unknown> = {}) {
  return {
    publicPlaceId: "1699073167",
    queueStatus: "IDLE",
    keywords: ["한남동데이트"],
    collectedAt: new Date("2026-07-16T00:00:00.000Z"),
    cooldownUntil: null,
    ...overrides,
  };
}

describe("place registered keyword durable queue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map(),
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.hasFreshRegisteredKeywordCache.mockReturnValue(false);
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.getKeywordSearchVolume.mockResolvedValue({
      ok: true,
      mobile: 100,
      pc: 20,
      total: 120,
    });
    mocks.saveRegisteredKeywordSuccess.mockResolvedValue(savedRow());
    mocks.saveRegisteredKeywordFailure.mockResolvedValue(
      savedRow({
        queueStatus: "QUEUED",
        collectedAt: null,
        cooldownUntil: new Date("2026-07-16T07:00:00.000Z"),
      })
    );
  });

  it("deduplicates queue inserts by publicPlaceId", async () => {
    const result = await enqueueRegisteredKeywordCollectionTargets(
      [
        {
          publicPlaceId: "1699073167",
          placeName: "뉴오더클럽 한남",
        },
        {
          publicPlaceId: "1699073167",
          placeName: "뉴오더클럽 한남",
        },
        {
          publicPlaceId: "13100550",
          placeName: "파이프그라운드 한남점",
        },
      ],
      new Date("2026-07-16T06:00:00.000Z")
    );

    expect(result).toMatchObject({ requested: 2, queued: 2 });
    expect(mocks.createMany).toHaveBeenCalledTimes(2);
    expect(
      mocks.createMany.mock.calls.map(([input]) => input.data[0].publicPlaceId)
    ).toEqual(["1699073167", "13100550"]);
  });

  it("queues volume backfill even when the registered-keyword cache is fresh", async () => {
    const current = {
      ...savedRow(),
      publicPlaceId: "1699073167",
      hasSuccessfulValue: true,
      lastAttemptAt: null,
      refreshLeaseUntil: null,
      lastFailureCode: null,
      placeName: "뉴오더클럽 한남",
      category: "양식",
      businessType: "restaurant",
      x: null,
      y: null,
      queuedAt: null,
      processingStartedAt: null,
    };
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map([[current.publicPlaceId, current]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });

    const result = await enqueueRegisteredKeywordVolumeBackfillTargets([
      {
        publicPlaceId: current.publicPlaceId,
        placeName: current.placeName,
      },
      {
        publicPlaceId: current.publicPlaceId,
        placeName: current.placeName,
      },
    ]);

    expect(result).toMatchObject({ requested: 1, queued: 1 });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicPlaceId: current.publicPlaceId,
          hasSuccessfulValue: true,
        }),
        data: expect.objectContaining({ queueStatus: "QUEUED" }),
      })
    );
  });

  it("processes multiple claimed rows strictly one at a time", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(candidate("1699073167", "뉴오더클럽 한남"))
      .mockResolvedValueOnce(candidate("13100550", "파이프그라운드 한남점"));
    let active = 0;
    let maxActive = 0;
    mocks.getNaverPlaceReviewSnapshot.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        registeredKeywordsStatus: "AVAILABLE",
        registeredKeywords: ["한남동데이트"],
      };
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 2 });

    expect(REGISTERED_KEYWORD_QUEUE_CONCURRENCY).toBe(1);
    expect(maxActive).toBe(1);
    expect(result).toMatchObject({ attempted: 2, succeeded: 2, failed: 0 });
    expect(mocks.saveRegisteredKeywordSuccess).toHaveBeenCalledTimes(2);
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(2);
    expect(
      mocks.getNaverPlaceReviewSnapshot.mock.calls.every(
        ([input]) =>
          input.force === true &&
          input.collectRegisteredKeywords === true &&
          input.registeredKeywordsOnly === true
      )
    ).toBe(true);
  });

  it("backfills only search volumes for a fresh keyword cache", async () => {
    mocks.findFirst.mockResolvedValue({
      ...candidate("1699073167", "뉴오더클럽 한남"),
      keywords: ["한남동데이트", "화덕피자"],
      hasSuccessfulValue: true,
      collectedAt: new Date(),
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 1 });

    expect(result).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    expect(mocks.getKeywordSearchVolume.mock.calls.map(([keyword]) => keyword)).toEqual([
      "한남동데이트",
      "화덕피자",
    ]);
    expect(mocks.getNaverPlaceReviewSnapshot).not.toHaveBeenCalled();
    expect(mocks.saveRegisteredKeywordSuccess).not.toHaveBeenCalled();
  });

  it("allows all five representative keywords to use the SearchAD budget", async () => {
    const result = await refreshRegisteredKeywordSearchVolumes([
      "키워드1",
      "키워드2",
      "키워드3",
      "키워드4",
      "키워드5",
    ]);

    expect(result).toEqual({
      ok: true,
      failureCode: null,
      rateLimited: false,
    });
    expect(mocks.getKeywordSearchVolume).toHaveBeenCalledTimes(5);
  });

  it("stops remaining volume lookups on SearchAD rate limiting", async () => {
    mocks.findFirst.mockResolvedValue({
      ...candidate("1699073167", "뉴오더클럽 한남"),
      keywords: ["한남동데이트", "화덕피자"],
      hasSuccessfulValue: true,
      collectedAt: new Date(),
    });
    mocks.getKeywordSearchVolume.mockResolvedValue({
      ok: false,
      mobile: 0,
      pc: 0,
      total: 0,
      reason: "rate-limited",
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 1 });

    expect(result).toMatchObject({
      attempted: 1,
      succeeded: 0,
      failed: 1,
      failureCode: "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED",
    });
    expect(mocks.getKeywordSearchVolume).toHaveBeenCalledTimes(1);
    expect(mocks.saveRegisteredKeywordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        publicPlaceId: "1699073167",
        blocked: false,
      })
    );
    expect(mocks.saveRegisteredKeywordSuccess).not.toHaveBeenCalled();
  });

  it("continues collecting keyword names without more SearchAD calls after rate limiting", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(candidate("1699073167", "뉴오더클럽 한남"))
      .mockResolvedValueOnce(candidate("13100550", "파이프그라운드 한남점"));
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywords: ["한남동데이트"],
    });
    mocks.getKeywordSearchVolume.mockResolvedValue({
      ok: false,
      mobile: 0,
      pc: 0,
      total: 0,
      reason: "rate-limited",
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 2 });

    expect(result).toMatchObject({
      attempted: 2,
      succeeded: 1,
      failed: 1,
      failureCode: "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED",
    });
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.saveRegisteredKeywordSuccess).toHaveBeenCalledTimes(2);
    expect(mocks.getKeywordSearchVolume).toHaveBeenCalledTimes(1);
    expect(mocks.saveRegisteredKeywordFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps collecting all ten keyword-name rows after the first SearchAD rate limit", async () => {
    for (let index = 1; index <= 10; index += 1) {
      mocks.findFirst.mockResolvedValueOnce(
        candidate(String(10_000 + index), `한남동 매장 ${index}`)
      );
    }
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywords: ["한남동맛집"],
    });
    mocks.getKeywordSearchVolume.mockResolvedValue({
      ok: false,
      mobile: 0,
      pc: 0,
      total: 0,
      reason: "rate-limited",
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 10 });

    expect(result).toMatchObject({
      attempted: 10,
      succeeded: 9,
      failed: 1,
      failureCode: "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED",
    });
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(10);
    expect(mocks.saveRegisteredKeywordSuccess).toHaveBeenCalledTimes(10);
    expect(mocks.getKeywordSearchVolume).toHaveBeenCalledTimes(1);
    expect(mocks.saveRegisteredKeywordFailure).toHaveBeenCalledTimes(1);
  });

  it("does not copy an existing SearchAD cooldown onto newly collected stores", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(candidate("1699073167", "뉴오더클럽 한남"))
      .mockResolvedValueOnce(candidate("13100550", "파이프그라운드 한남점"));
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywords: ["한남동데이트"],
    });

    const result = await processRegisteredKeywordQueue({
      maxItems: 2,
      deferSearchVolumeRefresh: true,
    });

    expect(result).toMatchObject({
      attempted: 2,
      succeeded: 2,
      failed: 0,
    });
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.getKeywordSearchVolume).not.toHaveBeenCalled();
    expect(mocks.saveRegisteredKeywordFailure).not.toHaveBeenCalled();
  });

  it("does not fetch while the global NCAPTCHA/429 cooldown is active", async () => {
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map(),
      globalBlockUntil: new Date("2099-07-16T12:00:00.000Z"),
      globalBlockReason: "restaurant:HTML_CONFIRMED_NCAPTCHA",
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 3 });

    expect(result).toMatchObject({
      status: "GLOBAL_COOLDOWN",
      attempted: 0,
      blocked: true,
      failureCode: "restaurant:HTML_CONFIRMED_NCAPTCHA",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.getNaverPlaceReviewSnapshot).not.toHaveBeenCalled();
  });

  it("does not start a second worker while the DB-wide lease is held", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await processRegisteredKeywordQueue({ maxItems: 3 });

    expect(result).toMatchObject({
      status: "WORKER_BUSY",
      attempted: 0,
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.getNaverPlaceReviewSnapshot).not.toHaveBeenCalled();
  });

  it("claims work only from the requested place ids", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await processRegisteredKeywordQueue({
      maxItems: 2,
      publicPlaceIds: ["1699073167", "invalid", "13100550"],
    });

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicPlaceId: {
            in: ["1699073167", "13100550"],
          },
        }),
      })
    );
  });

  it("fails closed when an explicit place-id scope has no valid ids", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await processRegisteredKeywordQueue({
      maxItems: 1,
      publicPlaceIds: ["invalid"],
    });

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicPlaceId: { in: [] },
        }),
      })
    );
  });

  it("stops the run after a blocking response and keeps the item queued", async () => {
    mocks.findFirst.mockResolvedValue(
      candidate("1699073167", "뉴오더클럽 한남")
    );
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      registeredKeywordsStatus: "UNAVAILABLE",
      registeredKeywords: null,
      debugReason: "restaurant:HTML_CONFIRMED_NCAPTCHA",
      reason: "NAVER_BLOCKED_OR_CAPTCHA",
    });
    mocks.saveRegisteredKeywordFailure.mockResolvedValue(
      savedRow({
        queueStatus: "QUEUED",
        collectedAt: new Date("2026-07-15T00:00:00.000Z"),
        cooldownUntil: new Date("2026-07-16T12:00:00.000Z"),
      })
    );

    const result = await processRegisteredKeywordQueue({ maxItems: 3 });

    expect(result).toMatchObject({
      status: "GLOBAL_COOLDOWN",
      attempted: 1,
      failed: 1,
      blocked: true,
    });
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.saveRegisteredKeywordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        publicPlaceId: "1699073167",
        blocked: true,
      })
    );
    expect(mocks.saveRegisteredKeywordSuccess).not.toHaveBeenCalled();
  });

  it("does not globally stop on a parse error and continues to the next row", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(candidate("1550229480", "놉스 한남점"))
      .mockResolvedValueOnce(candidate("13100550", "파이프그라운드 한남점"));
    mocks.getNaverPlaceReviewSnapshot
      .mockResolvedValueOnce({
        registeredKeywordsStatus: "UNAVAILABLE",
        registeredKeywords: null,
        debugReason: "restaurant:HTML_PARSE_ERROR",
        reason: "REVIEW_METRICS_INCOMPLETE",
      })
      .mockResolvedValueOnce({
        registeredKeywordsStatus: "AVAILABLE",
        registeredKeywords: ["한남동맛집"],
        debugReason: null,
      });

    const result = await processRegisteredKeywordQueue({ maxItems: 2 });

    expect(result).toMatchObject({
      status: "COMPLETED",
      attempted: 2,
      succeeded: 1,
      failed: 1,
      blocked: false,
    });
    expect(mocks.saveRegisteredKeywordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ blocked: false })
    );
    expect(mocks.saveRegisteredKeywordSuccess).toHaveBeenCalledTimes(1);
  });

  it("stops before claiming another row when the time budget reserve is reached", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(candidate("1550229480", "놉스 한남점"))
      .mockResolvedValueOnce(candidate("13100550", "파이프그라운드 한남점"));
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywords: ["한남동스테이크"],
    });
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(3_000);

    const result = await processRegisteredKeywordQueue({
      maxItems: 8,
      timeBudgetMs: 10_000,
    });

    expect(result).toMatchObject({
      status: "TIME_BUDGET",
      attempted: 1,
      succeeded: 1,
    });
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(1);
  });

  it("uses a conservative daily cron cap, deadline, and jitter from server env", () => {
    vi.stubEnv("PLACE_ANALYSIS_REGISTERED_KEYWORD_QUEUE_MAX_ITEMS", "99");
    vi.stubEnv("PLACE_ANALYSIS_REGISTERED_KEYWORD_QUEUE_TIME_BUDGET_MS", "999999");
    vi.stubEnv("PLACE_ANALYSIS_REGISTERED_KEYWORD_QUEUE_JITTER_MS", "1");

    expect(getRegisteredKeywordCronQueueOptions()).toEqual({
      maxItems: 10,
      timeBudgetMs: 50_000,
      jitterMs: 500,
    });
    expect(REGISTERED_KEYWORD_QUEUE_CONCURRENCY).toBe(1);
  });
});
