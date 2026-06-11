import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  findUnique: vi.fn(),
  calculatePriceMetrics: vi.fn(),
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
}));

import { GET } from "@/app/api/operations/neworder/price-search/route";

const item = {
  name: "트러플오일",
  naverSearchKeyword: "트러플 오일 250ml",
  naverSearchKeywords: ["송로버섯 오일 250ml"],
  coupangSearchKeyword: null,
  coupangSearchKeywords: [],
  excludedKeywords: [],
};

function request(itemId = "item-1") {
  return new Request(
    `http://localhost/api/operations/neworder/price-search?itemId=${itemId}`
  );
}

describe("NewOrder price search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NAVER_CLIENT_ID", "client-id");
    vi.stubEnv("NAVER_CLIENT_SECRET", "client-secret");
    mocks.getNewOrderAccess.mockResolvedValue({ operator: { id: "operator-1" } });
    mocks.findUnique.mockResolvedValue(item);
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
                title: "형식이 잘못된 상품명",
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
      title: "형식이 잘못된 상품명",
      quantityPerPack: 1,
      volumePerUnit: null,
      volumeUnit: null,
      unitPrice: 56060,
      pricePer100: null,
    });
  });
});
