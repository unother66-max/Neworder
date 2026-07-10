import { describe, expect, it } from "vitest";

import { resolvePlaceReviewSnapshot } from "./place-review-snapshot-fallback";

describe("resolvePlaceReviewSnapshot", () => {
  it("keeps parsed zero values as real values", () => {
    expect(
      resolvePlaceReviewSnapshot({
        visitorReviewCount: 0,
        blogReviewCount: 0,
        saveCountText: "0",
      })
    ).toMatchObject({
      visitorReviewCount: 0,
      blogReviewCount: 0,
      totalReviewCount: 0,
      saveCount: "0",
      retainedFields: [],
    });
  });

  it("rejects partial fresh data instead of copying previous metrics", () => {
    expect(
      resolvePlaceReviewSnapshot(
        {
          visitorReviewCount: 120,
          blogReviewCount: null,
          saveCountText: null,
        },
        {
          visitorReviewCount: 100,
          blogReviewCount: 30,
          saveCount: "450",
        }
      )
    ).toBeNull();
  });

  it("does not invent zero values without a previous snapshot", () => {
    expect(
      resolvePlaceReviewSnapshot({
        visitorReviewCount: null,
        blogReviewCount: null,
        saveCountText: null,
      })
    ).toBeNull();
  });
});
