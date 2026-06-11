import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  getNewOrderSnapshot: vi.fn(),
}));

vi.mock("@/lib/neworder/auth", () => ({
  getNewOrderAccess: mocks.getNewOrderAccess,
}));

vi.mock("@/lib/neworder/data", () => ({
  getNewOrderSnapshot: mocks.getNewOrderSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { GET } from "@/app/api/operations/neworder/route";

describe("NewOrder operations GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getNewOrderAccess.mockResolvedValue({
      userId: "operator-1",
      email: "operator@example.com",
      name: "운영자",
      role: "STORE_MANAGER",
    });
    mocks.getNewOrderSnapshot.mockResolvedValue({
      items: [],
      suppliers: [],
      orders: [],
      purchases: [],
      checks: [],
      priceCandidates: [],
      purchaseList: [],
      priceHistories: [],
    });
  });

  it("returns a read-only snapshot for an active operator", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({ ok: true, purchaseList: [] });
    expect(mocks.getNewOrderSnapshot).toHaveBeenCalledWith();
  });

  it("returns a fixed JSON reason for a closed transaction error", async () => {
    mocks.getNewOrderSnapshot.mockRejectedValue(
      new Error("Transaction API error: Transaction not found.")
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      ok: false,
      error: "운영관리 데이터를 불러오는 중 오류가 발생했습니다.",
      message: "운영관리 데이터를 불러오는 중 오류가 발생했습니다.",
      reason: "TRANSACTION_CLOSED",
    });
  });

  it("keeps the operator access check on the server", async () => {
    mocks.getNewOrderAccess.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.ok).toBe(false);
    expect(mocks.getNewOrderSnapshot).not.toHaveBeenCalled();
  });
});
