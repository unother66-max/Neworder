import { NextResponse } from "next/server";

import { getNewOrderAccess } from "@/lib/neworder/auth";
import { getNewOrderSnapshot } from "@/lib/neworder/data";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";
import { calculatePriceMetrics } from "@/lib/neworder/price-analysis";
import { isBaeminMartUrl } from "@/lib/neworder/sellers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message: string, status = 400, reason?: string) {
  return NextResponse.json(
    { ok: false, error: message, message, ...(reason ? { reason } : {}) },
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

function mutationFailure(cause: unknown) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const code =
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
      ? cause.code
      : null;

  if (
    /Unknown argument `?(?:optionMemo|optionPriceChecked|isPinned|pinnedAt)`?/i.test(
      detail
    )
  ) {
    return {
      reason: "PRISMA_CLIENT_STALE",
      message:
        "Prisma Client가 최신 구매목록 스키마와 일치하지 않습니다. Prisma Client를 다시 생성하고 서버를 재시작해 주세요.",
      detail,
    };
  }
  if (
    code === "P2022" ||
    /column .*?(?:optionMemo|optionPriceChecked|isPinned|pinnedAt).*?does not exist/i.test(
      detail
    )
  ) {
    return {
      reason: "DB_MIGRATION_REQUIRED",
      message:
        "최신 구매목록 필드가 DB에 반영되지 않았습니다. 최신 Prisma migration을 적용해 주세요.",
      detail,
    };
  }
  if (code === "P2025") {
    return {
      reason: "PURCHASE_CANDIDATE_NOT_FOUND",
      message: "업데이트할 구매목록 상품을 찾을 수 없습니다.",
      detail,
    };
  }
  return {
    reason: "SAVE_FAILED",
    message: "저장 중 오류가 발생했습니다.",
    detail,
  };
}

