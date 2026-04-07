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
};

function parseSaveCount(value: string) {
  const onlyNumber = String(value || "").replace(/[^\d]/g, "");
  const parsed = Number(onlyNumber);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    // ✅ userId 가져오기
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
      
      },
      orderBy: { createdAt: "desc" },
      include: {
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
          };
        }
      );

      return {
        id: place.id,
        name: place.name,
        address: place.address,
        imageUrl: place.imageUrl,
        reviewAutoTracking: place.reviewAutoTracking,
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