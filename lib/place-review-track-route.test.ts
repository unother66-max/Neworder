import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  historyUpsert: vi.fn(),
  placeUpdate: vi.fn(),
  getSnapshot: vi.fn(),
  getVolume: vi.fn(),
  createAdminAlert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    place: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
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

vi.mock("@/lib/admin-alert", () => ({
  createAdminAlert: mocks.createAdminAlert,
}));

import { POST } from "@/app/api/place-review-track/route";
import { GET as runTrackingCron } from "@/app/api/cron/place-review-tracking/route";

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
      category: "필라테스",
      placeUrl: "https://m.place.naver.com/restaurant/123/home",
      x: "127.1",
      y: "37.5",
      placeMobileVolume: 10,
      placePcVolume: 5,
      placeMonthlyVolume: 15,
      reviewHistory: [previous],
    });
    mocks.findMany.mockResolvedValue([
      {
        id: "place-1",
        name: "키코필라테스",
        category: "필라테스",
        placeUrl: "https://m.place.naver.com/restaurant/123/home",
        x: "127.1",
        y: "37.5",
        placeMobileVolume: 10,
        placePcVolume: 5,
        placeMonthlyVolume: 15,
        reviewHistory: [previous],
      },
    ]);
    mocks.getVolume.mockResolvedValue({ ok: false, reason: "unavailable" });
    mocks.historyUpsert.mockResolvedValue({ id: "history-1" });
    mocks.placeUpdate.mockResolvedValue({});
    mocks.createAdminAlert.mockResolvedValue({});
  });

  it("does not save or update the place when fresh metric collection fails", async () => {
    mocks.getSnapshot.mockResolvedValue({
      ok: false,
      reason: "NAVER_BLOCKED_OR_CAPTCHA",
      debugReason: "place:GRAPHQL_NCAPTCHA",
      hintType: "place",
      chosenType: "place",
      triedTypes: ["place"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "FORCE_BYPASS",
      visitorReviewCount: null,
      blogReviewCount: null,
      saveCountText: null,
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      reviewFeatureKeywords: null,
      reviewFeatureKeywordsStatus: "UNAVAILABLE",
      keywordList: [],
      keywordListStatus: "UNAVAILABLE",
    });

    const response = await POST(
      new Request("http://localhost/api/place-review-track", {
        method: "POST",
        body: JSON.stringify({ placeId: "place-1" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.reason).toBe("NAVER_BLOCKED_OR_CAPTCHA");
    expect(body.debugReason).toBe("place:GRAPHQL_NCAPTCHA");
    expect(body.chosenType).toBe("place");
    expect(body.triedTypes).toEqual(["place"]);
    expect(body.message).toContain("네이버 요청 차단 또는 캡차");
    expect(body.message).toContain("기존 스냅샷은 변경하지 않았습니다");
    expect(mocks.historyUpsert).not.toHaveBeenCalled();
    expect(mocks.placeUpdate).not.toHaveBeenCalled();
    expect(mocks.getVolume).not.toHaveBeenCalled();

    const cronResponse = await runTrackingCron(
      new Request("http://localhost/api/cron/place-review-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );
    const cronBody = await cronResponse.json();

    expect(cronResponse.status).toBe(200);
    expect(cronBody.results[0]).toMatchObject({
      saved: false,
      reason: "NAVER_BLOCKED_OR_CAPTCHA",
      debugReason: "place:GRAPHQL_NCAPTCHA",
      chosenType: "place",
      triedTypes: ["place"],
    });
    expect(mocks.getSnapshot).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ category: "필라테스", force: true })
    );
    expect(mocks.getSnapshot).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ category: "필라테스", force: false })
    );
    expect(mocks.historyUpsert).not.toHaveBeenCalled();
    expect(mocks.placeUpdate).not.toHaveBeenCalled();
    expect(mocks.getVolume).not.toHaveBeenCalled();
  });

  it("creates a fresh snapshot after a successful fetch", async () => {
    mocks.getSnapshot.mockResolvedValue({
      ok: true,
      reason: null,
      debugReason: null,
      hintType: "place",
      chosenType: "place",
      triedTypes: ["place"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "FORCE_BYPASS",
      visitorReviewCount: 110,
      blogReviewCount: 25,
      saveCountText: "320",
      registeredKeywords: [
        "서울역개인필라테스",
        "숙대입구그룹필라테스",
      ],
      registeredKeywordsStatus: "AVAILABLE",
      reviewFeatureKeywords: ["시설이 깨끗해요"],
      reviewFeatureKeywordsStatus: "AVAILABLE",
      keywordList: ["서울역개인필라테스", "숙대입구그룹필라테스"],
      keywordListStatus: "AVAILABLE",
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
      blogReviewCount: 25,
      totalReviewCount: 135,
      saveCount: "320",
      retainedFields: [],
      cacheStatus: "FORCE_BYPASS",
    });
    expect(mocks.historyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          visitorReviewCount: 110,
          blogReviewCount: 25,
          totalReviewCount: 135,
          saveCount: "320",
          keywords: ["서울역개인필라테스", "숙대입구그룹필라테스"],
        }),
      })
    );
    expect(mocks.getSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ category: "필라테스", force: true })
    );
  });

  it("updates the same-day row with the newest successful metrics", async () => {
    mocks.getSnapshot.mockResolvedValue({
      ok: true,
      reason: null,
      debugReason: null,
      hintType: "place",
      chosenType: "place",
      triedTypes: ["place"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "FORCE_BYPASS",
      visitorReviewCount: 125,
      blogReviewCount: 31,
      saveCountText: "410",
      registeredKeywords: [],
      registeredKeywordsStatus: "AVAILABLE",
      reviewFeatureKeywords: ["친절해요"],
      reviewFeatureKeywordsStatus: "AVAILABLE",
      keywordList: [],
      keywordListStatus: "AVAILABLE",
    });

    const response = await POST(
      new Request("http://localhost/api/place-review-track", {
        method: "POST",
        body: JSON.stringify({ placeId: "place-1" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parsed.totalReviewCount).toBe(156);
    expect(mocks.historyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          visitorReviewCount: 125,
          blogReviewCount: 31,
          totalReviewCount: 156,
          saveCount: "410",
          keywords: [],
        }),
      })
    );
  });

  it("keeps the previous registered keywords when collection is unavailable", async () => {
    mocks.getSnapshot.mockResolvedValue({
      ok: true,
      reason: null,
      debugReason: "place:REGISTERED_KEYWORDS_UNAVAILABLE",
      hintType: "place",
      chosenType: "place",
      triedTypes: ["place"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "FORCE_BYPASS",
      visitorReviewCount: 126,
      blogReviewCount: 32,
      saveCountText: "411",
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      reviewFeatureKeywords: ["친절해요"],
      reviewFeatureKeywordsStatus: "AVAILABLE",
      keywordList: null,
      keywordListStatus: "UNAVAILABLE",
    });

    const response = await POST(
      new Request("http://localhost/api/place-review-track", {
        method: "POST",
        body: JSON.stringify({ placeId: "place-1" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.historyUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ keywords: ["필라테스"] }),
        create: expect.objectContaining({ keywords: ["필라테스"] }),
      })
    );
  });
});
