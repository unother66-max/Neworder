import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  totalReviewCount: number;
  visitorReviewCount: number;
  blogReviewCount: number;
  saveCount: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
};

function parseSaveCount(value: string) {
  const onlyNumber = String(value || "").replace(/[^\d]/g, "");
  const parsed = Number(onlyNumber);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, message: "id 없음" }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id, userId, type: "review" },
      include: {
        keywords: {
          select: { id: true, mobileVolume: true, pcVolume: true, totalVolume: true },
        },
        reviewHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, message: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const history = (place.reviewHistory as ReviewRow[]).map((row, idx, arr) => {
      const prev = arr[idx + 1];
      const currentSaveCount = parseSaveCount(row.saveCount);
      const prevSaveCount = prev ? parseSaveCount(prev.saveCount) : 0;

      return {
        id: row.id,
        totalReviewCount: row.totalReviewCount,
        totalReviewDiff: prev ? row.totalReviewCount - prev.totalReviewCount : null,
        visitorReviewCount: row.visitorReviewCount,
        visitorReviewDiff: prev
          ? row.visitorReviewCount - prev.visitorReviewCount
          : null,
        blogReviewCount: row.blogReviewCount,
        blogReviewDiff: prev ? row.blogReviewCount - prev.blogReviewCount : null,
        saveCount: row.saveCount,
        saveCountDiff: prev ? currentSaveCount - prevSaveCount : null,
        keywords: row.keywords,
        createdAt: row.createdAt,
        updatedAt: (row as any).updatedAt ?? row.createdAt,
      };
    });

    return NextResponse.json({
      ok: true,
      place: {
        id: place.id,
        name: place.name,
        address: place.address,
        jibunAddress: (place as any).jibunAddress ?? null,
        imageUrl: place.imageUrl,
        placeUrl: place.placeUrl,
        reviewAutoTracking: (place as any).reviewAutoTracking ?? false,
        reviewPinned: (place as any).reviewPinned ?? false,
        placeMonthlyVolume: (place as any).placeMonthlyVolume ?? 0,
        placeMobileVolume: (place as any).placeMobileVolume ?? 0,
        placePcVolume: (place as any).placePcVolume ?? 0,
        keywords: place.keywords,
        reviewHistory: history,
      },
    });
  } catch (error) {
    console.error("place-review-detail error:", error);
    return NextResponse.json(
      { ok: false, message: "리뷰 변화 상세 조회 실패" },
      { status: 500 }
    );
  }
}

