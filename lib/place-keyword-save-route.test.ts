import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  placeFindFirst: vi.fn(),
  count: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  getKeywordSearchVolume: vi.fn(),
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
      findFirst: mocks.placeFindFirst,
    },
    placeKeyword: {
      count: mocks.count,
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("@/lib/getKeywordSearchVolume", () => ({
  getKeywordSearchVolume: mocks.getKeywordSearchVolume,
}));

import { POST } from "@/app/api/place-keyword-save/route";

describe("place keyword save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.placeFindFirst.mockResolvedValue({ id: "place-1" });
    mocks.count.mockResolvedValue(1);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ id: "tracked-sibling" });
    mocks.upsert.mockResolvedValue({ id: "new-keyword" });
  });

  it("inherits tracking when a new keyword is added to a tracked store", async () => {
    const response = await POST(
      new Request("http://localhost/api/place-keyword-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: "place-1",
          keyword: "새 키워드",
          mobileVolume: 100,
          pcVolume: 20,
          totalVolume: 120,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.placeFindFirst).toHaveBeenCalledWith({
      where: { id: "place-1", userId: "user-1", type: "rank" },
      select: { id: true },
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          placeId: "place-1",
          keyword: "새 키워드",
          isTracking: true,
        }),
      })
    );
    expect(mocks.getKeywordSearchVolume).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/place-keyword-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: "place-1", keyword: "새 키워드" }),
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.placeFindFirst).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a store that is not owned by the signed-in user", async () => {
    mocks.placeFindFirst.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/place-keyword-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: "other-place", keyword: "새 키워드" }),
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
