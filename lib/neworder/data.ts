import { prisma } from "@/lib/prisma";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";

const DEFAULT_SUPPLIERS = [
  { name: "제이케이푸드", website: null },
  { name: "오더히어로", website: null },
  { name: "쿠팡", website: "https://www.coupang.com" },
  { name: "네이버", website: "https://shopping.naver.com" },
] as const;

export async function ensureNewOrderDefaults(actorId: string) {
  await prisma.newOrderSupplier.createMany({
    data: DEFAULT_SUPPLIERS.map((supplier) => ({
      ...supplier,
      createdBy: actorId,
      updatedBy: actorId,
    })),
    skipDuplicates: true,
  });
}

export async function getNewOrderSnapshot(actorId: string) {
  await ensureNewOrderDefaults(actorId);

  const [items, suppliers, orders, purchases, checks, priceCandidates] =
    await Promise.all([
      prisma.newOrderItem.findMany({
        orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
        include: {
          defaultSupplier: { select: { id: true, name: true } },
          purchases: {
            orderBy: { purchasedAt: "desc" },
            take: 1,
            select: {
              purchasedAt: true,
              totalPrice: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      }),
      prisma.newOrderSupplier.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      prisma.newOrderOrder.findMany({
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        include: {
          item: {
            select: {
              id: true,
              name: true,
              category: true,
              orderUnit: true,
              orderUnitQuantity: true,
            },
          },
        },
      }),
      prisma.newOrderPurchase.findMany({
        orderBy: { purchasedAt: "desc" },
        take: 200,
        include: {
          item: { select: { id: true, name: true, category: true } },
          supplier: { select: { id: true, name: true } },
        },
      }),
      prisma.newOrderInventoryCheck.findMany({
        orderBy: { completedAt: "desc" },
        take: 20,
        include: {
          entries: {
            where: { shortageQty: { gt: 0 } },
            select: { shortageQty: true },
          },
        },
      }),
      prisma.newOrderPriceCandidate.findMany({
        orderBy: { checkedAt: "desc" },
        take: 100,
        include: { item: { select: { id: true, name: true } } },
      }),
    ]);

  return {
    items: items.map((item) => ({
      ...item,
      naverSearchKeywords: normalizeStringArray(item.naverSearchKeywords),
      coupangSearchKeywords: normalizeStringArray(item.coupangSearchKeywords),
      excludedKeywords: normalizeStringArray(item.excludedKeywords),
    })),
    suppliers,
    orders,
    purchases,
    checks: checks.map((check) => ({
      ...check,
      shortageItemCount: check.entries.length,
      entries: undefined,
    })),
    priceCandidates,
  };
}
