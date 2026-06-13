import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/neworder/auth", () => ({
  getNewOrderAccess: mocks.getNewOrderAccess,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    newOrderPriceCandidate: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

vi.mock("@/lib/neworder/data", () => ({
  getNewOrderSnapshot: vi.fn(),
}));

import { POST } from "@/app/api/operations/neworder/route";

function pinRequest(isPinned: boolean) {
  return new Request("http://localhost/api/operations/neworder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "togglePriceCandidatePin",
      candidateId: "candidate-1",
      isPinned,
    }),
  });
}

describe("NewOrder purchase list candidate pin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewOrderAccess.mockResolvedValue({
      userId: "operator-1",
      name: "운영자",
      email: "operator@example.com",
      role: "STORE_MANAGER",
    });
    mocks.findFirst.mockResolvedValue({ id: "candidate-1" });
    mocks.update.mockResolvedValue({ id: "candidate-1" });
  });

  it("pins an active current purchase candidate", async () => {
    const response = await POST(pinRequest(true));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      candidateId: "candidate-1",
      isPinned: true,
      pinnedAt: expect.any(String),
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "candidate-1",
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "candidate-1" },
      data: {
        isPinned: true,
        pinnedAt: expect.any(Date),
        updatedBy: "operator-1",
      },
    });
  });

  it("clears pinnedAt when unpinning", async () => {
    const response = await POST(pinRequest(false));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      candidateId: "candidate-1",
      isPinned: false,
      pinnedAt: null,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "candidate-1" },
      data: {
        isPinned: false,
        pinnedAt: null,
        updatedBy: "operator-1",
      },
    });
  });

  it("does not pin a missing or deleted purchase candidate", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await POST(pinRequest(true));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toMatchObject({
      ok: false,
      message: "구매 후보를 찾을 수 없습니다.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
