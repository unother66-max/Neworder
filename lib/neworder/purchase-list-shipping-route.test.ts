import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  historyCreate: vi.fn(),
  transaction: vi.fn(),
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
    newOrderPriceHistory: {
      create: mocks.historyCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/neworder/data", () => ({
  getNewOrderSnapshot: vi.fn(),
}));

import { POST } from "@/app/api/operations/neworder/route";

function shippingRequest(
  shippingMode: "INCLUDED" | "ENTERED" | "UNKNOWN",
  shippingFee = 0
) {
  return new Request("http://localhost/api/operations/neworder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updatePriceCandidateShipping",
      candidateId: "candidate-1",
      shippingMode,
      shippingFee,
    }),
  });
}

describe("NewOrder purchase list shipping update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewOrderAccess.mockResolvedValue({
      userId: "operator-1",
      name: "운영자",
      email: "operator@example.com",
      role: "STORE_MANAGER",
    });
    mocks.findFirst.mockResolvedValue({
      id: "candidate-1",
      itemId: "item-1",
      source: "NAVER",
      mallName: "테스트몰",
      title: "피자깔지 1000개",
      productUrl: "https://shopping.naver.com/product/1",
      imageUrl: null,
      itemPrice: 35970,
      quantityPerPack: 1000,
      bundleQuantity: 1000,
      volumePerUnit: null,
      volumeUnit: null,
      packageUnit: "개",
      optionMemo: null,
      optionPriceChecked: true,
    });
    mocks.update.mockResolvedValue({ id: "candidate-1" });
    mocks.historyCreate.mockResolvedValue({ id: "history-1" });
    mocks.transaction.mockImplementation(async (operations: unknown[]) =>
      Promise.all(operations)
    );
  });

  it("stores an entered total shipping fee once per bundle", async () => {
    const response = await POST(shippingRequest("ENTERED", 3000));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      candidateId: "candidate-1",
      shippingStatus: "PAID",
      shippingFee: 3000,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "candidate-1" },
        data: expect.objectContaining({
          shippingFee: 3000,
          shippingUnitCount: 1000,
          shippingStatus: "PAID",
          shippingNeedsConfirmation: false,
          effectiveShippingFee: 3000,
          totalPriceWithShipping: 38970,
          updatedBy: "operator-1",
        }),
      })
    );
    expect(mocks.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 3000,
          shippingUnitCount: 1000,
          effectiveShippingFee: 3000,
          note: "구매목록에서 배송비 설정을 수정했습니다.",
        }),
      })
    );
  });

  it("marks the listed product price as shipping included", async () => {
    const response = await POST(shippingRequest("INCLUDED"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      candidateId: "candidate-1",
      shippingStatus: "FREE",
      shippingFee: 0,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 0,
          shippingStatus: "FREE",
          shippingNeedsConfirmation: false,
          effectiveShippingFee: 0,
          totalPriceWithShipping: 35970,
        }),
      })
    );
  });

  it("returns the candidate to an unknown shipping state", async () => {
    const response = await POST(shippingRequest("UNKNOWN"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      candidateId: "candidate-1",
      shippingStatus: "UNKNOWN",
      shippingFee: 0,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 0,
          shippingStatus: "UNKNOWN",
          shippingNeedsConfirmation: true,
          effectiveShippingFee: 0,
        }),
      })
    );
  });

  it("rejects an entered shipping fee below one won", async () => {
    const response = await POST(shippingRequest("ENTERED", 0));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      ok: false,
      message: "배송비 설정을 확인해 주세요.",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
