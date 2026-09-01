import { describe, expect, it, vi } from "vitest";

import {
  collectNaverPlaceTop300,
  validateTop300Keyword,
} from "./place-rank-top300";

function restaurantPage(start: number, count = 70) {
  return {
    data: {
      restaurants: {
        businesses: {
          total: 520,
          items: Array.from({ length: count }, (_, index) => {
            const placeNumber = start + index;
            return {
              id: String(1_000_000 + placeNumber),
              name: `한남동 매장 ${placeNumber}`,
              category: placeNumber % 2 === 0 ? "피자" : "양식",
              roadAddress: `서울 용산구 한남동 ${placeNumber}`,
              imageUrl: `https://example.com/place-${placeNumber}.jpg`,
              visitorReviewScore: "4.89",
              visitorReviewCount: String(placeNumber * 10),
              blogCafeReviewCount: placeNumber * 2,
              saveCount: `${placeNumber * 100}+`,
            };
          }),
        },
      },
    },
  };
}

describe("collectNaverPlaceTop300", () => {
  it("collects ranks 1 through 300 with one batched Naver request", async () => {
    const responseBatch = Array.from({ length: 5 }, (_, index) =>
      restaurantPage(1 + index * 70)
    );
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(responseBatch), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );

    const result = await collectNaverPlaceTop300("한남동 맛집", {
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    const requestBody = JSON.parse(String(init?.body));
    expect(requestBody).toHaveLength(5);
    expect(
      requestBody.map(
        (payload: { variables: { input: { start: number } } }) =>
          payload.variables.input.start
      )
    ).toEqual([1, 71, 141, 211, 281]);
    expect(requestBody[0].variables.input.businessType).toBe("restaurant");
    expect(requestBody[0].variables.input.deviceType).toBe("pcmap");
    expect(requestBody[0].query).toContain("imageUrl");
    expect(requestBody[0].query).toContain("visitorReviewScore");

    expect(result).toMatchObject({
      keyword: "한남동 맛집",
      total: 300,
      searchMode: "restaurant",
      source: "pcmap-place-list",
      naverRequestCount: 1,
      requestOperationCount: 5,
      completedPages: 5,
      duplicateCount: 0,
      invalidItemCount: 0,
      partial: false,
    });
    expect(result.results[0]).toMatchObject({
      rank: 1,
      placeId: "1000001",
      name: "한남동 매장 1",
      thumbnail: "https://example.com/place-1.jpg",
      rating: "4.89",
      visitorReviewCount: 10,
      blogReviewCount: 2,
      saveCount: "100+",
    });
    expect(result.results[99]?.rank).toBe(100);
    expect(result.results[199]?.rank).toBe(200);
    expect(result.results[299]).toMatchObject({
      rank: 300,
      placeId: "1000300",
    });
  });

  it("removes duplicate place ids without making another request", async () => {
    const responseBatch = Array.from({ length: 5 }, (_, index) =>
      restaurantPage(1 + index * 70)
    );
    responseBatch[1].data.restaurants.businesses.items[0] = {
      ...responseBatch[1].data.restaurants.businesses.items[0],
      id: "1000070",
    };
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(responseBatch), { status: 200 })
    );

    const result = await collectNaverPlaceTop300("한남동 맛집", {
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.total).toBe(300);
    expect(result.duplicateCount).toBe(1);
    expect(new Set(result.results.map((row) => row.placeId)).size).toBe(300);
  });

  it("uses the general place list for non-food keywords", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body));
      const batch = requestBody.map(() => ({
        data: {
          places: {
            businesses: {
              total: 1,
              items: [{ id: "987", name: "한남 필라테스", category: "필라테스" }],
            },
          },
        },
      }));
      return new Response(JSON.stringify(batch), { status: 200 });
    });

    const result = await collectNaverPlaceTop300("한남동 필라테스", {
      fetchImpl,
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const requestBody = JSON.parse(String(init?.body));

    expect(result.searchMode).toBe("place");
    expect(requestBody[0].variables.input.businessType).toBe("place");
  });
});

describe("validateTop300Keyword", () => {
  it("normalizes whitespace and rejects empty input", () => {
    expect(validateTop300Keyword("  한남동   맛집  ")).toEqual({
      ok: true,
      keyword: "한남동 맛집",
    });
    expect(validateTop300Keyword("   ")).toMatchObject({ ok: false });
  });
});
