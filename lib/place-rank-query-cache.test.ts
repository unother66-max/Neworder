import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPlaceRankQueryCacheForTests,
  runPlaceRankQueryCached,
} from "./place-rank-query-cache";

describe("runPlaceRankQueryCached", () => {
  beforeEach(() => clearPlaceRankQueryCacheForTests());

  it("does not run the loader on a cache hit", async () => {
    const loader = vi.fn().mockResolvedValue({ status: "FOUND" });
    const input = {
      key: "same-query",
      loader,
      shouldCache: () => true,
      ttlMs: 10_000,
      nowMs: 1_000,
    };

    expect((await runPlaceRankQueryCached(input)).cacheStatus).toBe("MISS");
    expect(
      (
        await runPlaceRankQueryCached({
          ...input,
          nowMs: 2_000,
        })
      ).cacheStatus
    ).toBe("HIT");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("deduplicates two identical in-flight requests", async () => {
    let release!: (value: { status: string }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          release = resolve;
        })
    );
    const input = {
      key: "in-flight-query",
      loader,
      shouldCache: () => true,
      ttlMs: 10_000,
    };

    const first = runPlaceRankQueryCached(input);
    const second = runPlaceRankQueryCached(input);
    expect(loader).toHaveBeenCalledTimes(1);
    release({ status: "FOUND" });

    expect((await first).cacheStatus).toBe("MISS");
    expect((await second).cacheStatus).toBe("IN_FLIGHT_DEDUPE");
  });

  it("does not cache blocked or partial results", async () => {
    const loader = vi.fn().mockResolvedValue({ status: "PARTIAL_FAILED" });
    const input = {
      key: "blocked-query",
      loader,
      shouldCache: (value: { status: string }) => value.status === "FOUND",
    };

    await runPlaceRankQueryCached(input);
    await runPlaceRankQueryCached(input);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
