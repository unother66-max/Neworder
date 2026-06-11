import { describe, expect, it } from "vitest";

import {
  compareKeywordMatches,
  matchProductKeywords,
  normalizeProductText,
} from "@/lib/neworder/product-matching";

const truffleRules = {
  requiredKeywords: ["올리타리아"],
  optionalKeywords: ["트러플", "송로버섯"],
  preferredKeywords: ["250ml"],
  excludedKeywords: ["코스트코"],
};

describe("product keyword matching", () => {
  it("공백, 대소문자, 특수문자를 제거해 비교한다", () => {
    expect(normalizeProductText(" Olitalia 250 mL / 5개 ")).toBe(
      "olitalia250ml5개"
    );
  });

  it("필수 브랜드가 없는 상품을 제외한다", () => {
    expect(
      matchProductKeywords("테레 트러플 오일 250ml", truffleRules)
        .passesRequired
    ).toBe(false);
  });

  it("제외 키워드가 있는 상품을 제외한다", () => {
    expect(
      matchProductKeywords(
        "코스트코 올리타리아 트러플 오일 250ml",
        truffleRules
      ).passesExcluded
    ).toBe(false);
  });

  it("선택 및 선호 키워드 일치 상품을 우선한다", () => {
    const matching = matchProductKeywords(
      "올리타리아 송로버섯향 올리브유 250ml, 5개",
      truffleRules
    );
    const plain = matchProductKeywords("올리타리아 올리브유 1L", truffleRules);

    expect(compareKeywordMatches(matching, plain)).toBeLessThan(0);
  });
});
