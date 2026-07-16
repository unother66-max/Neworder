import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNaverPlaceReviewSnapshot: vi.fn(),
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
    /NCAPTCHA|HTTP_429|COOLDOWN/i.test(String(reason ?? "")),
  loadRegisteredKeywordCacheState: mocks.loadRegisteredKeywordCacheState,
  saveRegisteredKeywordSuccess: mocks.saveRegisteredKeywordSuccess,
  saveRegisteredKeywordFailure: mocks.saveRegisteredKeywordFailure,
}));

import {
  REGISTERED_KEYWORD_QUEUE_CONCURRENCY,
  enqueueRegisteredKeywordCollectionTargets,
  processRegisteredKeywordQueue,
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
          input.force === true && input.collectRegisteredKeywords === true
      )
    ).toBe(true);
  });

  it("does not fetch while the global NCAPTCHA/429 cooldown is active", async () => {
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map(),
      globalBlockUntil: new Date("2099-07-16T12:00:00.000Z"),
      globalBlockReason: "restaurant:HTML_NCAPTCHA",
    });

    const result = await processRegisteredKeywordQueue({ maxItems: 3 });

    expect(result).toMatchObject({
      status: "GLOBAL_COOLDOWN",
      attempted: 0,
      blocked: true,
      failureCode: "restaurant:HTML_NCAPTCHA",
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

  it("stops the run after a blocking response and keeps the item queued", async () => {
    mocks.findFirst.mockResolvedValue(
      candidate("1699073167", "뉴오더클럽 한남")
    );
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      registeredKeywordsStatus: "UNAVAILABLE",
      registeredKeywords: null,
      debugReason: "restaurant:HTML_NCAPTCHA",
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
});
