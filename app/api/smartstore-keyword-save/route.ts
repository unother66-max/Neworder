import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYWORDS = 10;

export async function POST(req: Request) {
  let debug: { productId?: string; keywords?: string[] } = {};
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "").trim();
    const keywordsRaw = Array.isArray(body?.keywords) ? (body.keywords as unknown[]) : [];

    if (!productId) {
      return NextResponse.json(
        { error: "productId가 필요합니다." },
        { status: 400 }
      );
    }

    // keywords 유효성: 문자열만 추출 → trim → 빈값 제거 → 중복 제거(Set)
    const keywords = Array.from(
      new Set(
        keywordsRaw
          .map((k) => (typeof k === "string" ? k : String((k as any)?.keyword ?? "")))
          .map((k) => String(k ?? "").trim())
          .filter(Boolean)
      )
    );
    debug = { productId, keywords };

    if (keywords.length > MAX_KEYWORDS) {
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

    // 검색량 미리 조회 (유틸이 키 누락/실패 시 total=0 반환 + 로그)
    const volumes = await Promise.all(
      keywords.map(async (kw) => {
        const vol = await getKeywordSearchVolume(kw);
        return { kw, vol };
      })
    );

    // deleteMany + createMany 를 하나의 트랜잭션으로 (부분 실패 방지)
    await prisma.$transaction(async (tx) => {
      await tx.smartstoreKeyword.deleteMany({ where: { productId } });
      if (keywords.length === 0) return;

      await tx.smartstoreKeyword.createMany({
        data: volumes.map(({ kw, vol }, idx) => ({
          productId,
          keyword: kw,
          sortOrder: idx,
          isTracking: product.autoTracking,
          mobileVolume: vol.mobile,
          pcVolume: vol.pc,
          totalVolume: vol.total,
        })),
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // 어떤 데이터로 실패했는지 찍어주기
    console.error("[smartstore-keyword-save] error", { ...debug, error: e });
    return NextResponse.json(
      { error: "키워드 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
