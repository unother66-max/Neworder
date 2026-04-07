import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 👉 한국 날짜 기준 YYYY-MM-DD
function getKstDateString() {
  const now = new Date();

  const kst = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );

  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

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

    const snapshot = await getNaverPlaceReviewSnapshot({
      placeUrl: String(place.placeUrl || ""),
      placeName: String(place.name || ""),
      x: place.x ? String(place.x) : "",
      y: place.y ? String(place.y) : "",
    });

    if (
      snapshot.visitorReviewCount === null &&
      snapshot.blogReviewCount === null &&
      snapshot.saveCountText === null
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: `리뷰 파싱 실패: ${place.name}`,
        },
        { status: 422 }
      );
    }

    const visitorReviewCount = snapshot.visitorReviewCount ?? 0;
    const blogReviewCount = snapshot.blogReviewCount ?? 0;
    const totalReviewCount = visitorReviewCount + blogReviewCount;
    const saveCount = snapshot.saveCountText ?? "0";

    const latest = place.reviewHistory[0];

    // 🔥 핵심 수정 (여기)
    const keywords =
      snapshot.keywordList && snapshot.keywordList.length > 0
        ? snapshot.keywordList
        : latest?.keywords && latest.keywords.length > 0
        ? latest.keywords
        : ["맛집", "분위기", "데이트", "가성비", "친절"];

    const trackedDate = getKstDateString();

    console.log("[review upsert]", {
      placeId,
      trackedDate,
      totalReviewCount,
      visitorReviewCount,
      blogReviewCount,
      saveCount,
      keywords,
    });

    // 🔥 하루 1개 (중복 제거)
    const data = await prisma.placeReviewHistory.upsert({
      where: {
        placeId_trackedDate: {
          placeId,
          trackedDate,
        },
      },
      update: {
        totalReviewCount,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
        keywords,
      },
      create: {
        placeId,
        trackedDate,
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
      date: trackedDate,
      parsed: {
        totalReviewCount,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
        keywords,
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