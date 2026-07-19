import { describe, expect, it } from "vitest";

import {
  buildPcmapPlaceListRequestBatch,
  buildPcmapPlaceListRequestPayload,
} from "./pcmap-place-list-request";

describe("pcmap placeList request payload", () => {
  it("keeps the original regional keyword for 한남동 맛집", () => {
    const payload = buildPcmapPlaceListRequestPayload({
      businessType: "restaurant",
      keyword: "한남동 맛집",
      x: "127.0012",
      y: "37.5347",
      start: 1,
      display: 70,
    });

    expect(payload.operationName).toBe("getRestaurantsPcmap");
    expect(payload.variables.input.query).toBe("한남동 맛집");
    expect(payload.variables.input.query).not.toBe("맛집");
    expect(payload.query).toContain("query getRestaurantsPcmap");
    expect(payload.query).toContain("restaurants: placeList(input: $input)");
    expect(payload.query).toContain("microReview");
    expect(payload.query).toContain("newOpening");
  });

  it("always supplies every required PlaceListInput field", () => {
    const [payload] = buildPcmapPlaceListRequestBatch({
      businessType: "place",
      keyword: "서울역 필라테스",
      x: "126.9707",
      y: "37.5547",
      start: 71,
      display: 30,
    });

    expect(payload).toBeDefined();
    expect(payload!.operationName).toBe("getPlacesList");
    expect(payload!.variables.input).toEqual({
      businessType: "place",
      deviceType: "pcmap",
      query: "서울역 필라테스",
      x: "126.9707",
      y: "37.5547",
      start: 71,
      display: 30,
      isPcmap: true,
    });
    expect(Object.values(payload!.variables.input)).not.toContain(undefined);
    expect(Object.values(payload!.variables.input)).not.toContain(null);
    expect(payload!.query).toContain("query getPlacesList");
    expect(payload!.query).toContain("places: placeList(input: $input)");
    expect(payload!.query).not.toContain("microReview");
    expect(payload!.query).toContain("newOpening");
  });

  it("uses safe defaults for invalid coordinates, start, and display", () => {
    const payload = buildPcmapPlaceListRequestPayload({
      businessType: "place",
      keyword: "한남동 맛집",
      x: "not-a-coordinate",
      y: 999,
      start: Number.NaN,
      display: Number.POSITIVE_INFINITY,
    });

    expect(payload.variables.input).toMatchObject({
      x: "127.0005",
      y: "37.53455",
      start: 1,
      display: 70,
    });
  });

  it("rejects a missing keyword instead of emitting an undefined query", () => {
    expect(() =>
      buildPcmapPlaceListRequestPayload({
        businessType: "place",
        keyword: undefined,
      })
    ).toThrow("pcmap placeList query가 필요합니다.");
  });
});
