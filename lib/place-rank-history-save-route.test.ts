import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findFirst: vi.fn(),
  rankHistoryCreate: vi.fn(),
  keywordUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    placeKeyword: {
      findFirst: mocks.findFirst,
      update: mocks.keywordUpdate,
    },
    rankHistory: {
      create: mocks.rankHistoryCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/place-rank-history-save/route";

describe("place rank history save route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findFirst.mockResolvedValue({
      id: "keyword-1",
      placeId: "place-1",
      keyword: "한남동 맛집",
      isTracking: true,
    });
    mocks.rankHistoryCreate.mockResolvedValue({ id: "history-1" });
    mocks.keywordUpdate.mockResolvedValue({ id: "keyword-1" });
    mocks.transaction.mockImplementation(async (operations) =>
      Promise.all(operations)
    );
  });

  it("atomically records manual success and advances the cron cursor", async () => {
    const response = await POST(
      new Request("http://localhost/api/place-rank-history-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeKeywordId: "keyword-1", rank: 15 }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "keyword-1",
        place: { userId: "user-1", type: "rank" },
      },
    });
    expect(mocks.rankHistoryCreate).toHaveBeenCalledWith({
      data: {
        placeId: "place-1",
        keyword: "한남동 맛집",
        rank: 15,
        source: "manual",
        resultStatus: "FOUND",
        rankLabel: "15위",
      },
    });
    const updateCall = mocks.keywordUpdate.mock.calls[0]![0];
    expect(updateCall).toMatchObject({
      where: { id: "keyword-1" },
      data: {
        lastAttemptAt: expect.any(Date),
        lastSuccessAt: expect.any(Date),
        lastFailureCode: null,
      },
    });
    expect(updateCall.data.lastAttemptAt).toBe(updateCall.data.lastSuccessAt);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/place-rank-history-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeKeywordId: "keyword-1", rank: 15 }),
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a keyword that is not owned by the signed-in user", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/place-rank-history-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeKeywordId: "other-user-keyword", rank: 15 }),
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])("rejects an invalid rank value (%s)", async (rank) => {
    const response = await POST(
      new Request("http://localhost/api/place-rank-history-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeKeywordId: "keyword-1", rank }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
