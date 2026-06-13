import { describe, expect, it } from "vitest";

import {
  calculatePriceMetrics,
  comparePriceMetrics,
  formatComposition,
  getRecommendationMetric,
  parseProductSpec,
  parseShippingCondition,
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
      shippingStatus: "PAID",
    });
    expect(metrics.totalPrice).toBe(56060);
    expect(metrics.effectiveShippingFee).toBe(3000);
    expect(metrics.unitPrice).toBeCloseTo(11212);
    expect(metrics.pricePer100).toBeCloseTo(4484.8);
    expect(formatComposition(metrics)).toBe("250ml × 5개");
  });

  it("n개마다 부과되는 배송비를 구간별로 반영한다", () => {
    const single = calculatePriceMetrics({
      title: "피자소스 2kg",
      itemPrice: 6390,
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
    });
    expect(single.effectiveShippingFee).toBe(2500);
    expect(single.totalPrice).toBe(8890);
    expect(single.unitPrice).toBe(8890);
    expect(single.pricePer100).toBe(444.5);

    const bundle = calculatePriceMetrics({
      title: "피자소스 2kg × 6개",
      itemPrice: 38040,
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
    });
    expect(bundle.effectiveShippingFee).toBe(2500);
    expect(bundle.totalPrice).toBe(40540);
    expect(bundle.unitPrice).toBeCloseTo(6756.67);
    expect(bundle.pricePer100).toBeCloseTo(337.83);

    const overUnit = calculatePriceMetrics({
      title: "베이컨 크럼블 567g × 12개",
      itemPrice: 24360,
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
    });
    expect(overUnit.effectiveShippingFee).toBe(5000);
  });

  it("배송비 부과 모드별 총 배송비를 계산한다", () => {
    const base = {
      title: "테스트 상품 10개",
      itemPrice: 10000,
      shippingFee: 3500,
      shippingStatus: "PAID" as const,
      quantityPerPack: 10,
    };

    expect(
      calculatePriceMetrics({
        ...base,
        shippingFeeMode: "ORDER_ONCE",
      }).effectiveShippingFee
    ).toBe(3500);
    expect(
      calculatePriceMetrics({
        ...base,
        shippingFeeMode: "PER_ITEM",
      }).effectiveShippingFee
    ).toBe(35000);
    expect(
      calculatePriceMetrics({
        ...base,
        shippingFeeMode: "PER_N_ITEMS",
        shippingUnitCount: 3,
      }).effectiveShippingFee
    ).toBe(14000);
  });

  it("베이컨 567g 10개 상품에 10개당 배송비를 한 번 적용한다", () => {
    const metrics = calculatePriceMetrics({
      title: "코스트코 베이컨 크럼블 567g 10개",
      itemPrice: 20300,
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
    });
    expect(metrics.unitCount).toBe(10);
    expect(metrics.effectiveShippingFee).toBe(2500);
    expect(metrics.totalPrice).toBe(22800);
    expect(metrics.unitPrice).toBe(2280);
    expect(metrics.pricePer100).toBeCloseTo(402.12, 2);
  });

  it("서울연유 500g에 수동 배송비 3,000원을 즉시 반영한다", () => {
    const metrics = calculatePriceMetrics({
      title: "서울연유 500g",
      itemPrice: 3600,
      shippingFee: 3000,
      shippingUnitCount: 1,
      shippingStatus: "PAID",
    });
    expect(metrics.effectiveShippingFee).toBe(3000);
    expect(metrics.totalPrice).toBe(6600);
    expect(metrics.pricePer100).toBe(1320);
  });

  it("배송비 미확인 후보는 배송비를 확정 가격에 반영하지 않는다", () => {
    const metrics = calculatePriceMetrics({
      title: "피자소스 2kg × 6개",
      itemPrice: 38040,
      shippingFee: 2500,
      shippingUnitCount: 1,
      shippingStatus: "UNKNOWN",
      shippingNeedsConfirmation: true,
    });
    expect(metrics.effectiveShippingFee).toBe(0);
  });

  it("매 상품은 매당 가격을 계산한다", () => {
    const metrics = calculatePriceMetrics({
      title: "냅킨 100매, 3팩",
      itemPrice: 9000,
      shippingFee: 0,
      shippingStatus: "FREE",
    });
    expect(metrics.unitPrice).toBe(3000);
    expect(metrics.pricePerMeasure).toBe(30);
  });
});

describe("parseShippingCondition", () => {
  it("무료배송과 n개마다 부과 조건을 파싱한다", () => {
    expect(parseShippingCondition("무료배송")).toMatchObject({
      shippingFee: 0,
      shippingNeedsConfirmation: false,
      shippingStatus: "FREE",
    });
    expect(parseShippingCondition("배송 무료")).toMatchObject({
      shippingFee: 0,
      shippingNeedsConfirmation: false,
      shippingStatus: "FREE",
    });
    expect(
      parseShippingCondition("배송비 2,500원 (10개마다 부과)")
    ).toMatchObject({
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
      shippingNeedsConfirmation: false,
    });
  });

  it("수량이 없는 묶음배송은 확인 필요로 처리한다", () => {
    expect(parseShippingCondition("배송비 3,000원 / 묶음배송")).toMatchObject({
      shippingFee: 3000,
      shippingUnitCount: 1,
      shippingStatus: "UNKNOWN",
      shippingNeedsConfirmation: true,
    });
  });

  it("API가 숫자 배송비를 주면 유료배송으로 확정한다", () => {
    expect(parseShippingCondition("", 2500)).toMatchObject({
      shippingFee: 2500,
      shippingUnitCount: 1,
      shippingStatus: "PAID",
      shippingNeedsConfirmation: false,
    });
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
