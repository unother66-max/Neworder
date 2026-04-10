import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYWORDS = 10;

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const productId = String(body?.productId ?? "").trim();
    const keyword = String(body?.keyword ?? "").trim();

    if (!productId || !keyword) {
      return NextResponse.json(
        { error: "productId와 keyword가 필요합니다." },
        { status: 400 }
      );
    }

    const product = await prisma.smartstoreProduct.findFirst({
      where: { id: productId, userId },
      include: { _count: { select: { keywords: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    const exists = await prisma.smartstoreKeyword.findUnique({
      where: {
        productId_keyword: { productId, keyword },
      },
    });
    if (exists) {
      return NextResponse.json({ error: "이미 등록된 키워드입니다." }, { status: 409 });
    }

    if (product._count.keywords >= MAX_KEYWORDS) {
      return NextResponse.json(
        { error: `키워드는 상품당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있습니다.` },
        { status: 400 }
      );
    }

    const vol = await getKeywordSearchVolume(keyword);

    const row = await prisma.smartstoreKeyword.create({
      data: {
        productId,
        keyword,
        isTracking: product.autoTracking,
        mobileVolume: vol.mobile,
        pcVolume: vol.pc,
        totalVolume: vol.total,
      },
    });

    return NextResponse.json({ ok: true, keyword: row });
  } catch (e) {
    console.error("[smartstore-keyword-save]", e);
    return NextResponse.json(
      { error: "키워드 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
