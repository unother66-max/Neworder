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

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "").trim();
    const keywordsRaw = Array.isArray(body?.keywords) ? body.keywords : [];

    if (!productId) {
      return NextResponse.json({ error: "productId가 필요합니다." }, { status: 400 });
    }

    const keywords = keywordsRaw
      .map((k: unknown) => String(k ?? "").trim())
      .filter((k: string) => Boolean(k));

    // 중복 제거(첫 등장 기준) + 상한
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const kw of keywords) {
      if (seen.has(kw)) continue;
      seen.add(kw);
      ordered.push(kw);
      if (ordered.length >= MAX_KEYWORDS) break;
    }

    if (ordered.length > MAX_KEYWORDS) {
      return NextResponse.json(
        { error: `키워드는 상품당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있습니다.` },
        { status: 400 }
      );
    }

    const product = await prisma.smartstoreProduct.findFirst({
      where: { id: productId, userId },
      select: { id: true, autoTracking: true },
    });
    if (!product) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    const existing = await prisma.smartstoreKeyword.findMany({
      where: { productId },
      select: { id: true, keyword: true },
    });
    const existingByKeyword = new Map(existing.map((r) => [r.keyword, r]));
    const keepSet = new Set(ordered);

    const toDeleteIds = existing.filter((r) => !keepSet.has(r.keyword)).map((r) => r.id);
    const toCreate = ordered.filter((kw) => !existingByKeyword.has(kw));

    await prisma.$transaction(async (tx) => {
      if (toDeleteIds.length > 0) {
        await tx.smartstoreKeyword.deleteMany({ where: { id: { in: toDeleteIds } } });
      }

      // 기존 키워드 sortOrder 업데이트 (ordered 배열 인덱스 기준)
      await Promise.all(
        ordered.map(async (kw, idx) => {
          const row = existingByKeyword.get(kw);
          if (!row) return;
          await tx.smartstoreKeyword.update({
            where: { id: row.id },
            data: { sortOrder: idx },
          });
        })
      );

      // 신규 키워드 생성 (검색량 조회 포함)
      for (let i = 0; i < toCreate.length; i++) {
        const kw = toCreate[i];
        const sortOrder = ordered.indexOf(kw);
        const vol = await getKeywordSearchVolume(kw);
        await tx.smartstoreKeyword.create({
          data: {
            productId,
            keyword: kw,
            sortOrder: sortOrder >= 0 ? sortOrder : 0,
            isTracking: product.autoTracking,
            mobileVolume: vol.mobile,
            pcVolume: vol.pc,
            totalVolume: vol.total,
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[smartstore-keyword-sync]", e);
    return NextResponse.json({ error: "키워드 동기화에 실패했습니다." }, { status: 500 });
  }
}

