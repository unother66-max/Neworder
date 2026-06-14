import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  historyUpsert: vi.fn(),
  placeUpdate: vi.fn(),
  getSnapshot: vi.fn(),
  getVolume: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    place: {
      findUnique: mocks.findUnique,
      update: mocks.placeUpdate,
    },
    placeReviewHistory: {
      upsert: mocks.historyUpsert,
    },
  },
}));

vi.mock("@/lib/getNaverPlaceReviewSnapshot", () => ({
  getNaverPlaceReviewSnapshot: mocks.getSnapshot,
}));

vi.mock("@/lib/getPlaceNameSearchVolume", () => ({
  getPlaceNameSearchVolume: mocks.getVolume,
}));

import { POST } from "@/app/api/place-review-track/route";

const previous = {
  visitorReviewCount: 100,
  blogReviewCount: 20,
  totalReviewCount: 120,
  saveCount: "300",
  keywords: ["필라테스"],
};

describe("place-review-track POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.findUnique.mockResolvedValue({
      id: "place-1",
      name: "키코필라테스",
      placeUrl: "https://m.place.naver.com/restaurant/123/home",
      x: "127.1",
      y: "37.5",
      placeMobileVolume: 10,
      placePcVolume: 5,
      placeMonthlyVolume: 15,
      reviewHistory: [previous],
    });
    mocks.getVolume.mockResolvedValue({ ok: false, reason: "unavailable" });
    mocks.historyUpsert.mockResolvedValue({ id: "history-1" });
    mocks.placeUpdate.mockResolvedValue({});
  });

  it("keeps the latest values when every metric fails to parse", async () => {
    mocks.getSnapshot.mockResolvedValue({
      visitorReviewCount: null,
      blogReviewCount: null,
      saveCountText: null,
      keywordList: [],
    });

    const response = await POST(
      new Request("http://localhost/api/place-review-track", {
        method: "POST",
        body: JSON.stringify({ placeId: "place-1" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsed).toMatchObject({
      visitorReviewCount: 100,
      blogReviewCount: 20,
      totalReviewCount: 120,
      saveCount: "300",
      retainedFields: [
        "visitorReviewCount",
        "blogReviewCount",
        "saveCount",
      ],
    });
    expect(mocks.historyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          visitorReviewCount: 100,
          blogReviewCount: 20,
          saveCount: "300",
        }),
      })
    );
  });

  it("updates parsed fields and retains only missing fields", async () => {
    mocks.getSnapshot.mockResolvedValue({
      visitorReviewCount: 110,
      blogReviewCount: null,
      saveCountText: "320",
      keywordList: ["운동"],
    });

    const response = await POST(
      new Request("http://localhost/api/place-review-track", {
        method: "POST",
        body: JSON.stringify({ placeId: "place-1" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsed).toMatchObject({
      visitorReviewCount: 110,
      blogReviewCount: 20,
      totalReviewCount: 130,
      saveCount: "320",
      retainedFields: ["blogReviewCount"],
    });
  });

  it("returns 422 only when parsing and previous snapshot are unavailable", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "place-1",
      name: "키코필라테스",
      placeUrl: "https://m.place.naver.com/restaurant/123/home",
      x: null,
      y: null,
      reviewHistory: [],
    });
    mocks.getSnapshot.mockResolvedValue({
      visitorReviewCount: null,
      blogReviewCount: null,
      saveCountText: null,
      keywordList: [],
    });

    const response = await POST(
      new Request("http://localhost/api/place-review-track", {
        method: "POST",
        body: JSON.stringify({ placeId: "place-1" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.reason).toBe("REVIEW_SNAPSHOT_UNAVAILABLE");
    expect(mocks.historyUpsert).not.toHaveBeenCalled();
  });
});