export async function GET() {
  try {
    const access = await getNewOrderAccess();
    if (!access) return error(OPERATOR_REQUIRED_ERROR, 403);

    const snapshot = await getNewOrderSnapshot();
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const code =
      typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      typeof cause.code === "string"
        ? cause.code
        : null;
    const reason =
      code === "P2028" ||
      /transaction not found|closed transaction|transaction.*closed/i.test(detail)
        ? "TRANSACTION_CLOSED"
        : "DATA_LOAD_FAILED";
    console.warn("[operations/neworder] GET", { reason, detail });
    return error(
      "운영관리 데이터를 불러오는 중 오류가 발생했습니다.",
      500,
      reason
    );
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
        ...(typeof body.isActive === "boolean"
          ? { isActive: body.isActive }
          : {}),
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
      const optionMemo = text(body.optionMemo, 500) || null;
      const optionPriceChecked = body.optionPriceChecked === true;
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
        body.source === "BAEMIN_MART" ||
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
      if (source === "BAEMIN_MART" && !isBaeminMartUrl(productUrl)) {
        return error(
          "배민상회 구매 링크는 mart.baemin.com 주소를 입력해 주세요."
        );
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
            optionMemo,
            optionPriceChecked,
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
            optionMemo,
            optionPriceChecked,
            note: text(body.note, 1000) || null,
            createdBy: savedBy,
          },
        });
      });
      result = { itemId };
    } else if (action === "updateExistingPriceCandidate") {
      const candidateId = text(body.candidateId, 100);
      const itemId = text(body.itemId, 100);
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
      const optionMemo = text(body.optionMemo, 500) || null;
      const optionPriceChecked = body.optionPriceChecked === true;
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
        body.source === "BAEMIN_MART" ||
        body.source === "ETC"
          ? body.source
          : "MANUAL";

      if (
        !candidateId ||
        !itemId ||
        !title ||
        !productUrl ||
        itemPrice === null ||
        shippingFee === null ||
        shippingUnitCount === null ||
        quantityPerPack === null
      ) {
        return error("업데이트할 구매 후보 정보를 확인해 주세요.");
      }
      if (!optionPriceChecked) {
        return error(
          "실제 옵션 가격 확인 후 체크해 주세요.",
          400,
          "OPTION_PRICE_CONFIRMATION_REQUIRED"
        );
      }
      if (source === "BAEMIN_MART" && !isBaeminMartUrl(productUrl)) {
        return error(
          "배민상회 구매 링크는 mart.baemin.com 주소를 입력해 주세요."
        );
      }

      const currentCandidate = await prisma.newOrderPriceCandidate.findFirst({
        where: {
          id: candidateId,
          itemId,
          isCurrentBest: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!currentCandidate) {
        return error("업데이트할 구매목록 상품을 찾을 수 없습니다.", 404);
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
      const checkedAt = new Date();

      await prisma.$transaction([
        prisma.newOrderPriceCandidate.updateMany({
          where: {
            itemId,
            isCurrentBest: true,
            deletedAt: null,
            id: { not: candidateId },
          },
          data: { isCurrentBest: false, updatedBy: actor },
        }),
        prisma.newOrderPriceCandidate.update({
          where: { id: candidateId },
          data: {
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
            optionMemo,
            optionPriceChecked,
            savedBy,
            checkedAt,
            isCurrentBest: true,
            updatedBy: actor,
          },
        }),
        prisma.newOrderPriceHistory.create({
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
            optionMemo,
            optionPriceChecked,
            note: "구매목록 인라인 가격비교에서 상품 정보를 업데이트했습니다.",
            createdBy: savedBy,
          },
        }),
      ]);
      result = { candidateId, itemId };
    } else if (action === "updatePriceCandidatePrice") {
      const candidateId = text(body.candidateId, 100);
      const itemPrice = integer(body.itemPrice, 1);
      if (!candidateId || itemPrice === null) {
        return error("상품가는 1원 이상으로 입력해 주세요.");
      }

      const candidate = await prisma.newOrderPriceCandidate.findFirst({
        where: {
          id: candidateId,
          isCurrentBest: true,
          deletedAt: null,
        },
      });
      if (!candidate) {
        return error("수정할 구매 후보를 찾을 수 없습니다.", 404);
      }

      const metrics = calculatePriceMetrics({
        title: candidate.title,
        itemPrice,
        shippingFee: candidate.shippingFee,
        shippingUnitCount: candidate.shippingUnitCount,
        shippingStatus: candidate.shippingStatus,
        shippingNeedsConfirmation: candidate.shippingNeedsConfirmation,
        quantityPerPack: candidate.quantityPerPack,
        volumePerUnit: candidate.volumePerUnit,
        volumeUnit: candidate.volumeUnit,
        packageUnit: candidate.packageUnit,
      });
      const savedBy = access.name || access.email || "운영자";
      const checkedAt = new Date();

      await prisma.$transaction([
        prisma.newOrderPriceCandidate.update({
          where: { id: candidate.id },
          data: {
            itemPrice,
            productPrice: metrics.productPrice,
            effectiveShippingFee: metrics.effectiveShippingFee,
            totalPrice: Math.round(metrics.totalPrice),
            totalPriceWithShipping: Math.round(metrics.totalPrice),
            unitPrice: metrics.unitPrice,
            pricePer100: metrics.pricePer100,
            pricePerMeasure: metrics.pricePerMeasure,
            savedBy,
            checkedAt,
            updatedBy: actor,
          },
        }),
        prisma.newOrderPriceHistory.create({
          data: {
            itemId: candidate.itemId,
            source: candidate.source,
            mallName: candidate.mallName,
            productName: candidate.title,
            productUrl: candidate.productUrl,
            imageUrl: candidate.imageUrl,
            itemPrice,
            productPrice: metrics.productPrice,
            shippingFee: candidate.shippingFee,
            shippingUnitCount: metrics.shippingUnitCount,
            shippingStatus: candidate.shippingStatus,
            shippingNote: candidate.shippingNote,
            shippingCondition: candidate.shippingCondition,
            shippingNeedsConfirmation: candidate.shippingNeedsConfirmation,
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
            optionMemo: candidate.optionMemo,
            optionPriceChecked: candidate.optionPriceChecked,
            note: "구매목록에서 상품가를 수정했습니다.",
            createdBy: savedBy,
          },
        }),
      ]);
      result = { candidateId: candidate.id };
    } else if (action === "updatePriceCandidateShipping") {
      const candidateId = text(body.candidateId, 100);
      const shippingMode =
        body.shippingMode === "INCLUDED" ||
        body.shippingMode === "ENTERED" ||
        body.shippingMode === "UNKNOWN"
          ? body.shippingMode
          : null;
      const enteredShippingFee = integer(body.shippingFee, 0);
      if (
        !candidateId ||
        !shippingMode ||
        (shippingMode === "ENTERED" &&
          (enteredShippingFee === null || enteredShippingFee < 1))
      ) {
        return error("배송비 설정을 확인해 주세요.");
      }

      const candidate = await prisma.newOrderPriceCandidate.findFirst({
        where: {
          id: candidateId,
          isCurrentBest: true,
          deletedAt: null,
        },
      });
      if (!candidate) {
        return error("수정할 구매 후보를 찾을 수 없습니다.", 404);
      }

      const quantityPerPack = Math.max(
        1,
        candidate.quantityPerPack || candidate.bundleQuantity || 1
      );
      const shippingStatus =
        shippingMode === "INCLUDED"
          ? "FREE"
          : shippingMode === "ENTERED"
            ? "PAID"
            : "UNKNOWN";
      const shippingFee =
        shippingMode === "ENTERED" ? enteredShippingFee ?? 0 : 0;
      const shippingUnitCount =
        shippingMode === "ENTERED" ? quantityPerPack : 1;
      const shippingNeedsConfirmation = shippingStatus === "UNKNOWN";
      const shippingNote =
        shippingMode === "INCLUDED"
          ? "사용자가 배송비 포함으로 설정했습니다."
          : shippingMode === "ENTERED"
            ? "사용자가 배송비를 직접 입력했습니다."
            : "사용자가 배송비 미확인으로 설정했습니다.";
      const metrics = calculatePriceMetrics({
        title: candidate.title,
        itemPrice: candidate.itemPrice,
        shippingFee,
        shippingUnitCount,
        shippingStatus,
        shippingNeedsConfirmation,
        quantityPerPack,
        volumePerUnit: candidate.volumePerUnit,
        volumeUnit: candidate.volumeUnit,
        packageUnit: candidate.packageUnit,
      });
      const savedBy = access.name || access.email || "운영자";
      const checkedAt = new Date();

      await prisma.$transaction([
        prisma.newOrderPriceCandidate.update({
          where: { id: candidate.id },
          data: {
            shippingFee,
            shippingUnitCount: metrics.shippingUnitCount,
            shippingStatus,
            shippingNote,
            shippingCondition: null,
            shippingNeedsConfirmation,
            effectiveShippingFee: metrics.effectiveShippingFee,
            totalPrice: Math.round(metrics.totalPrice),
            totalPriceWithShipping: Math.round(metrics.totalPrice),
            unitPrice: metrics.unitPrice,
            pricePer100: metrics.pricePer100,
            pricePerMeasure: metrics.pricePerMeasure,
            savedBy,
            checkedAt,
            updatedBy: actor,
          },
        }),
        prisma.newOrderPriceHistory.create({
          data: {
            itemId: candidate.itemId,
            source: candidate.source,
            mallName: candidate.mallName,
            productName: candidate.title,
            productUrl: candidate.productUrl,
            imageUrl: candidate.imageUrl,
            itemPrice: candidate.itemPrice,
            productPrice: metrics.productPrice,
            shippingFee,
            shippingUnitCount: metrics.shippingUnitCount,
            shippingStatus,
            shippingNote,
            shippingCondition: null,
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
            optionMemo: candidate.optionMemo,
            optionPriceChecked: candidate.optionPriceChecked,
            note: "구매목록에서 배송비 설정을 수정했습니다.",
            createdBy: savedBy,
          },
        }),
      ]);
      result = {
        candidateId: candidate.id,
        shippingStatus,
        shippingFee,
      };
    } else if (action === "togglePriceCandidatePin") {
      const candidateId = text(body.candidateId, 100);
      const isPinned = body.isPinned === true;
      if (!candidateId) {
        return error("고정 상태를 변경할 구매 후보를 확인해 주세요.");
      }

      const candidate = await prisma.newOrderPriceCandidate.findFirst({
        where: {
          id: candidateId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!candidate) {
        return error("구매 후보를 찾을 수 없습니다.", 404);
      }

      const pinnedAt = isPinned ? new Date() : null;
      await prisma.newOrderPriceCandidate.update({
        where: { id: candidate.id },
        data: {
          isPinned,
          pinnedAt,
          updatedBy: actor,
        },
      });
      result = { candidateId: candidate.id, isPinned, pinnedAt };
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
    const failure = mutationFailure(cause);
    console.warn("[operations/neworder]", {
      action,
      reason: failure.reason,
      detail: failure.detail,
    });
    return error(
      action === "deletePriceCandidate"
        ? "삭제에 실패했습니다. 다시 시도해 주세요."
        : action === "togglePriceCandidatePin"
          ? "고정 상태 변경에 실패했습니다."
          : action === "updatePriceCandidateShipping"
            ? "배송비 설정 변경에 실패했습니다."
          : failure.message,
      500,
      failure.reason
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
