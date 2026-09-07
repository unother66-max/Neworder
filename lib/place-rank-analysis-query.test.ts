import { describe, expect, it } from "vitest";

import {
  buildPlaceRankAnalysisHref,
  readPlaceRankAnalysisKeyword,
} from "./place-rank-analysis-query";

describe("place rank analysis keyword query", () => {
  it.each(["한남동 맛집", "한남동 피자", "이태원 맛집"])(
    "round-trips %s through the TOP300 URL",
    (keyword) => {
      const href = buildPlaceRankAnalysisHref(keyword);
      const searchParams = new URL(href, "http://localhost").searchParams;

      expect(href).toBe(
        `/place-rank-analysis?keyword=${encodeURIComponent(keyword)}`
      );
      expect(readPlaceRankAnalysisKeyword(searchParams)).toBe(keyword);
    }
  );

  it("safely encodes spaces and special characters", () => {
    const keyword = "한남동 피자 & 파스타/맛집?";
    const href = buildPlaceRankAnalysisHref(keyword);

    expect(readPlaceRankAnalysisKeyword(new URL(href, "http://localhost").searchParams)).toBe(
      keyword
    );
  });
});
