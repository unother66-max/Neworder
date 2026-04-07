import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

    const totalReviewCount = Math.floor(Math.random() * 2000) + 200;
    const visitorReviewCount = Math.floor(totalReviewCount * 0.45);
    const blogReviewCount = totalReviewCount - visitorReviewCount;
    const saveCount = `${Math.floor(Math.random() * 30000) + 1000}+`;
    const keywords = ["맛집", "분위기", "데이트", "가성비", "친절"];

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
    });
  } catch (error) {
    console.error("place-review-track error:", error);

    return NextResponse.json(
      { ok: false, message: "리뷰 추적 저장 실패" },
      { status: 500 }
    );
  }
}