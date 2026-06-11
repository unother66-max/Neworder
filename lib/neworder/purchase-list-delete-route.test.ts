import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  historyUpdate: vi.fn(),
}));

vi.mock("@/lib/neworder/auth", () => ({
  getNewOrderAccess: mocks.getNewOrderAccess,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    newOrderPriceCandidate: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
    newOrderPriceHistory: {
      update: mocks.historyUpdate,
    },
  },
}));

vi.mock("@/lib/neworder/data", () => ({
  getNewOrderSnapshot: vi.fn(),
}));

import { POST } from "@/app/api/operations/neworder/route";

function deleteRequest(candidateId = "candidate-1") {
  return new Request("http://localhost/api/operations/neworder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "deletePriceCandidate",
      candidateId,
    }),
  });
}

describe("NewOrder purchase list candidate deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewOrderAccess.mockResolvedValue({
      userId: "operator-1",
      name: "운영자",
      email: "operator@example.com",
      role: "STORE_MANAGER",
    });
    mocks.findUnique.mockResolvedValue({
      id: "candidate-1",
      deletedAt: null,
    });
    mocks.update.mockResolvedValue({ id: "candidate-1" });
  });

  it("denies users without an active NewOrderOperator record", async () => {
    mocks.getNewOrderAccess.mockResolvedValue(null);

    const response = await POST(deleteRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toMatchObject({
      ok: false,
      message: expect.any(String),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("soft deletes only the current purchase candidate", async () => {
    const response = await POST(deleteRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      message: "구매목록에서 삭제했습니다.",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "candidate-1" },
      data: {
        isCurrentBest: false,
        deletedAt: expect.any(Date),
        deletedBy: "operator@example.com",
        updatedBy: "operator-1",
      },
    });
    expect(mocks.historyUpdate).not.toHaveBeenCalled();
  });

  it("does not delete a missing or already deleted candidate", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await POST(deleteRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toMatchObject({
      ok: false,
      message: "구매 후보를 찾을 수 없습니다.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
