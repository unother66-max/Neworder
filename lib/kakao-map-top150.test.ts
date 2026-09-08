import { describe, expect, it, vi } from "vitest";

import {
  fetchKakaoMapTop150,
  KAKAO_MAP_MAX_PAGES,
  KAKAO_TOP150_LIMIT,
} from "./kakao-map-top150";

function makePlace(id: string, overrides: Record<string, unknown> = {}) {
  return {
    confirmid: id,
    name: `매장 ${id}`,
    new_address: `서울 주소 ${id}`,
    last_cate_name: "음식점",
    reviewCount: "12",
    rating_average: "4.2",
    img: "http://t1.kakaocdn.net/sample.jpg",
    ...overrides,
  };
}

describe("fetchKakaoMapTop150", () => {
  it("collects at most 150 places across ten pages in response order", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const page = Number(new URL(input).searchParams.get("page"));
      return Response.json({
        place_totalcount: 420,
        place: Array.from({ length: 15 }, (_, index) => makePlace(String((page - 1) * 15 + index + 1))),
      });
    });

    const result = await fetchKakaoMapTop150("한남동 맛집", { fetcher });

    expect(result.list).toHaveLength(KAKAO_TOP150_LIMIT);
    expect(result.list[0]).toMatchObject({ rank: 1, placeId: "1" });
    expect(result.list.at(-1)).toMatchObject({ rank: 150, placeId: "150" });
    expect(result.requestCount).toBe(KAKAO_MAP_MAX_PAGES);
    expect(result.partial).toBe(false);
  });

  it("keeps the first place, removes duplicate IDs, and stops when results are exhausted", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const page = Number(new URL(input).searchParams.get("page"));
      return Response.json({
        place_totalcount: 18,
        place:
          page === 1
            ? Array.from({ length: 15 }, (_, index) => makePlace(String(index + 1)))
            : [makePlace("15", { name: "중복 매장" }), makePlace("16"), makePlace("17")],
      });
    });

    const result = await fetchKakaoMapTop150("한남동 맛집", { fetcher });

    expect(result.list.map((place) => place.placeId)).toEqual([
      ...Array.from({ length: 15 }, (_, index) => String(index + 1)),
      "16",
      "17",
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.requestCount).toBe(2);
  });

  it("returns collected rows as a clearly marked partial result when a later page fails", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const page = Number(new URL(input).searchParams.get("page"));
      if (page === 2) return new Response("failed", { status: 503 });
      return Response.json({
        place_totalcount: 200,
        place: Array.from({ length: 15 }, (_, index) => makePlace(String(index + 1))),
      });
    });

    const result = await fetchKakaoMapTop150("한남동 맛집", { fetcher });

    expect(result.list).toHaveLength(15);
    expect(result.partial).toBe(true);
    expect(result.failedPage).toBe(2);
    expect(result.requestCount).toBe(2);
  });
});
