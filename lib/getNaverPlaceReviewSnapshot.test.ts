import { describe, expect, it } from "vitest";

import {
  chooseBestPlaceTypeResult,
  extractReviewCountsFromRawHtml,
  resolvePlaceTypeOrder,
  resolveSnapshotRequestCacheStatus,
  runPlaceTypeAttempts,
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

  it("distinguishes in-flight dedupe from force update bypass", () => {
    expect(resolveSnapshotRequestCacheStatus(false, true)).toBe(
      "IN_FLIGHT_DEDUPE"
    );
    expect(resolveSnapshotRequestCacheStatus(true, true)).toBe("FORCE_BYPASS");
    expect(resolveSnapshotRequestCacheStatus(false, false)).toBe("MISS");
  });

  it("uses restaurant first for a food category", () => {
    expect(
      resolvePlaceTypeOrder({
        category: "음식점 > 양식 > 피자",
        placeName: "뉴오더클럽 한남",
        placeUrl: "https://m.place.naver.com/restaurant/1/home",
      })
    ).toEqual(["restaurant", "place"]);
  });

  it("uses place first for pilates and ballet even when the saved URL says restaurant", () => {
    expect(
      resolvePlaceTypeOrder({
        category: "필라테스, 발레",
        placeName: "키코필라테스 앤 발레",
        placeUrl: "https://m.place.naver.com/restaurant/1225865054/home",
      })
    ).toEqual(["place", "restaurant"]);
  });

  it("uses the place result when restaurant is empty without a block", async () => {
    const called: string[] = [];
    const result = await runPlaceTypeAttempts(
      ["restaurant", "place"],
      async (type) => {
        called.push(type);
        return type === "restaurant"
          ? {
              type,
              pageMetricCount: 0,
              visitorReviewCount: null,
              blogReviewCount: null,
              saveCount: null,
              keywordList: [],
              blocked: false,
              debugReason: "restaurant:GRAPHQL_TARGET_NOT_FOUND",
            }
          : {
              type,
              pageMetricCount: 0,
              visitorReviewCount: 321,
              blogReviewCount: 45,
              saveCount: 678,
              keywordList: [],
              blocked: false,
              debugReason: null,
            };
      }
    );

    expect(called).toEqual(["restaurant", "place"]);
    expect(result.chosen).toMatchObject({
      type: "place",
      visitorReviewCount: 321,
      blogReviewCount: 45,
      saveCount: 678,
    });
  });

  it("stops before the fallback type when CAPTCHA or cooldown is explicit", async () => {
    const called: string[] = [];
    const result = await runPlaceTypeAttempts(
      ["restaurant", "place"],
      async (type) => {
        called.push(type);
        return {
          type,
          pageMetricCount: 0,
          visitorReviewCount: null,
          blogReviewCount: null,
          saveCount: null,
          keywordList: [],
          blocked: true,
          debugReason: `${type}:GRAPHQL_NCAPTCHA`,
        };
      }
    );

    expect(called).toEqual(["restaurant"]);
    expect(result.stoppedByBlock).toBe(true);
    expect(result.attempts).toHaveLength(1);
  });
});
