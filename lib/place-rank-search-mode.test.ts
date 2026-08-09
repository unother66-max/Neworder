import { describe, expect, it } from "vitest";

import { resolvePlaceRankSearchMode } from "./place-rank-search-mode";

describe("resolvePlaceRankSearchMode", () => {
  it.each([
    {
      keyword: "평택 동물체험",
      category: "키즈카페,실내놀이터",
      expected: "place",
    },
    {
      keyword: "평택 동물원",
      category: "키즈카페,실내놀이터",
      expected: "place",
    },
    {
      keyword: "잠실 키즈카페",
      category: "카페",
      expected: "place",
    },
    {
      keyword: "어린이 체험관",
      category: "테마카페",
      expected: "place",
    },
    {
      keyword: "서울역 필라테스",
      category: "필라테스",
      expected: "place",
    },
    {
      keyword: "한남동 맛집",
      category: "양식",
      expected: "restaurant",
    },
    {
      keyword: "평택 카페",
      category: "카페,디저트",
      expected: "restaurant",
    },
  ])(
    "uses $expected for $keyword ($category)",
    ({ keyword, category, expected }) => {
      expect(resolvePlaceRankSearchMode({ keyword, category })).toBe(expected);
    }
  );

  it("keeps an explicit food intent on the restaurant search", () => {
    expect(
      resolvePlaceRankSearchMode({
        keyword: "성수 데이트 맛집",
        category: "한식",
      })
    ).toBe("restaurant");
  });

  it("uses category only when the keyword has no known industry intent", () => {
    expect(
      resolvePlaceRankSearchMode({
        keyword: "평택 추천 업체",
        category: "한식",
      })
    ).toBe("restaurant");
  });
});
