import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptions: vi.fn(),
  processQueue: vi.fn(),
}));

vi.mock("@/lib/place-registered-keyword-queue", () => ({
  getRegisteredKeywordCronQueueOptions: mocks.getOptions,
  processRegisteredKeywordQueue: mocks.processQueue,
}));

import { GET, maxDuration } from "@/app/api/cron/place-analysis-registered-keywords/route";

describe("place-analysis registered-keyword cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptions.mockReturnValue({
      maxItems: 8,
      timeBudgetMs: 45_000,
      jitterMs: 1_000,
    });
    mocks.processQueue.mockResolvedValue({
      status: "TIME_BUDGET",
      attempted: 6,
      succeeded: 6,
      failed: 0,
      blocked: false,
      cooldownUntil: null,
      failureCode: null,
    });
  });

  it("keeps a 60-second function cap while passing the safe worker budget", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/place-analysis-registered-keywords")
    );
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(mocks.processQueue).toHaveBeenCalledWith({
      maxItems: 8,
      timeBudgetMs: 45_000,
      jitterMs: 1_000,
    });
    expect(body).toMatchObject({
      ok: true,
      concurrency: 1,
      maxItems: 8,
      timeBudgetMs: 45_000,
      status: "TIME_BUDGET",
    });
  });
});
