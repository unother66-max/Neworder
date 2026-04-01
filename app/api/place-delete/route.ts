import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return Response.json(
        { ok: false, error: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    await prisma.place.delete({
      where: {
        id: placeId,
      },
    });

    return Response.json({
      ok: true,
      message: "매장이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("place-delete error:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "매장 삭제 실패",
      },
      { status: 500 }
    );
  }
}