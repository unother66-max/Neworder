import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
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
      updateMany: mocks.updateMany,
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

function updateRequest(optionPriceChecked = true) {
  return new Request("http://localhost/api/operations/neworder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "updateExistingPriceCandidate",
      candidateId: "candidate-1",
      itemId: "item-1",
      source: "NAVER",
      mallName: "테스트몰",
      title: "새 후보 상품 500g 2개",
      productUrl: "https://shopping.naver.com/product/1",
      image: "https://example.com/product.jpg",
      itemPrice: 12000,
      shippingFee: 3000,
      shippingUnitCount: 1,
      shippingStatus: "PAID",
      quantityPerPack: 2,
      volumePerUnit: 500,
      volumeUnit: "g",
      packageUnit: "개",
      optionMemo: "",
      optionPriceChecked,
    }),
  });
}

describe("NewOrder inline purchase candidate update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewOrderAccess.mockResolvedValue({
      userId: "operator-1",
      name: "운영자",
      email: "operator@example.com",
      role: "STORE_MANAGER",
    });
    mocks.findFirst.mockResolvedValue({ id: "candidate-1" });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.update.mockResolvedValue({ id: "candidate-1" });
    mocks.historyCreate.mockResolvedValue({ id: "history-1" });
    mocks.transaction.mockImplementation(async (operations: unknown[]) =>
      Promise.all(operations)
    );
  });

  it("updates the current candidate and preserves a price history row", async () => {
    const response = await POST(updateRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      ok: true,
      candidateId: "candidate-1",
      itemId: "item-1",
    });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "candidate-1",
        itemId: "item-1",
        isCurrentBest: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "candidate-1" },
        data: expect.objectContaining({
          title: "새 후보 상품 500g 2개",
          productUrl: "https://shopping.naver.com/product/1",
          itemPrice: 12000,
          shippingFee: 3000,
          optionMemo: null,
          optionPriceChecked: true,
          isCurrentBest: true,
          updatedBy: "operator-1",
        }),
      })
    );
    expect(mocks.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemId: "item-1",
          productName: "새 후보 상품 500g 2개",
          createdBy: "운영자",
        }),
      })
    );
  });

  it("rejects a candidate that is not the current item candidate", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await POST(updateRequest());
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toMatchObject({
      ok: false,
      message: "업데이트할 구매목록 상품을 찾을 수 없습니다.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an inline update until the option price is confirmed", async () => {
    const response = await POST(updateRequest(false));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      ok: false,
      reason: "OPTION_PRICE_CONFIRMATION_REQUIRED",
      message: "실제 옵션 가격 확인 후 체크해 주세요.",
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns a clear reason when the running Prisma Client is stale", async () => {
    mocks.update.mockRejectedValue(
      new Error("Unknown argument `optionMemo`. Available options are marked with ?.")
    );

    const response = await POST(updateRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toMatchObject({
      ok: false,
      reason: "PRISMA_CLIENT_STALE",
      message: expect.stringContaining("Prisma Client"),
    });
  });
});
