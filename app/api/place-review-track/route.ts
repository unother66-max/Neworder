import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import { getPlaceNameSearchVolume } from "@/lib/getPlaceNameSearchVolume";

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

function describeSnapshotFailure(reason: string): string {
  if (reason === "NAVER_BLOCKED_OR_CAPTCHA") {
    return "네이버 요청 차단 또는 캡차가 감지되었습니다";
  }
  if (reason === "NAVER_COOLDOWN") {
    return "네이버 요청 제한으로 잠시 후 다시 확인이 필요합니다";
  }
  if (reason === "REVIEW_METRICS_INCOMPLETE") {
    return "최신 리뷰 수치 일부를 확인하지 못했습니다";
  }
  if (reason === "PUBLIC_PLACE_ID_MISSING") {
    return "네이버 플레이스 ID를 확인하지 못했습니다";
  }
  return "최신 리뷰 데이터를 수집하지 못했습니다";
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
      category: place.category ? String(place.category) : "",
      x: place.x ? String(place.x) : "",
      y: place.y ? String(place.y) : "",
      force: true,
    });

    const latest = place.reviewHistory[0];
    if (
      !snapshot.ok ||
      snapshot.visitorReviewCount === null ||
      snapshot.blogReviewCount === null ||
      snapshot.saveCountText === null
    ) {
      const reason = snapshot.reason ?? "REVIEW_SNAPSHOT_UNAVAILABLE";
      const debugReason = snapshot.debugReason ?? reason;
      console.warn("[place-review-track] fresh snapshot unavailable", {
        placeId,
        placeName: place.name,
        reason,
        debugReason,
        hintType: snapshot.hintType,
        chosenType: snapshot.chosenType,
        triedTypes: snapshot.triedTypes,
        cacheStatus: snapshot.cacheStatus,
        parsed: {
          visitorReviewCount: snapshot.visitorReviewCount,
          blogReviewCount: snapshot.blogReviewCount,
          saveCount: snapshot.saveCountText,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          message: `${describeSnapshotFailure(reason)}: ${place.name}. 기존 스냅샷은 변경하지 않았습니다.`,
          reason,
          debugReason,
          hintType: snapshot.hintType,
          chosenType: snapshot.chosenType,
          triedTypes: snapshot.triedTypes,
          cacheStatus: snapshot.cacheStatus,
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

    const visitorReviewCount = snapshot.visitorReviewCount;
    const blogReviewCount = snapshot.blogReviewCount;
    const totalReviewCount = visitorReviewCount + blogReviewCount;
    const saveCount = snapshot.saveCountText;

    const registeredKeywordsStatus =
      snapshot.registeredKeywordsStatus ?? snapshot.keywordListStatus;
    const freshRegisteredKeywords =
      snapshot.registeredKeywords ?? snapshot.keywordList;
    const keywords =
      registeredKeywordsStatus === "AVAILABLE"
        ? (freshRegisteredKeywords ?? [])
        : (latest?.keywords ?? []);

    const trackedDate = getKstDateString();

    console.log("[review upsert]", {
      placeId,
      trackedDate,
      totalReviewCount,
      visitorReviewCount,
      blogReviewCount,
      saveCount,
      keywords,
      registeredKeywordsStatus,
      cacheStatus: snapshot.cacheStatus,
      chosenType: snapshot.chosenType,
      triedTypes: snapshot.triedTypes,
      debugReason: snapshot.debugReason,
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
      reason: snapshot.reason,
      debugReason: snapshot.debugReason,
      hintType: snapshot.hintType,
      chosenType: snapshot.chosenType,
      triedTypes: snapshot.triedTypes,
      data,
      date: trackedDate,
      parsed: {
        totalReviewCount,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
        keywords,
        registeredKeywordsStatus,
        retainedFields: [],
        cacheStatus: snapshot.cacheStatus,
        chosenType: snapshot.chosenType,
        triedTypes: snapshot.triedTypes,
        debugReason: snapshot.debugReason,
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
