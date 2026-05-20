import { NextResponse } from "next/server";
import { traceSmartstoreReviewSources } from "@/lib/smartstore-review-fetcher";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "development 환경에서만 사용할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(req.url);
  const productId = String(url.searchParams.get("productId") ?? "").trim();
  const storeName = String(url.searchParams.get("storeName") ?? "").trim() || null;
  const shoppingProductId =
    String(url.searchParams.get("shoppingProductId") ?? "").trim() || null;
  const productUrl = String(url.searchParams.get("productUrl") ?? "").trim() || null;
  const leafRaw = String(url.searchParams.get("leafCategoryId") ?? "").trim();
  const leafCategoryId = leafRaw ? Number(leafRaw) : null;
  const fetchMode = url.searchParams.get("fetch") === "1" ? "singleFetch" : "dryRun";

  if (!/^\d+$/.test(productId)) {
    return NextResponse.json({ error: "productId가 필요합니다." }, { status: 400 });
  }

  const trace = await traceSmartstoreReviewSources({
    productUrl,
    productId,
    storeName,
    shoppingProductId,
    leafCategoryId: Number.isFinite(leafCategoryId) ? leafCategoryId : null,
    fetchMode,
  });

  return NextResponse.json({ ok: true, trace });
}

export async function PATCH(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "development 환경에서만 사용할 수 있습니다." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const productId = String(body.productId ?? "").trim();
  const storeName = String(body.storeName ?? "").trim();
  const reviewProductId = String(body.reviewProductId ?? "").trim();
  const leafCategoryId = Number(body.leafCategoryId);

  if (!/^\d+$/.test(productId) || !/^\d+$/.test(reviewProductId)) {
    return NextResponse.json(
      { error: "productId와 reviewProductId가 필요합니다." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(leafCategoryId) || Math.trunc(leafCategoryId) <= 0) {
    return NextResponse.json({ error: "leafCategoryId가 필요합니다." }, { status: 400 });
  }

  const where = {
    productId,
    ...(storeName ? { storeName } : {}),
  };
  const updated = await prisma.smartstoreReviewTarget.updateMany({
    where,
    data: {
      reviewProductId,
      leafCategoryId: Math.trunc(leafCategoryId),
    },
  });

  return NextResponse.json({
    ok: true,
    updatedCount: updated.count,
    productId,
    storeName: storeName || null,
    reviewProductId,
    leafCategoryId: Math.trunc(leafCategoryId),
  });
}
