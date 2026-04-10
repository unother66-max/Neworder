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
    const keywordId = String(body?.keywordId ?? "").trim();
    if (!keywordId) {
      return NextResponse.json({ error: "keywordId가 필요합니다." }, { status: 400 });
    }

    const kw = await prisma.smartstoreKeyword.findUnique({
      where: { id: keywordId },
      include: { product: { select: { userId: true, id: true } } },
    });
    if (!kw || kw.product.userId !== userId) {
      return NextResponse.json({ error: "키워드를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.smartstoreKeyword.delete({ where: { id: keywordId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[smartstore-keyword-delete]", e);
    return NextResponse.json(
      { error: "키워드 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
