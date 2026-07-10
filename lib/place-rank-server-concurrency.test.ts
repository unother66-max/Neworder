import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPlaceRankServerConcurrencyForTests,
  resolvePlaceRankServerConcurrency,
  runWithPlaceRankServerConcurrency,
} from "./place-rank-server-concurrency";

describe("place rank server concurrency", () => {
  beforeEach(() => clearPlaceRankServerConcurrencyForTests());

  it("prefers PLACE_RANK_CONCURRENCY over the public fallback", () => {
    expect(resolvePlaceRankServerConcurrency("2", "3")).toBe(2);
    expect(resolvePlaceRankServerConcurrency(undefined, "2")).toBe(2);
    expect(resolvePlaceRankServerConcurrency(undefined, undefined)).toBe(3);
  });

  it("limits actual server tasks to the configured value", async () => {
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 7 }, (_, index) =>
        runWithPlaceRankServerConcurrency(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return index;
        }, 2)
      )
    );
    expect(maxActive).toBe(2);
  });
});
