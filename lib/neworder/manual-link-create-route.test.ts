import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNewOrderAccess: vi.fn(),
  itemFindMany: vi.fn(),
  candidateCreate: vi.fn(),
  historyCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/neworder/auth", () => ({
  getNewOrderAccess: mocks.getNewOrderAccess,
}));

vi.mock("@/lib/neworder/data", () => ({
  getNewOrderSnapshot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    newOrderItem: {
      findMany: mocks.itemFindMany,
    },
    newOrderPriceCandidate: {
      create: mocks.candidateCreate,
    },
    newOrderPriceHistory: {
      create: mocks.historyCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/operations/neworder/route";

function request() {
  return new Request("http://localhost/api/operations/neworder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "savePriceCandidate",
      manualLinkCreate: true,
      itemId: "selected-existing-item",
      title: "13인치 피자깔지",
      productUrl: "https://smartstore.naver.com/example/products/1",
      source: "NAVER",
      mallName: "네이버",
      itemPrice: 35970,
      shippingFee: 0,
      shippingUnitCount: 1,
      shippingFeeMode: "UNKNOWN",
      shippingStatus: "UNKNOWN",
      quantityPerPack: 1,
      packageUnit: "개",
      optionPriceChecked: false,
    }),
  });
}

describe("NewOrder manual link create flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNewOrderAccess.mockResolvedValue({
      userId: "operator-1",
      name: "운영자",
      email: "operator@example.com",
    });
    mocks.itemFindMany.mockResolvedValue([{ name: "13인치 피자깔지" }]);
    mocks.candidateCreate.mockResolvedValue({
      id: "new-candidate",
      itemId: "new-manual-item",
    });
    mocks.historyCreate.mockResolvedValue({ id: "new-history" });
  });

  it("ignores a selected item and creates a separate purchase-list item", async () => {
    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, itemId: "new-manual-item" });
    expect(mocks.candidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "13인치 피자깔지",
          shippingFeeMode: "UNKNOWN",
          optionPriceChecked: false,
          item: {
            create: expect.objectContaining({
              name: "13인치 피자깔지 (직접 추가 2)",
              category: "기타",
              orderUnit: "개",
            }),
          },
        }),
      })
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemId: "new-manual-item" }),
      })
    );
  });

  it("keeps the created purchase-list item when history logging fails", async () => {
    mocks.historyCreate.mockRejectedValueOnce(
      new Error("price history unavailable")
    );

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, itemId: "new-manual-item" });
  });

  it("returns a specific JSON reason when manual creation fails", async () => {
    mocks.candidateCreate.mockRejectedValueOnce(
      new Error("manual candidate create failed")
    );

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      ok: false,
      error: "직접 찾은 상품 저장에 실패했습니다.",
      message: "직접 찾은 상품 저장에 실패했습니다.",
      reason: "MANUAL_PURCHASE_CREATE_FAILED",
    });
  });
});
