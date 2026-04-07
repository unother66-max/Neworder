import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return NextResponse.json(
        { ok: false, message: "placeId 없음" },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
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

    if (!place.placeUrl) {
      return NextResponse.json(
        { ok: false, message: "placeUrl이 없습니다." },
        { status: 400 }
      );
    }

    console.log("[review-track place.id]", place.id);
    console.log("[review-track place.name]", place.name);
    console.log("[review-track place.placeUrl]", place.placeUrl);

    const latest = place.reviewHistory[0];
   const snapshot = await getNaverPlaceReviewSnapshot({
  placeUrl: String(place.placeUrl || ""),
  placeName: String(place.name || ""),
  x: place.x ? String(place.x) : "",
  y: place.y ? String(place.y) : "",
});

    console.log("[review-track snapshot]", snapshot);
    console.log("[review-track input]", {
  placeUrl: String(place.placeUrl || ""),
  placeName: String(place.name || ""),
  x: place.x ? String(place.x) : "",
  y: place.y ? String(place.y) : "",
});

    const visitorReviewCount =
      snapshot.visitorReviewCount ?? latest?.visitorReviewCount ?? 0;

    const blogReviewCount =
      snapshot.blogReviewCount ?? latest?.blogReviewCount ?? 0;

    const totalReviewCount =
      visitorReviewCount + blogReviewCount;

    const saveCount =
      snapshot.saveCountText ?? latest?.saveCount ?? "0";

    if (
      snapshot.visitorReviewCount === null &&
      snapshot.blogReviewCount === null &&
      snapshot.saveCountText === null
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: `리뷰 파싱 실패: ${place.name} / ${place.placeUrl}`,
        },
        { status: 422 }
      );
    }

    const keywords =
      latest?.keywords && latest.keywords.length > 0
        ? latest.keywords
        : ["맛집", "분위기", "데이트", "가성비", "친절"];

    const data = await prisma.placeReviewHistory.create({
      data: {
        placeId,
        totalReviewCount,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
        keywords,
      },
    });

    return NextResponse.json({
      ok: true,
      data,
      parsed: {
        totalReviewCount,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
      },
    });
  } catch (error) {
    console.error("place-review-track error:", error);

    return NextResponse.json(
      { ok: false, message: "리뷰 추적 저장 실패" },
      { status: 500 }
    );
  }
}