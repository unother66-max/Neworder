import { describe, expect, it } from "vitest";

import {
  calculatePriceMetrics,
  formatComposition,
  getRecommendationMetric,
  parseProductSpec,
} from "@/lib/neworder/price-analysis";

describe("parseProductSpec", () => {
  it.each([
    ["올리브유 250ml, 5개", 250, "ml", 5, "개"],
    ["올리브유 250ml x 3개", 250, "ml", 3, "개"],
    ["올리브유 250ml 6병", 250, "ml", 6, "병"],
    ["오일 1L, 2개", 1000, "ml", 2, "개"],
    ["소스 500g, 10개", 500, "g", 10, "개"],
    ["냅킨 100매, 3팩", 100, "매", 3, "팩"],
  ] as const)(
    "%s에서 규격을 추출한다",
    (title, volume, unit, count, packageUnit) => {
      expect(parseProductSpec(title)).toEqual({
        volumePerUnit: volume,
        volumeUnit: unit,
        unitCount: count,
        packageUnit,
      });
    }
  );

  it("규격이 없으면 1개로 처리한다", () => {
    expect(parseProductSpec("트러플 오일")).toEqual({
      volumePerUnit: null,
      volumeUnit: null,
      unitCount: 1,
      packageUnit: "개",
    });
  });
});

describe("calculatePriceMetrics", () => {
  it("배송비 포함 묶음·100ml 가격을 계산한다", () => {
    const metrics = calculatePriceMetrics({
      title: "올리브유 250ml, 5개",
      itemPrice: 53060,
      shippingFee: 3000,
    });
    expect(metrics.totalPrice).toBe(56060);
    expect(metrics.unitPrice).toBeCloseTo(11212);
    expect(metrics.pricePer100).toBeCloseTo(4484.8);
    expect(formatComposition(metrics)).toBe("250ml × 5개");
  });

  it("매 상품은 매당 가격을 계산한다", () => {
    const metrics = calculatePriceMetrics({
      title: "냅킨 100매, 3팩",
      itemPrice: 9000,
      shippingFee: 0,
    });
    expect(metrics.unitPrice).toBe(3000);
    expect(metrics.pricePerMeasure).toBe(30);
  });
});

describe("getRecommendationMetric", () => {
  it("오일류는 100ml 기준을 사용한다", () => {
    expect(getRecommendationMetric("트러플 오일", "식자재")).toBe(
      "pricePer100"
    );
  });

  it("종이류는 매당 기준을 사용한다", () => {
    expect(getRecommendationMetric("칵테일 냅킨", "소모품")).toBe(
      "pricePerMeasure"
    );
  });
});
