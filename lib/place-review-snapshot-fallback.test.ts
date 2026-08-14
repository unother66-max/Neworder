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

  it("requires fresh review counts but keeps the previous save count", () => {
    expect(
      resolvePlaceReviewSnapshot(
        {
          reason: "REVIEW_METRICS_INCOMPLETE",
          chosenType: "place",
          visitorReviewCount: 120,
          blogReviewCount: 31,
          saveCountText: null,
        },
        {
          visitorReviewCount: 100,
          blogReviewCount: 30,
          saveCount: "450",
        }
      )
    ).toEqual({
      visitorReviewCount: 120,
      blogReviewCount: 31,
      totalReviewCount: 151,
      saveCount: "450",
      retainedFields: ["saveCount"],
      unavailableFields: ["saveCount"],
    });
  });

  it("does not copy previous review counts when a fresh review metric is missing", () => {
    expect(
      resolvePlaceReviewSnapshot(
        {
          reason: "REVIEW_METRICS_INCOMPLETE",
          chosenType: "place",
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

  it("accepts a first general-place snapshot without inventing a save count", () => {
    expect(
      resolvePlaceReviewSnapshot({
        reason: "REVIEW_METRICS_INCOMPLETE",
        chosenType: "place",
        visitorReviewCount: 120,
        blogReviewCount: 31,
        saveCountText: null,
      })
    ).toEqual({
      visitorReviewCount: 120,
      blogReviewCount: 31,
      totalReviewCount: 151,
      saveCount: null,
      retainedFields: [],
      unavailableFields: ["saveCount"],
    });
  });

  it("does not accept a restaurant snapshot with a missing save count", () => {
    expect(
      resolvePlaceReviewSnapshot({
        reason: "REVIEW_METRICS_INCOMPLETE",
        chosenType: "restaurant",
        visitorReviewCount: 120,
        blogReviewCount: 31,
        saveCountText: null,
      })
    ).toBeNull();
  });

  it("does not retain a save count when the request was blocked", () => {
    expect(
      resolvePlaceReviewSnapshot(
        {
          reason: "NAVER_BLOCKED_OR_CAPTCHA",
          chosenType: "place",
          visitorReviewCount: 120,
          blogReviewCount: 31,
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
});
