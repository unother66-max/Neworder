import { NextResponse } from "next/server";

import { getNewOrderAccess } from "@/lib/neworder/auth";
import { getNewOrderSnapshot } from "@/lib/neworder/data";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";
import { calculatePriceMetrics } from "@/lib/neworder/price-analysis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
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
  const access = await getNewOrderAccess();
  if (!access) return error(OPERATOR_REQUIRED_ERROR, 403);

  const snapshot = await getNewOrderSnapshot(access.userId);
  return NextResponse.json({ ok: true, ...snapshot });
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
        excludedKeywords: normalizeStringArray(
          body.excludedKeywords ?? body.excludeKeywords,
          /[,;\r\n]+/
        ),
        defaultSupplierId,
        updatedBy: actor,
      };
      if (id) {
        await prisma.newOrderItem.update({ where: { id }, data });
      } else {
        await prisma.newOrderItem.create({
          data: { ...data, createdBy: actor },
        });
      }
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
      const itemId = text(body.itemId, 100);
      const title = text(body.title, 300);
      const productUrl = validUrl(body.productUrl);
      const itemPrice = integer(body.itemPrice, 0);
      const shippingFee = integer(body.shippingFee, 0);
      const quantityPerPack = integer(body.quantityPerPack, 1);
      const volumePerUnit =
        body.volumePerUnit == null || body.volumePerUnit === ""
          ? undefined
          : Number(body.volumePerUnit);
      const volumeUnit = text(body.volumeUnit, 20) || undefined;
      const packageUnit = text(body.packageUnit, 20) || undefined;
      const source =
        body.source === "NAVER" || body.source === "COUPANG"
          ? body.source
          : "MANUAL";
      if (!itemId || !title || !productUrl || itemPrice === null || shippingFee === null || quantityPerPack === null) {
        return error("가격 후보 정보를 확인해 주세요.");
      }
      const metrics = calculatePriceMetrics({
        title,
        itemPrice,
        shippingFee,
        quantityPerPack,
        volumePerUnit:
          volumePerUnit != null && Number.isFinite(volumePerUnit)
            ? volumePerUnit
            : undefined,
        volumeUnit,
        packageUnit,
      });
      await prisma.newOrderPriceCandidate.create({
        data: {
          itemId,
          source,
          title,
          productUrl,
          itemPrice,
          shippingFee,
          totalPrice: metrics.totalPrice,
          quantityPerPack: metrics.unitCount,
          unitPrice: metrics.unitPrice,
          volumePerUnit: metrics.volumePerUnit,
          volumeUnit: metrics.volumeUnit,
          packageUnit: metrics.packageUnit,
          pricePer100: metrics.pricePer100,
          pricePerMeasure: metrics.pricePerMeasure,
          createdBy: actor,
          updatedBy: actor,
        },
      });
    } else {
      return error("지원하지 않는 작업입니다.");
    }
  } catch (cause) {
    console.error("[operations/neworder]", action, cause);
    return error("저장 중 오류가 발생했습니다.", 500);
  }

  return NextResponse.json({ ok: true });
}
