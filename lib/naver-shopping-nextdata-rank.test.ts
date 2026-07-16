import { afterEach, describe, expect, it, vi } from "vitest";
import { findProductRankViaNaverShoppingNextData } from "@/lib/naver-shopping-nextdata-rank";

function payload(
  slots: Array<{
    rank: number;
    name: string;
    channelProductId?: string;
    originalMallProductId?: string;
    nvMid?: string;
    cardType?: string;
  }>
) {
  return {
    data: [
      {
        page: 1,
        pageSize: slots.length,
        slots: slots.map((item) => ({
          slotType: "CARD",
          data: {
            rank: item.rank,
            productName: item.name,
            channelProductId: item.channelProductId,
            originalMallProductId: item.originalMallProductId,
            nvMid: item.nvMid,
            cardType: item.cardType ?? "ORGANIC_CARD",
            sourceType: item.cardType === "SUPER_POINT_CARD" ? "SUPER_POINT" : "SAS",
          },
        })),
      },
    ],
  };
}

function mockResponse(body: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  );
}

describe("plus-store organic product matching", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("matches a plus-store product by its channel product id", async () => {
    mockResponse(
      payload([
        { rank: 1, name: "다른 상품", channelProductId: "channel-1" },
        { rank: 2, name: "타겟 상품", channelProductId: "channel-target" },
      ])
    );

    const result = await findProductRankViaNaverShoppingNextData({
      keyword: "키워드",
      targetProductId: "channel-target",
      targetProductName: "타겟 상품",
    });

    expect(result.rank).toBe(2);
    expect(result.diagnostics.matchedChannelProductId).toBe("channel-target");
    expect(result.diagnostics.isMatched).toBe(true);
  });

  it("matches when stored productId differs but stored channelProductId is equal", async () => {
    mockResponse(
      payload([{ rank: 3, name: "타겟", channelProductId: "same-channel" }])
    );

    const result = await findProductRankViaNaverShoppingNextData({
      keyword: "키워드",
      targetProductId: "different-product",
      targetChannelProductId: "same-channel",
    });

    expect(result.rank).toBe(3);
    expect(result.diagnostics.matchedProductId).toBe("same-channel");
  });

  it("matches when channelProductId differs but mallProductId is equal", async () => {
    mockResponse(
      payload([
        {
          rank: 4,
          name: "타겟",
          channelProductId: "different-channel",
          originalMallProductId: "same-mall",
        },
      ])
    );

    const result = await findProductRankViaNaverShoppingNextData({
      keyword: "키워드",
      targetProductId: "different-product",
      targetMallProductId: "same-mall",
    });

    expect(result.rank).toBe(4);
    expect(result.diagnostics.matchedMallProductId).toBe("same-mall");
  });

  it("does not match by similar product name alone", async () => {
    mockResponse(
      payload([{ rank: 1, name: "아주 비슷한 타겟 상품", channelProductId: "other-id" }])
    );

    const result = await findProductRankViaNaverShoppingNextData({
      keyword: "키워드",
      targetProductId: "missing-id",
      targetProductName: "아주 비슷한 타겟 상품",
    });

    expect(result.rank).toBeNull();
    expect(result.notFound).toBe(true);
    expect(result.diagnostics.reason).toBe("NOT_FOUND_IN_FETCHED_RESULTS");
  });

  it.each([
    { count: 100, reason: "OUT_OF_RANGE_100", label: "100위 밖" },
    { count: 200, reason: "OUT_OF_RANGE_200", label: "200위 밖" },
  ] as const)("distinguishes an actually checked $count-result boundary", async (testCase) => {
    mockResponse(
      payload(
        Array.from({ length: testCase.count }, (_, index) => ({
          rank: index + 1,
          name: `상품 ${index + 1}`,
          channelProductId: `channel-${index + 1}`,
        }))
      )
    );

    const result = await findProductRankViaNaverShoppingNextData({
      keyword: "키워드",
      targetProductId: "missing-id",
    });

    expect(result.diagnostics.reason).toBe(testCase.reason);
    expect(result.rankLabel).toBe(testCase.label);
  });

  it("excludes promotional cards and dedupes rows sharing any product id", async () => {
    mockResponse(
      payload([
        {
          rank: 1,
          name: "프로모션",
          channelProductId: "promo",
          cardType: "SUPER_POINT_CARD",
        },
        {
          rank: 1,
          name: "자연 상품",
          channelProductId: "channel-a",
          originalMallProductId: "mall-a",
        },
        {
          rank: 1,
          name: "동일 상품 중복",
          channelProductId: "channel-b",
          originalMallProductId: "mall-a",
        },
      ])
    );

    const result = await findProductRankViaNaverShoppingNextData({
      keyword: "키워드",
      targetProductId: "channel-b",
    });

    expect(result.rank).toBe(1);
    expect(result.diagnostics.totalFetchedCount).toBe(3);
    expect(result.diagnostics.dedupedCount).toBe(1);
  });
});
