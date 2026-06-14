import { describe, expect, it } from "vitest";

import {
  chooseBestPlaceTypeResult,
  extractReviewCountsFromRawHtml,
} from "./getNaverPlaceReviewSnapshot";

describe("getNaverPlaceReviewSnapshot parsing helpers", () => {
  it("reads current review-count key aliases from raw mobile HTML", () => {
    expect(
      extractReviewCountsFromRawHtml(`
        <script>
          window.__STATE__ = {
            "placeReviewCount": "1,234",
            "blogCafeReviewCount": 56
          };
        </script>
      `)
    ).toEqual({
      visitorReviewCount: 1234,
      blogReviewCount: 56,
    });
  });

  it("preserves real zero values", () => {
    expect(
      extractReviewCountsFromRawHtml(
        `{"visitorReviewCount":0,"blogReviewCount":"0"}`
      )
    ).toEqual({
      visitorReviewCount: 0,
      blogReviewCount: 0,
    });
  });

  it("prefers the type with page-derived metrics over the URL hint order", () => {
    const selected = chooseBestPlaceTypeResult([
      {
        type: "restaurant",
        pageMetricCount: 0,
        visitorReviewCount: 100,
        blogReviewCount: 20,
        saveCount: 300,
        keywordList: [],
      },
      {
        type: "place",
        pageMetricCount: 2,
        visitorReviewCount: 101,
        blogReviewCount: 21,
        saveCount: 300,
        keywordList: [],
      },
    ]);

    expect(selected?.type).toBe("place");
  });
});
