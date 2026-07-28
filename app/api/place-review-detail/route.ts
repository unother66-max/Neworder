import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import {
  buildPlaceReviewDailyHistory,
  getPreviousTrackedDate,
} from "@/lib/place-review-history";
import { recentSeoulDateStrings } from "@/lib/seoul-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_HISTORY_PAGE_SIZE = 30;
const REVIEW_CHART_DAYS = 365;

type ReviewRow = {
  id: string;
  totalReviewCount: number;
  visitorReviewCount: number;
  blogReviewCount: number;
  saveCount: string;
  trackedDate: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
};

type SessionWithUserId = {
  user?: {
    id?: string | null;
  };
};

function serializeHistory(rows: ReviewRow[], limit: number) {
  return buildPlaceReviewDailyHistory(rows, limit).map((row) => ({
    id: row.id,
    trackedDate: row.trackedDate,
    comparedTrackedDate: row.comparedTrackedDate,
    totalReviewCount: row.totalReviewCount,
    totalReviewDiff: row.totalReviewDiff,
    visitorReviewCount: row.visitorReviewCount,
    visitorReviewDiff: row.visitorReviewDiff,
    blogReviewCount: row.blogReviewCount,
    blogReviewDiff: row.blogReviewDiff,
    saveCount: row.saveCount,
    saveCountDiff: row.saveCountDiff,
    keywords: row.keywords,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt,
  }));
}

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(
      authOptions
    )) as SessionWithUserId | null;
    const userId = String(session?.user?.id ?? "").trim();
    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "").trim();
    const requestedHistoryOffset = Number(searchParams.get("historyOffset") || 0);
    const historyOffset =
      Number.isSafeInteger(requestedHistoryOffset) && requestedHistoryOffset >= 0
        ? Math.min(requestedHistoryOffset, 100_000)
        : 0;
    if (!id) {
      return NextResponse.json({ ok: false, message: "id 없음" }, { status: 400 });
    }

    const chartStartTrackedDate =
      recentSeoulDateStrings(REVIEW_CHART_DAYS)[0];
    const chartQueryStartTrackedDate =
      getPreviousTrackedDate(chartStartTrackedDate) ?? chartStartTrackedDate;

    const place = await prisma.place.findFirst({
      where: { id, userId, type: "review" },
      include: {
        keywords: {
          select: { id: true, mobileVolume: true, pcVolume: true, totalVolume: true },
        },
        reviewHistory: {
          orderBy: { trackedDate: "desc" },
          skip: historyOffset,
          take: REVIEW_HISTORY_PAGE_SIZE + 1,
        },
      },
    });

    if (!place) {
      return NextResponse.json(
        { ok: false, message: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const chartRows =
      historyOffset === 0
        ? ((await prisma.placeReviewHistory.findMany({
            where: {
              placeId: place.id,
              trackedDate: { gte: chartQueryStartTrackedDate },
            },
            orderBy: { trackedDate: "desc" },
            take: REVIEW_CHART_DAYS + 1,
          })) as ReviewRow[])
        : [];

    const historyRows = place.reviewHistory as ReviewRow[];
    const history = serializeHistory(historyRows, REVIEW_HISTORY_PAGE_SIZE);
    const chartHistory = serializeHistory(
      chartRows,
      REVIEW_CHART_DAYS + 1
    ).filter((row) => row.trackedDate >= chartStartTrackedDate);

    return NextResponse.json({
      ok: true,
      place: {
        id: place.id,
        name: place.name,
        address: place.address,
        jibunAddress: place.jibunAddress ?? null,
        imageUrl: place.imageUrl,
        placeUrl: place.placeUrl,
        reviewAutoTracking: place.reviewAutoTracking ?? false,
        reviewPinned: place.reviewPinned ?? false,
        placeMonthlyVolume: place.placeMonthlyVolume ?? 0,
        placeMobileVolume: place.placeMobileVolume ?? 0,
        placePcVolume: place.placePcVolume ?? 0,
        keywords: place.keywords,
        reviewHistory: history,
        reviewHistoryHasMore:
          historyRows.length > REVIEW_HISTORY_PAGE_SIZE,
        reviewHistoryPageSize: REVIEW_HISTORY_PAGE_SIZE,
        chartReviewHistory: chartHistory,
        chartDays: REVIEW_CHART_DAYS,
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
