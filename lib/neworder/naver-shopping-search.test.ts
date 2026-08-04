import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildNaverShoppingSearchUrl,
  parseNaverShoppingSearchResponse,
  searchNaverShopping,
} from "@/lib/neworder/naver-shopping-search";

describe("NewOrder Naver shopping search adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("현재 쇼핑 슬롯 검색 URL을 구성한다", () => {
    const url = new URL(buildNaverShoppingSearchUrl(" 베이컨 크럼블 "));

    expect(url.origin).toBe("https://ns-portal.shopping.naver.com");
    expect(url.pathname).toBe("/api/v2/shopping-paged-slot");
    expect(url.searchParams.get("query")).toBe("베이컨 크럼블");
    expect(url.searchParams.get("source")).toBe("shp_gui");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("pageSize")).toBe("40");
  });

  it("상품명·할인가·이미지·판매처·유료배송을 후보 형식으로 변환한다", () => {
    const items = parseNaverShoppingSearchResponse({
      data: [
        {
          slots: [
            {
              data: {
                cardType: "ORGANIC_CARD",
                nvMid: 89471009805,
                channelProductId: "11926499117",
                productName: "커클랜드 <mark>베이컨 크럼블</mark> 567g",
                productUrl: {
                  pcUrl: "https://smartstore.naver.com/main/products/11926499117",
                },
                productClickUrl: {
                  pcUrl: "https://cr3.shopping.naver.com/ignored",
                },
                images: [
                  {
                    imageUrl:
                      "https://shopping-phinf.pstatic.net/main/product.jpg",
                  },
                ],
                mallName: "조아나라",
                salePrice: 23_590,
                discountedSalePrice: 19_380,
                discountedKRWSalePrice: 19_280,
                productDeliveryInfo: {
                  deliveryFee: 3_500,
                  deliveryFeeTypes: ["PAID"],
                },
              },
            },
          ],
        },
      ],
    });

    expect(items).toEqual([
      {
        title: "커클랜드 <mark>베이컨 크럼블</mark> 567g",
        link: "https://smartstore.naver.com/main/products/11926499117",
        image: "https://shopping-phinf.pstatic.net/main/product.jpg",
        lprice: "19280",
        mallName: "조아나라",
        productId: "89471009805",
        shippingFee: 3500,
        deliveryFee: 3500,
        deliveryFeeContent: "배송비 3,500원",
      },
    ]);
  });

  it("카탈로그 상품은 클릭 URL과 무료배송 정보를 대체값으로 사용한다", () => {
    const items = parseNaverShoppingSearchResponse({
      data: [
        {
          slots: [
            {
              data: {
                cardType: "CATALOG_CARD",
                nvMid: "59776728880",
                productName: "커클랜드 크럼블스 베이컨 567g",
                productUrl: { pcUrl: "" },
                productClickUrl: {
                  pcUrl: "https://cr3.shopping.naver.com/v2/bridge/searchGate",
                },
                discountedSalePrice: 16_990,
                productDeliveryInfo: {
                  deliveryFee: 0,
                  deliveryFeeTypes: ["CATALOG_INCLUDED_FREE"],
                },
              },
            },
          ],
        },
      ],
    });

    expect(items[0]).toMatchObject({
      link: "https://cr3.shopping.naver.com/v2/bridge/searchGate",
      lprice: "16990",
      productId: "59776728880",
      shippingFee: 0,
      deliveryFeeContent: "무료배송",
    });
  });

  it("HTTP 실패와 변경된 응답 형식을 명확한 오류로 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"error":"blocked"}', { status: 403 })
      )
    );

    await expect(searchNaverShopping("테스트 상품")).rejects.toThrow(
      "네이버 쇼핑 검색 요청에 실패했습니다. (HTTP 403)"
    );
    expect(() => parseNaverShoppingSearchResponse({ items: [] })).toThrow(
      "네이버 쇼핑 검색 결과 목록이 없습니다."
    );
  });
});
