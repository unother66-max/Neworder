import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/smartstore-product-list
 * 로그인 사용자의 스마트스토어 상품만 Prisma로 조회합니다. 네이버 API 호출 없음.
 */

function formatRankLabel(row: {
  rank: number | null;
  pageNum: number | null;
  position: number | null;
  rankLabel: string | null;
}): string {
  if (row.rankLabel?.trim()) {
    const t = row.rankLabel.trim();
    return t === "미노출" ? "1000위 밖" : t;
  }
  if (row.rank == null && row.pageNum == null && row.position == null) {
    return "-";
  }
  const parts: string[] = [];
  if (row.rank != null && row.rank > 0) parts.push(`${row.rank}위`);
  if (row.pageNum != null && row.pageNum > 0) parts.push(`${row.pageNum}p`);
  if (row.position != null && row.position > 0) parts.push(String(row.position));
  return parts.length ? parts.join(" ") : "-";
}

function formatKoDateTime(d: Date): string {
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const space = (() => {
      try {
        const url = new URL(req.url);
        const s = String(url.searchParams.get("space") ?? "").trim().toUpperCase();
        if (s === "PLUS_STORE") return "PLUS_STORE" as const;
        return "NAVER_PRICE" as const;
      } catch {
        return "NAVER_PRICE" as const;
      }
    })();

    const products = await prisma.smartstoreProduct.findMany({
      where: { userId, space },
      select: {
        id: true,
        name: true,
        category: true,
        productUrl: true,
        productId: true,
        thumbnailLink: true,
        imageUrl: true,
        rankPinned: true,
        rankPinnedAt: true,
        autoTracking: true,
        createdAt: true,
        updatedAt: true,
        keywords: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            keyword: true,
            mobileVolume: true,
            pcVolume: true,
            totalVolume: true,
            sortOrder: true,
            isTracking: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [
        { rankPinned: "desc" },
        { rankPinnedAt: "desc" },
        { updatedAt: "desc" },
      ],
    });

    const productIds = products.map((p) => p.id);
    const latestByKey = new Map<
      string,
      {
        rank: number | null;
        pageNum: number | null;
        position: number | null;
        rankLabel: string | null;
        createdAt: Date;
      }
    >();

    if (productIds.length > 0) {
      const histories = await prisma.smartstoreRankHistory.findMany({
        where: { productId: { in: productIds } },
        orderBy: { createdAt: "desc" },
        select: {
          productId: true,
          keyword: true,
          rank: true,
          pageNum: true,
          position: true,
          rankLabel: true,
          createdAt: true,
        },
      });
      for (const h of histories) {
        const key = `${h.productId}\0${h.keyword}`;
        if (!latestByKey.has(key)) latestByKey.set(key, h);
      }
    }

    const payload = products.map((p) => {
      const keywords = p.keywords.map((k) => {
        const latest = latestByKey.get(`${p.id}\0${k.keyword}`);
        return {
          id: k.id,
          keyword: k.keyword,
          mobileVolume: k.mobileVolume ?? null,
          pcVolume: k.pcVolume ?? null,
          totalVolume: k.totalVolume ?? null,
          isTracking: k.isTracking,
          latestRank: latest?.rank ?? null,
          latestRankLabel: latest ? formatRankLabel(latest) : "-",
          latestRankAt: latest?.createdAt?.toISOString() ?? null,
        };
      });

      const ts: number[] = [p.updatedAt.getTime()];
      for (const k of p.keywords) {
        ts.push(k.updatedAt.getTime());
      }
      for (const kw of keywords) {
        if (kw.latestRankAt) {
          ts.push(new Date(kw.latestRankAt).getTime());
        }
      }
      const maxTs = Math.max(...ts);
      const latestUpdatedAt = formatKoDateTime(new Date(maxTs));

      const thumb = p.thumbnailLink?.trim() || p.imageUrl?.trim() || null;

      return {
        id: p.id,
        name: p.name,
        category: p.category ?? null,
        productUrl: p.productUrl,
        naverProductId: p.productId ?? null,
        thumbnailLink: thumb,
        imageUrl: thumb,
        isPinned: p.rankPinned,
        isAutoTracking: p.autoTracking,
        keywords,
        latestUpdatedAt,
      };
    });

    const missingCategory = payload.filter(
      (row) => row.category == null || !String(row.category).trim()
    );
    if (missingCategory.length > 0) {
      console.log("[smartstore-product-list] category 비어 있음", {
        total: payload.length,
        emptyCount: missingCategory.length,
        ids: missingCategory.map((r) => r.id),
        hint: "DB category 컬럼 null/공백 — 상품 재저장 시 Playwright breadcrumb 수집 여부 확인",
      });
    }

    return NextResponse.json({ ok: true, products: payload });
  } catch (e) {
    console.error("[smartstore-product-list]", e);
    return NextResponse.json(
      { error: "목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
