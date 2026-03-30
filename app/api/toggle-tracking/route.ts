import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { placeKeywordId, isTracking } = body ?? {};

    if (!placeKeywordId || typeof isTracking !== "boolean") {
      return Response.json(
        { ok: false, message: "placeKeywordId와 isTracking이 필요합니다." },
        { status: 400 }
      );
    }

    const updated = await prisma.placeKeyword.update({
      where: { id: placeKeywordId },
      data: { isTracking },
    });

    return Response.json({
      ok: true,
      item: updated,
    });
  } catch (error) {
    console.error("toggle-tracking error:", error);
    return Response.json(
      { ok: false, message: "자동추적 상태 변경 실패" },
      { status: 500 }
    );
  }
}