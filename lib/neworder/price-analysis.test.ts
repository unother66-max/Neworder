import { describe, expect, it } from "vitest";

import {
  calculatePriceMetrics,
  comparePriceMetrics,
  formatComposition,
  getRecommendationMetric,
  parseProductSpec,
  priceSortValue,
} from "@/lib/neworder/price-analysis";

describe("parseProductSpec", () => {
  it.each([
    ["올리브유 250ml, 5개", 250, "ml", 5, "개"],
    ["올리브유 250ml x 3개", 250, "ml", 3, "개"],
    ["올리브유 250ml 6병", 250, "ml", 6, "병"],
    ["올리브유 250MLX3P", 250, "ml", 3, "P"],
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

describe("price comparison", () => {
  const single = calculatePriceMetrics({
    title: "올리타리아 트러플 오일 250ml, 1개",
    itemPrice: 13900,
    shippingFee: 0,
  });
  const bundle = calculatePriceMetrics({
    title: "올리타리아 트러플 오일 250ml, 6개",
    itemPrice: 66980,
    shippingFee: 0,
  });

  it("100ml당 가격은 배송비 포함 총액과 전체 용량으로 비교한다", () => {
    expect(single.pricePer100).toBe(5560);
    expect(bundle.pricePer100).toBeCloseTo(4465.33, 2);
    expect(comparePriceMetrics(bundle, single, "pricePer100", null)).toBeLessThan(
      0
    );
  });

  it("총액 정렬에서는 단품을 먼저 추천한다", () => {
    expect(comparePriceMetrics(single, bundle, "totalPrice", null)).toBeLessThan(
      0
    );
  });

  it("유효하지 않은 100ml당 가격은 추천 비교에서 제외한다", () => {
    const unknownVolume = calculatePriceMetrics({
      title: "트러플 오일",
      itemPrice: 1000,
      shippingFee: 0,
    });
    expect(priceSortValue(unknownVolume, "pricePer100", null)).toBeNull();
    expect(
      comparePriceMetrics(unknownVolume, bundle, "pricePer100", null)
    ).toBeGreaterThan(0);
  });

  it("최근 구매가 대비 절감액이 큰 후보를 먼저 추천한다", () => {
    expect(comparePriceMetrics(bundle, single, "savings", 15000)).toBeLessThan(
      0
    );
  });
});
