import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import { getPlaceNameSearchVolume } from "@/lib/getPlaceNameSearchVolume";
import { resolvePlaceReviewSnapshot } from "@/lib/place-review-snapshot-fallback";

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

    const latest = place.reviewHistory[0];
    const resolvedSnapshot = resolvePlaceReviewSnapshot(snapshot, latest);

    if (!resolvedSnapshot) {
      return NextResponse.json(
        {
          ok: false,
          message: `리뷰 파싱 실패: ${place.name}. 보존할 기존 스냅샷도 없습니다.`,
          reason: "REVIEW_SNAPSHOT_UNAVAILABLE",
          parsed: {
            visitorReviewCount: snapshot.visitorReviewCount,
            blogReviewCount: snapshot.blogReviewCount,
            saveCount: snapshot.saveCountText,
          },
        },
        { status: 422 }
      );
    }

    // ✅ 매장 이름 기준 검색량 — 성공·합계 > 0일 때만 갱신, 아니면 기존 DB 값 유지
    const volume = await getPlaceNameSearchVolume(place.name);
    const prevMobile = place.placeMobileVolume ?? 0;
    const prevPc = place.placePcVolume ?? 0;
    const prevTotal = place.placeMonthlyVolume ?? prevMobile + prevPc;
    const volTotal =
      (volume?.total ?? 0) ||
      (volume?.mobile ?? 0) + (volume?.pc ?? 0);
    const shouldUpdatePlaceVolume =
      volume?.ok === true && volTotal > 0;

    const placeMobileVolume = shouldUpdatePlaceVolume
      ? (volume?.mobile ?? 0)
      : prevMobile;
    const placePcVolume = shouldUpdatePlaceVolume
      ? (volume?.pc ?? 0)
      : prevPc;
    const placeMonthlyVolume = shouldUpdatePlaceVolume
      ? volTotal
      : prevTotal;

    if (!shouldUpdatePlaceVolume) {
      console.warn("[place-volume] keep previous volume (manual track)", {
        placeId,
        placeName: place.name,
        reason: volume?.reason,
        volTotal,
        previous: {
          total: place.placeMonthlyVolume,
          mobile: place.placeMobileVolume,
          pc: place.placePcVolume,
        },
        received: volume,
      });
    }

    const {
      visitorReviewCount,
      blogReviewCount,
      totalReviewCount,
      saveCount,
      retainedFields,
    } = resolvedSnapshot;

    if (retainedFields.length > 0) {
      console.warn("[place-review-track] keep previous parsed fields", {
        placeId,
        placeName: place.name,
        retainedFields,
        parsed: {
          visitorReviewCount: snapshot.visitorReviewCount,
          blogReviewCount: snapshot.blogReviewCount,
          saveCount: snapshot.saveCountText,
        },
      });
    }

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
      retainedFields,
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

    await prisma.place.update({
      where: { id: placeId },
      data: {
        placeMobileVolume,
        placePcVolume,
        placeMonthlyVolume,
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
        retainedFields,
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
