import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const envPath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");
if (existsSync(envPath)) config({ path: envPath });
if (existsSync(envLocalPath)) config({ path: envLocalPath, override: true });

const DEFAULT_SUPPLIERS = [
  { name: "제이케이푸드", website: null },
  { name: "오더히어로", website: null },
  { name: "쿠팡", website: "https://www.coupang.com" },
  { name: "네이버", website: "https://shopping.naver.com" },
];

function defaultMallName(source) {
  if (source === "NAVER") return "네이버";
  if (source === "COUPANG") return "쿠팡";
  if (source === "ORDERHERO") return "오더히어로";
  if (source === "BAEMIN_MART") return "배민상회";
  return "직접 추가";
}

const prisma = new PrismaClient();

try {
  const operator = await prisma.newOrderOperator.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!operator) {
    throw new Error(
      "활성 NewOrderOperator가 없습니다. operator seed를 먼저 실행하세요."
    );
  }

  await prisma.newOrderSupplier.createMany({
    data: DEFAULT_SUPPLIERS.map((supplier) => ({
      ...supplier,
      createdBy: operator.userId,
      updatedBy: operator.userId,
    })),
    skipDuplicates: true,
  });

  const candidates = await prisma.newOrderPriceCandidate.findMany({
    orderBy: [{ itemId: "asc" }, { checkedAt: "desc" }],
  });
  const actorIds = [
    ...new Set(candidates.map((candidate) => candidate.createdBy).filter(Boolean)),
  ];
  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const actorNames = new Map(
    actors.map((user) => [
      user.id,
      user.name?.trim() || user.email?.trim() || user.id,
    ])
  );

  for (const candidate of candidates) {
    const mallName =
      candidate.mallName.trim() || defaultMallName(candidate.source);
    const savedBy =
      candidate.savedBy === "system" || !candidate.savedBy.trim()
        ? actorNames.get(candidate.createdBy) ||
          candidate.createdBy ||
          "system"
        : candidate.savedBy;
    const shippingStatus =
      candidate.shippingStatus === "UNKNOWN" &&
      /무료\s*배송|배송비\s*무료/.test(candidate.shippingCondition ?? "")
        ? "FREE"
        : candidate.shippingStatus === "UNKNOWN" && candidate.shippingFee > 0
          ? "PAID"
          : candidate.shippingStatus;
    const productPrice = candidate.productPrice || candidate.itemPrice;
    const bundleQuantity =
      candidate.bundleQuantity || candidate.quantityPerPack || 1;
    const shippingUnitCount = candidate.shippingUnitCount || 1;
    const effectiveShippingFee =
      shippingStatus === "PAID" && candidate.shippingFee > 0
        ? shippingUnitCount > 1
          ? candidate.shippingFee *
            Math.ceil(bundleQuantity / shippingUnitCount)
          : candidate.shippingFee
        : 0;
    const totalPriceWithShipping = productPrice + effectiveShippingFee;

    await prisma.newOrderPriceCandidate.update({
      where: { id: candidate.id },
      data: {
        mallName,
        savedBy,
        productPrice,
        bundleQuantity,
        shippingUnitCount,
        shippingStatus,
        shippingNeedsConfirmation: shippingStatus === "UNKNOWN",
        effectiveShippingFee,
        totalPrice: totalPriceWithShipping,
        totalPriceWithShipping,
      },
    });

    await prisma.newOrderPriceHistory.upsert({
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
        productPrice,
        shippingFee: candidate.shippingFee,
        shippingUnitCount,
        shippingStatus,
        shippingNote: candidate.shippingNote,
        shippingCondition: candidate.shippingCondition,
        shippingNeedsConfirmation: shippingStatus === "UNKNOWN",
        effectiveShippingFee,
        totalPrice: totalPriceWithShipping,
        totalPriceWithShipping,
        quantity: candidate.quantityPerPack,
        bundleQuantity,
        unitAmount: candidate.volumePerUnit,
        unitType: candidate.volumeUnit,
        packageUnit: candidate.packageUnit,
        unitPrice: candidate.unitPrice,
        pricePer100: candidate.pricePer100,
        pricePerMeasure: candidate.pricePerMeasure,
        createdBy: savedBy,
        createdAt: candidate.checkedAt,
      },
      update: {
        productPrice,
        shippingFee: candidate.shippingFee,
        shippingUnitCount,
        shippingStatus,
        shippingNote: candidate.shippingNote,
        shippingCondition: candidate.shippingCondition,
        shippingNeedsConfirmation: shippingStatus === "UNKNOWN",
        effectiveShippingFee,
        totalPrice: totalPriceWithShipping,
        totalPriceWithShipping,
        quantity: candidate.quantityPerPack,
        bundleQuantity,
      },
    });
  }

  const itemIdsWithDeletedCandidates = new Set(
    candidates
      .filter((candidate) => candidate.deletedAt !== null)
      .map((candidate) => candidate.itemId)
  );
  const itemIdsWithCurrentCandidate = new Set(
    candidates
      .filter(
        (candidate) => candidate.deletedAt === null && candidate.isCurrentBest
      )
      .map((candidate) => candidate.itemId)
  );
  for (const candidate of candidates) {
    if (
      candidate.deletedAt !== null ||
      itemIdsWithDeletedCandidates.has(candidate.itemId) ||
      itemIdsWithCurrentCandidate.has(candidate.itemId)
    ) {
      continue;
    }
    await prisma.newOrderPriceCandidate.update({
      where: { id: candidate.id },
      data: { isCurrentBest: true, updatedBy: operator.userId },
    });
    itemIdsWithCurrentCandidate.add(candidate.itemId);
  }

  console.log(
    `[neworder backfill] suppliers ensured, ${candidates.length} candidates processed`
  );
} finally {
  await prisma.$disconnect();
}
