import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  findUnique: vi.fn(),
  calculatePriceMetrics: vi.fn(),
  parseShippingCondition: vi.fn(),
}));

vi.mock("@/lib/neworder/auth", () => ({
  getNewOrderAccess: mocks.getNewOrderAccess,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    newOrderItem: {
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("@/lib/neworder/price-analysis", () => ({
  calculatePriceMetrics: mocks.calculatePriceMetrics,
  getRecommendationMetric: vi.fn(() => "pricePer100"),
  parseShippingCondition: mocks.parseShippingCondition,
  metricValue: vi.fn(
    (metrics: { pricePer100: number | null; unitPrice: number }) =>
      metrics.pricePer100 ?? metrics.unitPrice
  ),
}));

import { GET } from "@/app/api/operations/neworder/price-search/route";

const item = {
  name: "올리타리아 트러플 오일 250ml",
  category: "오일",
  naverSearchKeyword: "트러플 오일 250ml",
  naverSearchKeywords: [
    "올리타리아 트러플 오일 250ml",
    "올리타리아 송로버섯향 올리브유 250ml",
  ],
  coupangSearchKeyword: null,
  coupangSearchKeywords: ["올리타리아 트러플 오일 250ml"],
  requiredKeywords: ["올리타리아"],
  optionalKeywords: ["트러플", "송로버섯"],
  preferredKeywords: ["250ml"],
  excludedKeywords: [],
};

function request(itemId = "item-1", query = "") {
  const params = new URLSearchParams();
  if (itemId) params.set("itemId", itemId);
  if (query) params.set("query", query);
  return new Request(
    `http://localhost/api/operations/neworder/price-search?${params.toString()}`
  );
}

describe("NewOrder price search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NAVER_CLIENT_ID", "client-id");
    vi.stubEnv("NAVER_CLIENT_SECRET", "client-secret");
    mocks.getNewOrderAccess.mockResolvedValue({ operator: { id: "operator-1" } });
    mocks.findUnique.mockResolvedValue(item);
    mocks.parseShippingCondition.mockReturnValue({
      shippingFee: 0,
      shippingUnitCount: 1,
      shippingStatus: "UNKNOWN",
      shippingNote: "배송비 정보를 자동으로 확인하지 못했습니다.",
      shippingCondition: null,
      shippingNeedsConfirmation: true,
    });
    mocks.calculatePriceMetrics.mockReturnValue({
      unitCount: 1,
      packageUnit: "개",
      volumePerUnit: 250,
      volumeUnit: "ml",
      totalPrice: 13900,
      unitPrice: 13900,
      totalVolume: 250,
      pricePer100: 5560,
      pricePerMeasure: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a fixed JSON failure when access is denied", async () => {
    mocks.getNewOrderAccess.mockResolvedValue(null);

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toMatchObject({
      ok: false,
      candidates: [],
      message: expect.any(String),
      reason: expect.any(String),
    });
  });

  it("품목 없이 직접 검색어 하나를 그대로 사용한다", async () => {
    const directQuery = "니트릴장갑 블랙 M";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              title: "브랜드 제한 없는 니트릴장갑 블랙 M 100매",
              link: "https://shopping.example/gloves",
              productId: "gloves",
              lprice: "8900",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request("", directQuery));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("query")
    ).toBe(directQuery);
    expect(data).toMatchObject({
      ok: true,
      searchedKeywords: [directQuery],
      directSearch: true,
      coupangSearchUrl: `https://www.coupang.com/np/search?q=${encodeURIComponent(directQuery)}`,
    });
    expect(data.candidates[0]).toMatchObject({
      productId: "gloves",
      isDirectSearch: true,
      passesRequired: true,
    });
  });

  it("품목과 직접 검색어가 모두 없으면 JSON 오류를 반환한다", async () => {
    const response = await GET(request(""));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      ok: false,
      candidates: [],
      directSearch: false,
    });
  });

  it("returns a fixed JSON failure when Naver credentials are missing", async () => {
    vi.stubEnv("NAVER_CLIENT_ID", "");
    vi.stubEnv("NAVER_CLIENT_SECRET", "");

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      ok: false,
      candidates: [],
      message: "가격 후보 조회에 실패했습니다.",
    });
    expect(data.reason).toContain("NAVER_CLIENT_ID");
    expect(data.reason).toContain("NAVER_CLIENT_SECRET");
  });

  it("returns JSON when the item database lookup fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      ok: false,
      candidates: [],
      message: "가격 후보 조회에 실패했습니다.",
      reason: "서버에서 가격 조회 중 오류가 발생했습니다.",
    });
  });

  it("returns a successful empty candidate list when no result exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      candidates: [],
      message: null,
    });
  });

  it("네이버 배송비 부과 기준과 반영 배송비를 후보에 포함한다", async () => {
    mocks.parseShippingCondition.mockReturnValue({
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
      shippingNote: "배송비 2,500원 (10개마다 부과)",
      shippingCondition: "배송비 2,500원 (10개마다 부과)",
      shippingNeedsConfirmation: false,
    });
    mocks.calculatePriceMetrics.mockReturnValue({
      unitCount: 6,
      packageUnit: "개",
      volumePerUnit: 2000,
      volumeUnit: "g",
      productPrice: 38040,
      shippingFee: 2500,
      shippingUnitCount: 10,
      effectiveShippingFee: 2500,
      totalPrice: 40540,
      unitPrice: 6756.666666666667,
      totalVolume: 12000,
      pricePer100: 329.5,
      pricePerMeasure: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                title: "올리타리아 소스 2kg × 6개",
                link: "https://shopping.example/shipping",
                productId: "shipping",
                lprice: "38040",
                deliveryFeeContent: "배송비 2,500원 (10개마다 부과)",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const response = await GET(request());
    const data = await response.json();

    expect(data.candidates[0]).toMatchObject({
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
      effectiveShippingFee: 2500,
      shippingNeedsConfirmation: false,
      unitPrice: 6756.666666666667,
      pricePer100: 329.5,
    });
  });

  it("네이버 상세 JSON의 배송비를 검색 후보에 자동 반영한다", async () => {
    mocks.parseShippingCondition.mockImplementation((value: unknown) => {
      const text = String(value ?? "");
      return text.includes("2500") && text.includes("10개마다")
        ? {
            shippingFee: 2500,
            shippingUnitCount: 10,
            shippingStatus: "PAID",
            shippingNote: "평균 3일 이내 도착 확률 86%",
            shippingCondition: "배송비 2,500원 / 10개마다 부과",
            shippingNeedsConfirmation: false,
          }
        : {
            shippingFee: 0,
            shippingUnitCount: 1,
            shippingStatus: "UNKNOWN",
            shippingNote: "배송비 정보를 자동으로 확인하지 못했습니다.",
            shippingCondition: null,
            shippingNeedsConfirmation: true,
          };
    });
    mocks.calculatePriceMetrics.mockReturnValue({
      unitCount: 10,
      packageUnit: "개",
      volumePerUnit: 567,
      volumeUnit: "g",
      productPrice: 20300,
      shippingFee: 2500,
      shippingUnitCount: 10,
      effectiveShippingFee: 2500,
      totalPrice: 22800,
      unitPrice: 2280,
      totalVolume: 5670,
      pricePer100: 402.1164021164021,
      pricePerMeasure: null,
    });
    const searchResponse = new Response(
      JSON.stringify({
        items: [
          {
            title: "올리타리아 코스트코 베이컨 크럼블 567g 10개",
            link: "https://smartstore.naver.com/example/products/1",
            productId: "bacon",
            lprice: "20300",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    const detailResponse = new Response(
      `<script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"product":{"delivery":{
          "deliveryFee":2500,
          "repeatQuantity":10,
          "notice":"평균 3일 이내 도착 확률 86%"
        }}}}}
      </script>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) =>
      String(input).includes("openapi.naver.com")
        ? Promise.resolve(searchResponse.clone())
        : Promise.resolve(detailResponse.clone())
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(data.candidates[0]).toMatchObject({
      shippingFee: 2500,
      shippingUnitCount: 10,
      shippingStatus: "PAID",
      shippingEnrichmentStatus: "COMPLETED",
      effectiveShippingFee: 2500,
      totalPriceWithShipping: 22800,
      unitPrice: 2280,
    });
  });

  it("returns JSON when every Naver response is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    );

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data).toMatchObject({
      ok: false,
      candidates: [],
      message: "가격 후보 조회에 실패했습니다.",
    });
    expect(data.reason).toContain("응답 본문이 비어 있습니다.");
  });

  it("keeps the candidate with safe defaults when product parsing fails", async () => {
    mocks.calculatePriceMetrics.mockImplementation(() => {
      throw new Error("parser failed");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                title: "올리타리아 형식이 잘못된 상품명",
                link: "https://shopping.example/product/1",
                productId: "product-1",
                lprice: "56060",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.candidates[0]).toMatchObject({
      title: "올리타리아 형식이 잘못된 상품명",
      quantityPerPack: 1,
      volumePerUnit: null,
      volumeUnit: null,
      unitPrice: 56060,
      pricePer100: null,
    });
  });

  it("저장된 정확 검색어만 사용하고 다른 브랜드를 제외한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              title:
                "올리타리아 송로버섯향 엑스트라버진 올리브유 250ml, 5개",
              link: "https://shopping.example/olitalia",
              productId: "olitalia",
              lprice: "56060",
            },
            {
              title: "테레 트러플 오일 250ml, 5개",
              link: "https://shopping.example/terre",
              productId: "terre",
              lprice: "40000",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.calculatePriceMetrics.mockImplementation(({ title, itemPrice }) => {
      const bundle = String(title).includes("5개");
      return {
        unitCount: bundle ? 5 : 1,
        packageUnit: "개",
        volumePerUnit: 250,
        volumeUnit: "ml",
        totalPrice: Number(itemPrice),
        unitPrice: Number(itemPrice) / (bundle ? 5 : 1),
        totalVolume: bundle ? 1250 : 250,
        pricePer100: (Number(itemPrice) / (bundle ? 1250 : 250)) * 100,
        pricePerMeasure: null,
      };
    });

    const response = await GET(request());
    const data = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const queries = fetchMock.mock.calls.map(([url]) =>
      new URL(String(url)).searchParams.get("query")
    );
    expect(queries).toEqual(item.naverSearchKeywords);
    expect(queries).not.toContain(item.naverSearchKeyword);
    expect(data.candidates).toHaveLength(1);
    expect(data.candidates[0]).toMatchObject({
      productId: "olitalia",
      quantityPerPack: 5,
      unitPrice: 11212,
      pricePer100: 4484.8,
    });
  });

  it("시아스 필수 키워드가 없는 2kg 상품과 볶음밥을 제외한다", async () => {
    mocks.findUnique.mockResolvedValue({
      ...item,
      name: "시아스 피자소스 2kg",
      category: "소스",
      naverSearchKeywords: ["시아스 피자소스 2kg"],
      coupangSearchKeywords: ["시아스 피자소스 2kg"],
      requiredKeywords: ["시아스", "피자소스"],
      optionalKeywords: [],
      preferredKeywords: ["2kg"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                title: "시아스 피자소스 2kg",
                link: "https://shopping.example/sias",
                productId: "sias",
                lprice: "12000",
              },
              {
                title: "시아스 볶음밥 2kg",
                link: "https://shopping.example/rice",
                productId: "rice",
                lprice: "9000",
              },
              {
                title: "일반 피자소스 2kg",
                link: "https://shopping.example/other",
                productId: "other",
                lprice: "8000",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const response = await GET(request());
    const data = await response.json();

    expect(data.candidates.map((candidate: { productId: string }) => candidate.productId)).toEqual([
      "sias",
    ]);
  });
});
