import { prisma } from "@/lib/prisma";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";

function defaultMallName(source: string): string {
  if (source === "NAVER") return "네이버";
  if (source === "COUPANG") return "쿠팡";
  if (source === "ORDERHERO") return "오더히어로";
  if (source === "BAEMIN_MART") return "배민상회";
  return "직접 추가";
}

function normalizePriceCandidate<
  T extends {
    source: string;
    mallName: string;
    savedBy: string;
    createdBy: string;
    itemPrice: number;
    productPrice: number;
    quantityPerPack: number;
    bundleQuantity: number;
    shippingUnitCount: number;
    shippingFee: number;
    shippingStatus: "FREE" | "PAID" | "UNKNOWN";
    effectiveShippingFee: number;
    totalPrice: number;
    totalPriceWithShipping: number;
  },
>(candidate: T): T {
  const mallName =
    candidate.mallName?.trim() || defaultMallName(candidate.source);
  const savedBy =
    candidate.savedBy?.trim() &&
    candidate.savedBy !== "system"
      ? candidate.savedBy
      : candidate.createdBy || "system";
  const productPrice = candidate.productPrice || candidate.itemPrice;
  const bundleQuantity =
    candidate.bundleQuantity || candidate.quantityPerPack || 1;
  const shippingUnitCount = candidate.shippingUnitCount || 1;
  const effectiveShippingFee =
    candidate.shippingStatus === "PAID"
      ? candidate.effectiveShippingFee || candidate.shippingFee
      : 0;
  const totalPriceWithShipping =
    candidate.totalPriceWithShipping ||
    candidate.totalPrice ||
    productPrice + effectiveShippingFee;

  return {
    ...candidate,
    mallName,
    savedBy,
    productPrice,
    bundleQuantity,
    shippingUnitCount,
    effectiveShippingFee,
    totalPriceWithShipping,
  };
}

export async function getNewOrderSnapshot() {
  const [
    items,
    suppliers,
    orders,
    purchases,
    checks,
    priceCandidates,
    purchaseList,
    priceHistories,
  ] =
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
        where: { deletedAt: null },
        orderBy: { checkedAt: "desc" },
        take: 100,
        include: { item: { select: { id: true, name: true } } },
      }),
      prisma.newOrderPriceCandidate.findMany({
        where: { isCurrentBest: true, deletedAt: null },
        orderBy: [{ item: { category: "asc" } }, { item: { name: "asc" } }],
        include: {
          item: { select: { id: true, name: true, category: true } },
        },
      }),
      prisma.newOrderPriceHistory.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

  const purchaseActorIds = [
    ...new Set(purchases.map((purchase) => purchase.createdBy)),
  ];
  const purchaseActors =
    purchaseActorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: purchaseActorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const purchaseActorNames = new Map(
    purchaseActors.map((user) => [
      user.id,
      user.name?.trim() || user.email?.trim() || user.id,
    ])
  );

  return {
    items: items.map((item) => ({
      ...item,
      naverSearchKeywords: normalizeStringArray(item.naverSearchKeywords),
      coupangSearchKeywords: normalizeStringArray(item.coupangSearchKeywords),
      requiredKeywords: normalizeStringArray(item.requiredKeywords),
      optionalKeywords: normalizeStringArray(item.optionalKeywords),
      preferredKeywords: normalizeStringArray(item.preferredKeywords),
      excludedKeywords: normalizeStringArray(item.excludedKeywords),
    })),
    suppliers,
    orders,
    purchases: purchases.map((purchase) => ({
      ...purchase,
      createdByName:
        purchaseActorNames.get(purchase.createdBy) || purchase.createdBy,
    })),
    checks: checks.map((check) => ({
      ...check,
      shortageItemCount: check.entries.length,
      entries: undefined,
    })),
    priceCandidates: priceCandidates.map(normalizePriceCandidate),
    purchaseList: purchaseList.map(normalizePriceCandidate),
    priceHistories,
  };
}
