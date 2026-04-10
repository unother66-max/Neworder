import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = String(searchParams.get("id") ?? "").trim();
    if (!productId) {
      return NextResponse.json({ error: "id 쿼리가 필요합니다." }, { status: 400 });
    }

    const row = await prisma.smartstoreProduct.findFirst({
      where: { id: productId, userId },
      include: {
        keywords: { orderBy: { createdAt: "asc" } },
        histories: {
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    });

    if (!row) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    const { histories, ...rest } = row;
    return NextResponse.json({
      ok: true,
      product: { ...rest, rankHistory: histories },
    });
  } catch (e) {
    console.error("[smartstore-product-detail]", e);
    return NextResponse.json(
      { error: "상세 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
