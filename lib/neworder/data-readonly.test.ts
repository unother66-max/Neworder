import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  itemFindMany: vi.fn(),
  supplierFindMany: vi.fn(),
  supplierCreateMany: vi.fn(),
  orderFindMany: vi.fn(),
  purchaseFindMany: vi.fn(),
  checkFindMany: vi.fn(),
  candidateFindMany: vi.fn(),
  historyFindMany: vi.fn(),
  userFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    newOrderItem: { findMany: mocks.itemFindMany },
    newOrderSupplier: {
      findMany: mocks.supplierFindMany,
      createMany: mocks.supplierCreateMany,
    },
    newOrderOrder: { findMany: mocks.orderFindMany },
    newOrderPurchase: { findMany: mocks.purchaseFindMany },
    newOrderInventoryCheck: { findMany: mocks.checkFindMany },
    newOrderPriceCandidate: { findMany: mocks.candidateFindMany },
    newOrderPriceHistory: { findMany: mocks.historyFindMany },
    user: { findMany: mocks.userFindMany },
    $transaction: mocks.transaction,
  },
}));

import { getNewOrderSnapshot } from "@/lib/neworder/data";

describe("getNewOrderSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.itemFindMany.mockResolvedValue([]);
    mocks.supplierFindMany.mockResolvedValue([]);
    mocks.orderFindMany.mockResolvedValue([]);
    mocks.purchaseFindMany.mockResolvedValue([]);
    mocks.checkFindMany.mockResolvedValue([]);
    mocks.candidateFindMany.mockResolvedValue([]);
    mocks.historyFindMany.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([]);
  });

  it("loads the operations snapshot without writes or transactions", async () => {
    const snapshot = await getNewOrderSnapshot();

    expect(snapshot).toMatchObject({
      items: [],
      suppliers: [],
      orders: [],
      purchases: [],
      checks: [],
      priceCandidates: [],
      purchaseList: [],
      priceHistories: [],
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.supplierCreateMany).not.toHaveBeenCalled();
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.candidateFindMany).toHaveBeenCalledTimes(2);
  });
});
