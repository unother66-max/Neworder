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
    const q = String(searchParams.get("q") ?? "").trim();
    const take = Math.min(Math.max(Number(searchParams.get("take") ?? 20) || 20, 1), 50);

    const rows = await prisma.smartstoreProduct.findMany({
      where: {
        userId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { productId: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
      take,
      select: {
        id: true,
        name: true,
        productId: true,
        space: true,
        productUrl: true,
        category: true,
        thumbnailLink: true,
        imageUrl: true,
      },
    });

    const payload = rows.map((r) => {
      const thumb = r.thumbnailLink?.trim() || r.imageUrl?.trim() || null;
      return {
        id: r.id,
        name: r.name,
        productId: r.productId,
        space: r.space,
        productUrl: r.productUrl,
        category: r.category ?? null,
        imageUrl: thumb,
      };
    });

    return NextResponse.json({ ok: true, products: payload });
  } catch (e) {
    console.error("[smartstore-product-search]", e);
    return NextResponse.json({ error: "검색에 실패했습니다." }, { status: 500 });
  }
}

