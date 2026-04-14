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

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const places = await prisma.place.findMany({
      where: {
        userId,
        type: "review",
      },
      orderBy: [{ reviewPinned: "desc" }, { createdAt: "desc" }],
      include: {
        keywords: {
          select: {
            id: true,
            mobileVolume: true,
            pcVolume: true,
            totalVolume: true,
          },
        },
        reviewHistory: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const mappedPlaces = places.map((place: any) => {
      const history = (place.reviewHistory as ReviewRow[]).map(
        (row, idx, arr: ReviewRow[]) => {
          const prev = arr[idx + 1];

          const currentSaveCount = parseSaveCount(row.saveCount);
          const prevSaveCount = prev ? parseSaveCount(prev.saveCount) : 0;

          return {
            id: row.id,
            totalReviewCount: row.totalReviewCount,
            totalReviewDiff: prev
              ? row.totalReviewCount - prev.totalReviewCount
              : null,
            visitorReviewCount: row.visitorReviewCount,
            visitorReviewDiff: prev
              ? row.visitorReviewCount - prev.visitorReviewCount
              : null,
            blogReviewCount: row.blogReviewCount,
            blogReviewDiff: prev
              ? row.blogReviewCount - prev.blogReviewCount
              : null,
            saveCount: row.saveCount,
            saveCountDiff: prev ? currentSaveCount - prevSaveCount : null,
            keywords: row.keywords,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        }
      );

      return {
        id: place.id,
        name: place.name,
        address: place.address,
        jibunAddress: place.jibunAddress,
        imageUrl: place.imageUrl,
        placeUrl: place.placeUrl,
        x: place.x,
        y: place.y,
        reviewAutoTracking: place.reviewAutoTracking,
        reviewPinned: place.reviewPinned,

        // ✅ place/page 와 동일하게 매장 단위 검색량 내려주기
        placeMonthlyVolume: place.placeMonthlyVolume ?? 0,
        placeMobileVolume: place.placeMobileVolume ?? 0,
        placePcVolume: place.placePcVolume ?? 0,

        keywords: place.keywords,
        reviewHistory: history,
      };
    });

    return NextResponse.json({
      ok: true,
      places: mappedPlaces,
    });
  } catch (error) {
    console.error("place-review-list error:", error);

    return NextResponse.json(
      { ok: false, message: "리뷰 추적 목록 조회 실패" },
      { status: 500 }
    );
  }
}