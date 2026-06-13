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
  shippingFee = 0,
  shippingFeeMode?:
    | "ORDER_ONCE"
    | "PER_ITEM"
    | "PER_N_ITEMS",
  shippingUnitCount?: number
) {
  return new Request("http://localhost/api/operations/neworder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updatePriceCandidateShipping",
      candidateId: "candidate-1",
      shippingMode,
      shippingFee,
      shippingFeeMode,
      shippingUnitCount,
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

  it("stores an order-wide shipping fee once", async () => {
    const response = await POST(
      shippingRequest("ENTERED", 3000, "ORDER_ONCE")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      candidateId: "candidate-1",
      shippingStatus: "PAID",
      shippingFee: 3000,
      shippingFeeMode: "ORDER_ONCE",
      shippingUnitCount: 1,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "candidate-1" },
        data: expect.objectContaining({
          shippingFee: 3000,
          shippingUnitCount: 1,
          shippingFeeMode: "ORDER_ONCE",
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
          shippingUnitCount: 1,
          shippingFeeMode: "ORDER_ONCE",
          effectiveShippingFee: 3000,
          note: "구매목록에서 배송비 설정을 수정했습니다.",
        }),
      })
    );
  });

  it("multiplies a per-item shipping fee by the bundle quantity", async () => {
    const response = await POST(
      shippingRequest("ENTERED", 3500, "PER_ITEM")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      shippingFeeMode: "PER_ITEM",
      shippingUnitCount: 1,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 3500,
          shippingFeeMode: "PER_ITEM",
          effectiveShippingFee: 3500000,
          totalPriceWithShipping: 3535970,
        }),
      })
    );
  });

  it("applies an n-item shipping fee by rounded-up groups", async () => {
    mocks.findFirst.mockResolvedValue({
      ...(await mocks.findFirst()),
      title: "테스트 상품 10개",
      quantityPerPack: 10,
      bundleQuantity: 10,
    });

    const response = await POST(
      shippingRequest("ENTERED", 3500, "PER_N_ITEMS", 3)
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      shippingFeeMode: "PER_N_ITEMS",
      shippingUnitCount: 3,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 3500,
          shippingUnitCount: 3,
          shippingFeeMode: "PER_N_ITEMS",
          effectiveShippingFee: 14000,
          totalPriceWithShipping: 49970,
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
      shippingFeeMode: "INCLUDED",
      shippingUnitCount: 1,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 0,
          shippingFeeMode: "INCLUDED",
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
      shippingFeeMode: "UNKNOWN",
      shippingUnitCount: 1,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingFee: 0,
          shippingFeeMode: "UNKNOWN",
          shippingStatus: "UNKNOWN",
          shippingNeedsConfirmation: true,
          effectiveShippingFee: 0,
        }),
      })
    );
  });

  it("keeps the shipping update when history logging fails", async () => {
    mocks.historyCreate.mockRejectedValueOnce(
      new Error("price history unavailable")
    );

    const response = await POST(shippingRequest("INCLUDED"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      shippingStatus: "FREE",
      shippingFeeMode: "INCLUDED",
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("returns the actual schema reason when the candidate update fails", async () => {
    mocks.update.mockRejectedValueOnce(
      new Error("Unknown argument `shippingFeeMode`.")
    );

    const response = await POST(shippingRequest("INCLUDED"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      ok: false,
      reason: "PRISMA_CLIENT_STALE",
      message: expect.stringContaining("Prisma Client"),
    });
    expect(mocks.historyCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing n-item shipping unit", async () => {
    const response = await POST(
      shippingRequest("ENTERED", 3500, "PER_N_ITEMS", 0)
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      ok: false,
      message: "몇 개당 배송비가 붙는지 입력해 주세요.",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
