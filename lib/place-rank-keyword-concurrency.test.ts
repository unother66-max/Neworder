import { describe, expect, it } from "vitest";
import {
  mapWithConcurrencyLimit,
  resolvePlaceRankKeywordConcurrency,
} from "./place-rank-keyword-concurrency";

describe("place rank keyword concurrency", () => {
  it("allows at most three active tasks when the limit is three", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 3, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value;
    });
    expect(maxActive).toBe(3);
  });

  it("clamps the configured value to the safe range", () => {
    expect(resolvePlaceRankKeywordConcurrency("3")).toBe(3);
    expect(resolvePlaceRankKeywordConcurrency("99")).toBe(3);
    expect(resolvePlaceRankKeywordConcurrency("0")).toBe(1);
    expect(resolvePlaceRankKeywordConcurrency("invalid")).toBe(3);
  });

  it("prefers the server value and keeps the public value as fallback", () => {
    expect(resolvePlaceRankKeywordConcurrency("2", "3")).toBe(2);
    expect(resolvePlaceRankKeywordConcurrency(undefined, "2")).toBe(2);
  });
});
