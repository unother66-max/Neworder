import { prisma } from "@/lib/prisma";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";

const DEFAULT_SUPPLIERS = [
  { name: "제이케이푸드", website: null },
  { name: "오더히어로", website: null },
  { name: "쿠팡", website: "https://www.coupang.com" },
  { name: "네이버", website: "https://shopping.naver.com" },
] as const;

function defaultMallName(source: string): string {
  if (source === "NAVER") return "네이버";
  if (source === "COUPANG") return "쿠팡";
  if (source === "ORDERHERO") return "오더히어로";
  return "직접 추가";
}

async function backfillLegacyPriceCandidates() {
  const candidates = await prisma.newOrderPriceCandidate.findMany({
    orderBy: [{ itemId: "asc" }, { checkedAt: "desc" }],
  });
  if (candidates.length === 0) return;

  const actorIds = [
    ...new Set(
      candidates
        .map((candidate) => candidate.createdBy)
        .filter((value) => Boolean(value))
    ),
  ];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  const actorNames = new Map(
    actors.map((user) => [
      user.id,
      user.name?.trim() || user.email?.trim() || user.id,
    ])
  );

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidates) {
      const mallName =
        candidate.mallName.trim() || defaultMallName(candidate.source);
      const savedBy =
        candidate.savedBy === "system" || !candidate.savedBy.trim()
          ? actorNames.get(candidate.createdBy) ||
            candidate.createdBy ||
            "system"
          : candidate.savedBy;

      if (
        mallName !== candidate.mallName ||
        savedBy !== candidate.savedBy
      ) {
        await tx.newOrderPriceCandidate.update({
          where: { id: candidate.id },
          data: { mallName, savedBy },
        });
      }

      await tx.newOrderPriceHistory.upsert({
        where: { id: `history_${candidate.id}` },
        create: {
          id: `history_${candidate.id}`,
          itemId: candidate.itemId,
          source: candidate.source,
          mallName,
          productName: candidate.title,
          productUrl: candidate.productUrl,
          imageUrl: candidate.imageUrl,
          itemPrice: candidate.itemPrice,
          shippingFee: candidate.shippingFee,
          totalPrice: candidate.totalPrice,
          quantity: candidate.quantityPerPack,
          unitAmount: candidate.volumePerUnit,
          unitType: candidate.volumeUnit,
          packageUnit: candidate.packageUnit,
          unitPrice: candidate.unitPrice,
          pricePer100: candidate.pricePer100,
          pricePerMeasure: candidate.pricePerMeasure,
          createdBy: savedBy,
          createdAt: candidate.checkedAt,
        },
        update: {},
      });
    }

    const currentItemIds = new Set(
      candidates
        .filter((candidate) => candidate.isCurrentBest)
        .map((candidate) => candidate.itemId)
    );
    const latestByItem = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      if (!latestByItem.has(candidate.itemId)) {
        latestByItem.set(candidate.itemId, candidate);
      }
    }
    for (const [itemId, candidate] of latestByItem) {
      if (currentItemIds.has(itemId)) continue;
      await tx.newOrderPriceCandidate.update({
        where: { id: candidate.id },
        data: { isCurrentBest: true },
      });
    }
  });
}

export async function ensureNewOrderDefaults(actorId: string) {
  await prisma.newOrderSupplier.createMany({
    data: DEFAULT_SUPPLIERS.map((supplier) => ({
      ...supplier,
      createdBy: actorId,
      updatedBy: actorId,
    })),
    skipDuplicates: true,
  });
  await backfillLegacyPriceCandidates();
}

export async function getNewOrderSnapshot(actorId: string) {
  await ensureNewOrderDefaults(actorId);

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
        orderBy: { checkedAt: "desc" },
        take: 100,
        include: { item: { select: { id: true, name: true } } },
      }),
      prisma.newOrderPriceCandidate.findMany({
        where: { isCurrentBest: true },
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

  const purchaseActorIds = [...new Set(purchases.map((purchase) => purchase.createdBy))];
  const purchaseActors = await prisma.user.findMany({
    where: { id: { in: purchaseActorIds } },
    select: { id: true, name: true, email: true },
  });
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
    priceCandidates,
    purchaseList,
    priceHistories,
  };
}
