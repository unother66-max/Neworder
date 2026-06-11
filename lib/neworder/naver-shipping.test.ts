import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enrichNaverShipping,
  enrichNaverShippingCandidates,
  parseNaverShippingHtml,
} from "@/lib/neworder/naver-shipping";
import { calculatePriceMetrics } from "@/lib/neworder/price-analysis";

describe("parseNaverShippingHtml", () => {
  it("NEXT_DATA에서 베이컨 상품 배송비와 10개 부과 기준을 파싱한다", () => {
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">
          {
            "props": {
              "pageProps": {
                "product": {
                  "delivery": {
                    "deliveryFee": 2500,
                    "repeatQuantity": 10,
                    "notice": "평균 3일 이내 도착 확률 86%"
                  }
                }
              }
            }
          }
        </script>
      </body></html>
    `;

    const shipping = parseNaverShippingHtml(html);
    expect(shipping).toMatchObject({
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
      shippingNeedsConfirmation: false,
      source: "DETAIL_JSON",
      shippingNote: expect.stringContaining("평균 3일 이내 도착 확률 86%"),
    });
    const metrics = calculatePriceMetrics({
      title: "코스트코 베이컨 크럼블 567g 10개 볶음가능",
      itemPrice: 20300,
      shippingFee: shipping.shippingFee,
      shippingUnitCount: shipping.shippingUnitCount,
      shippingStatus: shipping.shippingStatus,
    });
    expect(metrics.effectiveShippingFee).toBe(2500);
    expect(metrics.totalPrice).toBe(22800);
    expect(metrics.unitPrice).toBe(2280);
    expect(metrics.pricePer100).toBeCloseTo(402.12, 2);
  });

  it("application/json에서 무료배송을 파싱한다", () => {
    const html = `
      <script type="application/json">
        {"pageProps":{"product":{"shipping":{"freeShipping":true,"text":"무료배송"}}}}
      </script>
    `;

    expect(parseNaverShippingHtml(html)).toMatchObject({
      shippingFee: 0,
      shippingUnitCount: 1,
      shippingStatus: "FREE",
      source: "DETAIL_JSON",
    });
  });

  it("배송 정보가 없으면 UNKNOWN으로 처리한다", () => {
    expect(parseNaverShippingHtml("<html><body>상품 상세 설명</body></html>"))
      .toMatchObject({
        shippingFee: 0,
        shippingUnitCount: 1,
        shippingStatus: "UNKNOWN",
        shippingNeedsConfirmation: true,
        source: "UNKNOWN",
      });
  });

  it("일반 HTML 텍스트에서 배송비를 파싱한다", () => {
    expect(
      parseNaverShippingHtml(
        "<div>배송비 2,500원</div><p>10개마다 부과</p>"
      )
    ).toMatchObject({
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
      source: "DETAIL_HTML",
    });
  });
});

describe("enrichNaverShipping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("상세 페이지 fetch 실패가 UNKNOWN 결과로 끝난다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("blocked")));

    await expect(
      enrichNaverShipping({
        link: "https://smartstore.naver.com/example/products/1",
      })
    ).resolves.toMatchObject({
      shippingStatus: "UNKNOWN",
      shippingFee: 0,
    });
  });

  it("최대 동시 요청 수를 제한한다", async () => {
    let active = 0;
    let maxActive = 0;
    const rows = Array.from({ length: 10 }, (_, index) => index);

    await enrichNaverShippingCandidates(
      rows,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
      },
      3
    );

    expect(maxActive).toBe(3);
  });
});
