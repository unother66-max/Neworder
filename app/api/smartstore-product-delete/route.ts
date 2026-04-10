import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const productId = String(body?.productId ?? "").trim();
    if (!productId) {
      return NextResponse.json({ error: "productId가 필요합니다." }, { status: 400 });
    }

    const row = await prisma.smartstoreProduct.findFirst({
      where: { id: productId, userId },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.smartstoreProduct.delete({ where: { id: productId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[smartstore-product-delete]", e);
    return NextResponse.json(
      { error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
