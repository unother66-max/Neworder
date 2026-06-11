import { NextResponse } from "next/server";

import { getNewOrderAccess } from "@/lib/neworder/auth";
import { getNewOrderSnapshot } from "@/lib/neworder/data";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";
import { calculatePriceMetrics } from "@/lib/neworder/price-analysis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message, message },
    { status }
  );
}

const OPERATOR_REQUIRED_ERROR =
  "활성 NewOrderOperator로 등록된 계정만 운영관리에 접근할 수 있습니다.";

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown, minimum = 0): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : null;
}

function validUrl(value: unknown): string | null {
  const candidate = text(value, 2000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const access = await getNewOrderAccess();
    if (!access) return error(OPERATOR_REQUIRED_ERROR, 403);

    const snapshot = await getNewOrderSnapshot(access.userId);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (cause) {
    console.error("[operations/neworder] GET", cause);
    return error("운영관리 데이터를 불러오는 중 오류가 발생했습니다.", 500);
  }
}

export async function POST(request: Request) {
  const access = await getNewOrderAccess();
  if (!access) return error(OPERATOR_REQUIRED_ERROR, 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error("요청 형식이 올바르지 않습니다.");
  }

  const action = text(body.action, 80);
  const actor = access.userId;
  let result: Record<string, unknown> = {};

  try {
    if (action === "saveItem") {
      const id = text(body.id, 100);
      const name = text(body.name, 120);
      const category = text(body.category, 80);
      const minimumStock = integer(body.minimumStock);
      const orderUnit = text(body.orderUnit, 80);
      const orderUnitQuantity = integer(body.orderUnitQuantity, 1);
      const defaultSupplierId = text(body.defaultSupplierId, 100) || null;
      if (!name || !category || minimumStock === null || !orderUnit || orderUnitQuantity === null) {
        return error("품목명, 카테고리, 최소재고, 발주 단위를 확인해 주세요.");
      }
      const data = {
        name,
        category,
        minimumStock,
        orderUnit,
        orderUnitQuantity,
        naverSearchKeyword: text(body.naverSearchKeyword, 200) || null,
        naverSearchKeywords: normalizeStringArray(
          body.naverSearchKeywords,
          /[,;\r\n]+/
        ).slice(0, 10),
        coupangSearchKeyword: text(body.coupangSearchKeyword, 200) || null,
        coupangSearchKeywords: normalizeStringArray(
          body.coupangSearchKeywords,
          /[,;\r\n]+/
        ).slice(0, 10),
        requiredKeywords: normalizeStringArray(
          body.requiredKeywords,
          /[,;\r\n]+/
        ).slice(0, 20),
        optionalKeywords: normalizeStringArray(
          body.optionalKeywords,
          /[,;\r\n]+/
        ).slice(0, 20),
        preferredKeywords: normalizeStringArray(
          body.preferredKeywords,
          /[,;\r\n]+/
        ).slice(0, 20),
        excludedKeywords: normalizeStringArray(
          body.excludedKeywords ?? body.excludeKeywords,
          /[,;\r\n]+/
        ),
        defaultSupplierId,
        updatedBy: actor,
      };
      let savedItemId = id;
      if (id) {
        await prisma.newOrderItem.update({ where: { id }, data });
      } else {
        const created = await prisma.newOrderItem.create({
          data: { ...data, createdBy: actor },
        });
        savedItemId = created.id;
      }
      result = { itemId: savedItemId };
    } else if (action === "deactivateItem") {
      const id = text(body.id, 100);
      if (!id) return error("품목 ID가 없습니다.");
      await prisma.newOrderItem.update({
        where: { id },
        data: { isActive: false, updatedBy: actor },
      });
    } else if (action === "setItemActive") {
      const id = text(body.id, 100);
      if (!id) return error("품목 ID가 없습니다.");
      await prisma.newOrderItem.update({
        where: { id },
        data: { isActive: body.isActive === true, updatedBy: actor },
      });
    } else if (action === "saveSupplier") {
      const id = text(body.id, 100);
      const name = text(body.name, 120);
      if (!name) return error("거래처명을 입력해 주세요.");
      const data = {
        name,
        contact: text(body.contact, 200) || null,
        website: validUrl(body.website),
        memo: text(body.memo, 1000) || null,
        updatedBy: actor,
      };
      if (id) {
        await prisma.newOrderSupplier.update({ where: { id }, data });
      } else {
        await prisma.newOrderSupplier.create({
          data: { ...data, createdBy: actor },
        });
      }
    } else if (action === "saveCheck") {
      const store = body.store === "YEONNAM" ? "YEONNAM" : "HANNAM";
      const rawEntries = Array.isArray(body.entries) ? body.entries : [];
      const itemIds = rawEntries
        .map((entry) => text((entry as Record<string, unknown>).itemId, 100))
        .filter(Boolean);
      const items = await prisma.newOrderItem.findMany({
        where: { id: { in: itemIds }, isActive: true },
        select: { id: true, minimumStock: true, orderUnitQuantity: true },
      });
      const quantities = new Map(
        rawEntries.map((entry) => {
          const row = entry as Record<string, unknown>;
          return [text(row.itemId, 100), integer(row.currentQty) ?? 0] as const;
        })
      );
      if (items.length === 0) return error("체크할 활성 품목이 없습니다.");

      await prisma.$transaction(async (tx) => {
        const check = await tx.newOrderInventoryCheck.create({
          data: {
            store,
            memo: text(body.memo, 2000) || null,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        for (const item of items) {
          const currentQty = quantities.get(item.id) ?? 0;
          const rawShortage = Math.max(item.minimumStock - currentQty, 0);
          const shortageQty =
            rawShortage === 0
              ? 0
              : Math.ceil(rawShortage / item.orderUnitQuantity) *
                item.orderUnitQuantity;
          await tx.newOrderInventoryEntry.create({
            data: {
              checkId: check.id,
              itemId: item.id,
              currentQty,
              shortageQty,
              createdBy: actor,
              updatedBy: actor,
            },
          });
          if (shortageQty > 0) {
            const existing = await tx.newOrderOrder.findFirst({
              where: {
                store,
                itemId: item.id,
                status: { in: ["REQUESTED", "REVIEWING", "ON_HOLD"] },
              },
              orderBy: { updatedAt: "desc" },
              select: { id: true },
            });
            if (existing) {
              await tx.newOrderOrder.update({
                where: { id: existing.id },
                data: {
                  requestedQty: shortageQty,
                  sourceCheckId: check.id,
                  status: "REQUESTED",
                  updatedBy: actor,
                },
              });
            } else {
              await tx.newOrderOrder.create({
                data: {
                  store,
                  itemId: item.id,
                  sourceCheckId: check.id,
                  requestedQty: shortageQty,
                  createdBy: actor,
                  updatedBy: actor,
                },
              });
            }
          }
        }
      });
    } else if (action === "updateOrder") {
      const id = text(body.id, 100);
      const requestedQty = integer(body.requestedQty, 1);
      const status =
        body.status === "REVIEWING" ||
        body.status === "PURCHASED" ||
        body.status === "ON_HOLD"
          ? body.status
          : "REQUESTED";
      if (!id || requestedQty === null) return error("발주 수량을 확인해 주세요.");
      await prisma.newOrderOrder.update({
        where: { id },
        data: {
          requestedQty,
          status,
          memo: text(body.memo, 1000) || null,
          updatedBy: actor,
        },
      });
    } else if (action === "savePurchase") {
      const itemId = text(body.itemId, 100);
      const quantity = integer(body.quantity, 1);
      const totalPrice = integer(body.totalPrice, 0);
      const purchasedAt = new Date(text(body.purchasedAt, 40));
      if (
        !itemId ||
        quantity === null ||
        totalPrice === null ||
        Number.isNaN(purchasedAt.getTime())
      ) {
        return error("구매일, 품목, 수량, 총액을 확인해 주세요.");
      }
      await prisma.newOrderPurchase.create({
        data: {
          purchasedAt,
          itemId,
          supplierId: text(body.supplierId, 100) || null,
          orderId: text(body.orderId, 100) || null,
          quantity,
          totalPrice,
          unitPrice: totalPrice / quantity,
          memo: text(body.memo, 1000) || null,
          createdBy: actor,
          updatedBy: actor,
        },
      });
    } else if (action === "savePriceCandidate") {
      let itemId = text(body.itemId, 100);
      const createItemFromSearch = body.createItemFromSearch === true;
      const searchQuery = text(body.searchQuery, 200);
      const title = text(body.title, 300);
      const productUrl = validUrl(body.productUrl);
      const imageUrl = validUrl(body.image ?? body.imageUrl);
      const mallName = text(body.mallName, 120) || "기타";
      const itemPrice = integer(body.itemPrice, 0);
      const shippingFee = integer(body.shippingFee, 0);
      const shippingUnitCount = integer(body.shippingUnitCount, 1);
      const shippingStatus =
        body.shippingStatus === "FREE" ||
        body.shippingStatus === "PAID" ||
        body.shippingStatus === "UNKNOWN"
          ? body.shippingStatus
          : shippingFee && shippingFee > 0
            ? "PAID"
            : "UNKNOWN";
      const shippingNote = text(body.shippingNote, 500) || null;
      const shippingCondition = text(body.shippingCondition, 500) || null;
      const shippingNeedsConfirmation = shippingStatus === "UNKNOWN";
      const quantityPerPack = integer(body.quantityPerPack, 1);
      const volumePerUnit =
        body.volumePerUnit == null || body.volumePerUnit === ""
          ? undefined
          : Number(body.volumePerUnit);
      const volumeUnit = text(body.volumeUnit, 20) || undefined;
      const packageUnit = text(body.packageUnit, 20) || undefined;
      const source =
        body.source === "NAVER" ||
        body.source === "COUPANG" ||
        body.source === "ORDERHERO" ||
        body.source === "ETC"
          ? body.source
          : "MANUAL";
      if (
        (!itemId && (!createItemFromSearch || !searchQuery)) ||
        !title ||
        !productUrl ||
        itemPrice === null ||
        shippingFee === null ||
        shippingUnitCount === null ||
        quantityPerPack === null
      ) {
        return error("가격 후보 정보를 확인해 주세요.");
      }
      const metrics = calculatePriceMetrics({
        title,
        itemPrice,
        shippingFee,
        shippingUnitCount,
        shippingStatus,
        shippingNeedsConfirmation,
        quantityPerPack,
        volumePerUnit:
          volumePerUnit != null && Number.isFinite(volumePerUnit)
            ? volumePerUnit
            : undefined,
        volumeUnit,
        packageUnit,
      });
      const savedBy = access.name || access.email || "운영자";
      await prisma.$transaction(async (tx) => {
        if (!itemId) {
          const existing = await tx.newOrderItem.findFirst({
            where: { name: searchQuery, category: "기타" },
            select: { id: true },
          });
          if (existing) {
            itemId = existing.id;
          } else {
            const createdItem = await tx.newOrderItem.create({
              data: {
                name: searchQuery,
                category: "기타",
                minimumStock: 0,
                orderUnit: "개",
                orderUnitQuantity: 1,
                naverSearchKeyword: searchQuery,
                naverSearchKeywords: [searchQuery],
                coupangSearchKeyword: searchQuery,
                coupangSearchKeywords: [searchQuery],
                requiredKeywords: [],
                optionalKeywords: [],
                preferredKeywords: [],
                excludedKeywords: [],
                createdBy: actor,
                updatedBy: actor,
              },
              select: { id: true },
            });
            itemId = createdItem.id;
          }
        }
        await tx.newOrderPriceCandidate.updateMany({
          where: { itemId, isCurrentBest: true, deletedAt: null },
          data: { isCurrentBest: false, updatedBy: actor },
        });
        await tx.newOrderPriceCandidate.create({
          data: {
            itemId,
            source,
            mallName,
            title,
            productUrl,
            imageUrl,
            itemPrice,
            productPrice: metrics.productPrice,
            shippingFee,
            shippingUnitCount: metrics.shippingUnitCount,
            shippingStatus,
            shippingNote,
            shippingCondition,
            shippingNeedsConfirmation,
            effectiveShippingFee: metrics.effectiveShippingFee,
            totalPrice: Math.round(metrics.totalPrice),
            totalPriceWithShipping: Math.round(metrics.totalPrice),
            quantityPerPack: metrics.unitCount,
            bundleQuantity: metrics.unitCount,
            unitPrice: metrics.unitPrice,
            volumePerUnit: metrics.volumePerUnit,
            volumeUnit: metrics.volumeUnit,
            packageUnit: metrics.packageUnit,
            pricePer100: metrics.pricePer100,
            pricePerMeasure: metrics.pricePerMeasure,
            savedBy,
            isCurrentBest: true,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await tx.newOrderPriceHistory.create({
          data: {
            itemId,
            source,
            mallName,
            productName: title,
            productUrl,
            imageUrl,
            itemPrice,
            productPrice: metrics.productPrice,
            shippingFee,
            shippingUnitCount: metrics.shippingUnitCount,
            shippingStatus,
            shippingNote,
            shippingCondition,
            shippingNeedsConfirmation,
            effectiveShippingFee: metrics.effectiveShippingFee,
            totalPrice: Math.round(metrics.totalPrice),
            totalPriceWithShipping: Math.round(metrics.totalPrice),
            quantity: metrics.unitCount,
            bundleQuantity: metrics.unitCount,
            unitAmount: metrics.volumePerUnit,
            unitType: metrics.volumeUnit,
            packageUnit: metrics.packageUnit,
            unitPrice: metrics.unitPrice,
            pricePer100: metrics.pricePer100,
            pricePerMeasure: metrics.pricePerMeasure,
            note: text(body.note, 1000) || null,
            createdBy: savedBy,
          },
        });
      });
      result = { itemId };
    } else if (action === "deletePriceCandidate") {
      const candidateId = text(body.candidateId, 100);
      if (!candidateId) {
        return error("삭제할 구매 후보를 확인해 주세요.");
      }
      const deletedBy = access.email || access.name || actor;

      const candidate = await prisma.newOrderPriceCandidate.findUnique({
        where: { id: candidateId },
        select: { id: true, deletedAt: true },
      });
      if (!candidate || candidate.deletedAt) {
        return error("구매 후보를 찾을 수 없습니다.", 404);
      }

      await prisma.newOrderPriceCandidate.update({
        where: { id: candidate.id },
        data: {
          isCurrentBest: false,
          deletedAt: new Date(),
          deletedBy,
          updatedBy: actor,
        },
      });
      result = { message: "구매목록에서 삭제했습니다." };
    } else {
      return error("지원하지 않는 작업입니다.");
    }
  } catch (cause) {
    console.warn("[operations/neworder]", action, cause);
    return error(
      action === "deletePriceCandidate"
        ? "삭제에 실패했습니다. 다시 시도해 주세요."
        : "저장 중 오류가 발생했습니다.",
      500
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
