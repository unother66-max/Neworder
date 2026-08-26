import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildNaverPriceComparisonSearchUrl,
  buildNaverShoppingSearchUrl,
  parseNaverPriceComparisonSearchResponse,
  parseNaverShoppingSearchResponse,
  searchNaverShopping,
} from "@/lib/neworder/naver-shopping-search";

const priceComparisonLink =
  "https://cr3.shopping.naver.com/v2/bridge/searchGate?nv_mid=89471009805";

function normalNaverSearchPage(content = "") {
  return `<html><head><title>테스트 상품 : 네이버 검색</title></head><body><div id="container">${content}</div></body></html>`;
}

function priceComparisonPage() {
  return normalNaverSearchPage(`
    <section data-slog-container="shp_dui">
      <ul>
        <li>
          <a href="${priceComparisonLink}">
            <img src="https://shopping-phinf.pstatic.net/main/product.jpg" />
          </a>
          <div>
            <a href="${priceComparisonLink}">
              <span>커클랜드 <mark>베이컨 크럼블</mark> 567g</span>
            </a>
            <div>
              <div>
                <span class="blind">할인 전 판매가</span>
                <span>23,590</span><span>원</span>
              </div>
              <div>
                <span>19,280</span><span>원</span>
                <div><span class="blind">배송비</span>3,500원</div>
              </div>
            </div>
            <div><a href="https://smartstore.naver.com/example">조아나라</a></div>
          </div>
        </li>
      </ul>
    </section>
  `);
}

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

  it("슬롯이 비었을 때 사용할 네이버 가격비교 검색 URL을 구성한다", () => {
    const url = new URL(
      buildNaverPriceComparisonSearchUrl(" 몬트레이팜 페퍼잭 907 ")
    );

    expect(url.origin).toBe("https://search.naver.com");
    expect(url.pathname).toBe("/search.naver");
    expect(url.searchParams.get("where")).toBe("shop");
    expect(url.searchParams.get("query")).toBe("몬트레이팜 페퍼잭 907");
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

  it("통합검색의 네이버 가격비교 섹션을 후보 형식으로 변환한다", () => {
    const items = parseNaverPriceComparisonSearchResponse(
      priceComparisonPage()
    );

    expect(items).toEqual([
      {
        title: "커클랜드 베이컨 크럼블 567g",
        link: priceComparisonLink,
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

  it("빈 슬롯이면 네이버 가격비교 섹션을 조회한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ page: 1, pageSize: 0, slots: [] }] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(priceComparisonPage(), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const items = await searchNaverShopping("몬트레이팜 페퍼잭 907");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: "89471009805",
      lprice: "19280",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).hostname).toBe(
      "search.naver.com"
    );
  });

  it("정상 0건과 차단·파싱 실패를 구분한다", async () => {
    const emptySlotResponse = () =>
      new Response(
        JSON.stringify({ data: [{ page: 1, pageSize: 0, slots: [] }] }),
        { status: 200 }
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptySlotResponse())
      .mockResolvedValueOnce(new Response(normalNaverSearchPage(), { status: 200 }))
      .mockResolvedValueOnce(emptySlotResponse())
      .mockResolvedValueOnce(
        new Response("<html><body>보안 확인을 완료해 주세요.</body></html>", {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchNaverShopping("실제 없는 상품")).resolves.toEqual([]);
    await expect(searchNaverShopping("차단된 상품")).rejects.toThrow(
      "네이버 가격비교 검색 접근이 차단되었습니다."
    );
  });

  it("원본 상품 슬롯은 있지만 필수 필드가 바뀌면 파싱 실패로 처리한다", () => {
    expect(() =>
      parseNaverShoppingSearchResponse({
        data: [
          {
            slots: [
              {
                data: {
                  productName: "필드가 바뀐 상품",
                  renamedPrice: 10_000,
                  renamedLink: "https://shopping.example/product",
                },
              },
            ],
          },
        ],
      })
    ).toThrow("상품의 제목·가격·링크 구조가 변경되었습니다.");
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
