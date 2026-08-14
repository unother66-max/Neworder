import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findFirst: vi.fn(),
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
      findFirst: mocks.findFirst,
    },
    placeReviewHistory: {
      findMany: mocks.findMany,
    },
  },
}));

import { GET } from "@/app/api/place-review-detail/route";

function historyRow(
  trackedDate: string,
  totalReviewCount: number,
  visitorReviewCount: number,
  blogReviewCount: number,
  saveCount: string | null
) {
  return {
    id: `history-${trackedDate}`,
    trackedDate,
    totalReviewCount,
    visitorReviewCount,
    blogReviewCount,
    saveCount,
    keywords: [],
    createdAt: new Date(`${trackedDate}T03:00:00.000Z`),
    updatedAt: new Date(`${trackedDate}T04:00:00.000Z`),
  };
}

describe("place-review detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T03:00:00.000Z"));
    mocks.getServerSession.mockResolvedValue({
      user: { id: "user-1" },
    });
  });

  it("requires a signed-in user", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/place-review-detail?id=place-1")
    );

    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns true previous-calendar-day changes and exposes tracked dates", async () => {
    const rows = [
      historyRow("2026-07-28", 130, 90, 40, "12,000"),
      historyRow("2026-07-27", 120, 84, 36, "11,950"),
      historyRow("2026-07-25", 100, 70, 30, "11,000"),
    ];
    mocks.findFirst.mockResolvedValue({
      id: "place-1",
      name: "테스트 매장",
      address: "서울",
      jibunAddress: null,
      imageUrl: null,
      placeUrl: null,
      reviewAutoTracking: true,
      reviewPinned: false,
      placeMonthlyVolume: 100,
      placeMobileVolume: 80,
      placePcVolume: 20,
      keywords: [],
      reviewHistory: rows,
    });
    mocks.findMany.mockResolvedValue(rows);

    const response = await GET(
      new Request("http://localhost/api/place-review-detail?id=place-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "place-1", userId: "user-1", type: "review" },
        include: expect.objectContaining({
          reviewHistory: {
            orderBy: { trackedDate: "desc" },
            skip: 0,
            take: 31,
          },
        }),
      })
    );
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        placeId: "place-1",
        trackedDate: { gte: "2025-07-28" },
      },
      orderBy: { trackedDate: "desc" },
      take: 366,
    });
    expect(body.place.reviewHistory).toEqual([
      expect.objectContaining({
        trackedDate: "2026-07-28",
        comparedTrackedDate: "2026-07-27",
        totalReviewDiff: 10,
        visitorReviewDiff: 6,
        blogReviewDiff: 4,
        saveCountDiff: 50,
      }),
      expect.objectContaining({
        trackedDate: "2026-07-27",
        comparedTrackedDate: null,
        totalReviewDiff: null,
      }),
      expect.objectContaining({
        trackedDate: "2026-07-25",
        comparedTrackedDate: null,
        totalReviewDiff: null,
      }),
    ]);
    expect(body.place.chartReviewHistory).toEqual(body.place.reviewHistory);
    expect(body.place.reviewHistoryHasMore).toBe(false);
    expect(body.place.reviewHistoryPageSize).toBe(30);
    expect(body.place.chartDays).toBe(365);
  });

  it("returns review history in 30-row pages with a has-more flag", async () => {
    const rows = Array.from({ length: 31 }, (_, index) =>
      historyRow(
        `2026-06-${String(30 - index).padStart(2, "0")}`,
        200 - index,
        120 - index,
        80,
        "1,000"
      )
    );
    mocks.findFirst.mockResolvedValue({
      id: "place-1",
      name: "테스트 매장",
      address: "서울",
      jibunAddress: null,
      imageUrl: null,
      placeUrl: null,
      reviewAutoTracking: true,
      reviewPinned: false,
      placeMonthlyVolume: 100,
      placeMobileVolume: 80,
      placePcVolume: 20,
      keywords: [],
      reviewHistory: rows,
    });
    mocks.findMany.mockResolvedValue([]);

    const response = await GET(
      new Request(
        "http://localhost/api/place-review-detail?id=place-1&historyOffset=30"
      )
    );
    const body = await response.json();

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          reviewHistory: {
            orderBy: { trackedDate: "desc" },
            skip: 30,
            take: 31,
          },
        }),
      })
    );
    expect(body.place.reviewHistory).toHaveLength(30);
    expect(body.place.reviewHistoryHasMore).toBe(true);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
