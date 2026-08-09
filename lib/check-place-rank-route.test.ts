import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminAlert: vi.fn(),
  getKeywordSearchVolume: vi.fn(),
  fetchPlace: vi.fn(),
  fetchRestaurant: vi.fn(),
}));

vi.mock("@/lib/admin-alert", () => ({
  createAdminAlert: mocks.createAdminAlert,
}));

vi.mock("@/lib/getKeywordSearchVolume", () => ({
  getKeywordSearchVolume: mocks.getKeywordSearchVolume,
}));

vi.mock("@/lib/pcmap-place-list-graphql", () => ({
  fetchPcmapPlaceListGraphql: mocks.fetchPlace,
}));

vi.mock("@/lib/pcmap-restaurants-graphql-diagnostic", () => ({
  fetchPcmapRestaurantsGraphqlDiagnostic: mocks.fetchRestaurant,
}));

import { POST } from "@/app/api/check-place-rank/route";
import { clearPlaceRankQueryCacheForTests } from "./place-rank-query-cache";

function placeItem(id: string, name: string, category: string) {
  return {
    id,
    name,
    category,
    businessCategory: category,
    roadAddress: "경기 평택시 하북3길 25-59",
    address: "경기 평택시 진위면 하북리",
    x: "127.072",
    y: "37.117",
    visitorReviewCount: 10,
    blogCafeReviewCount: 5,
    saveCount: 0,
    isNewOpen: false,
    newOpenLabel: null,
  };
}

describe("check-place-rank route search mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPlaceRankQueryCacheForTests();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const items = [
      placeItem("943647156", "삼층고양이카페", "고양이카페"),
      placeItem("36192987", "소풍동물원", "키즈카페,실내놀이터"),
    ];
    mocks.fetchPlace.mockResolvedValue({
      ok: true,
      status: "FOUND",
      source: "getPlacesList",
      operationName: "getPlacesList",
      queryName: "placeList",
      requestedStarts: [1, 71, 141, 211],
      completedPages: 1,
      parsedCount: items.length,
      total: 9,
      rank: 2,
      targetName: "소풍동물원",
      items,
      pages: [{ start: 1, status: 200, debugReason: null }],
      debugReason: null,
    });
    mocks.fetchRestaurant.mockRejectedValue(
      new Error("restaurant search must not be used")
    );
  });

  afterEach(() => {
    clearPlaceRankQueryCacheForTests();
    vi.restoreAllMocks();
  });

  it("collects 소풍동물원 from the general place results at rank 2", async () => {
    const response = await POST(
      new Request("http://localhost/api/check-place-rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keyword: "평택 동물체험",
          targetName: "소풍동물원",
          placeCategory: "키즈카페,실내놀이터",
          x: "127.072",
          y: "37.117",
          skipVolume: true,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.fetchPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "평택 동물체험",
        targetName: "소풍동물원",
        x: "127.072",
        y: "37.117",
      })
    );
    expect(mocks.fetchRestaurant).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      ok: true,
      source: "pcmap-place-graphql",
      resultStatus: "FOUND",
      rank: "2",
      displayRank: "2위",
      canSaveRank: true,
      parsed: 2,
      checkedCount: 2,
    });
  });

  it("keeps food keywords on the restaurant results", async () => {
    const items = [placeItem("food-1", "한남식당", "한식")];
    mocks.fetchRestaurant.mockResolvedValue({
      ok: true,
      status: "FOUND",
      source: "getRestaurantsPcmap",
      operationName: "getRestaurantsPcmap",
      queryName: "placeList",
      requestedStarts: [1, 71, 141, 211],
      completedPages: 1,
      parsedCount: 1,
      total: 20,
      rank: 1,
      targetName: "한남식당",
      top10: [{ rank: 1, ...items[0] }],
      items,
      pages: [{ start: 1, status: 200, debugReason: null }],
      fallbackUsed: false,
      debugReason: null,
    });

    const response = await POST(
      new Request("http://localhost/api/check-place-rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keyword: "한남동 맛집",
          targetName: "한남식당",
          placeCategory: "한식",
          skipVolume: true,
        }),
      })
    );
    const body = await response.json();

    expect(mocks.fetchRestaurant).toHaveBeenCalledOnce();
    expect(mocks.fetchPlace).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      source: "pcmap-graphql",
      resultStatus: "FOUND",
      rank: "1",
      canSaveRank: true,
    });
  });
});
