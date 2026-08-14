import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    place: {
      findMany: mocks.findMany,
    },
  },
}));

import { GET } from "@/app/api/place-review-list/route";

describe("place-review list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("keeps an unavailable save count null without inventing a zero diff", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "place-1",
        name: "소풍동물원",
        category: "키즈카페,실내놀이터",
        address: "경기 평택시",
        jibunAddress: null,
        imageUrl: null,
        placeUrl: "https://m.place.naver.com/restaurant/36192987/home",
        x: "127.0591796",
        y: "37.1088908",
        reviewAutoTracking: true,
        reviewPinned: false,
        placeMonthlyVolume: 0,
        placeMobileVolume: 0,
        placePcVolume: 0,
        keywords: [],
        reviewHistory: [
          {
            id: "history-current",
            totalReviewCount: 982,
            visitorReviewCount: 708,
            blogReviewCount: 274,
            saveCount: null,
            keywords: [],
            createdAt: new Date("2026-08-12T03:00:00.000Z"),
            updatedAt: new Date("2026-08-12T03:00:00.000Z"),
          },
          {
            id: "history-previous",
            totalReviewCount: 970,
            visitorReviewCount: 700,
            blogReviewCount: 270,
            saveCount: "120",
            keywords: [],
            createdAt: new Date("2026-08-11T03:00:00.000Z"),
            updatedAt: new Date("2026-08-11T03:00:00.000Z"),
          },
        ],
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.places[0].reviewHistory[0]).toMatchObject({
      totalReviewDiff: 12,
      visitorReviewDiff: 8,
      blogReviewDiff: 4,
      saveCount: null,
      saveCountDiff: null,
    });
  });
});

