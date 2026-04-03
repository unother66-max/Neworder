import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const placeKeywordId = String(body.placeKeywordId || "").trim();

    if (!placeKeywordId) {
      return Response.json(
        { ok: false, error: "placeKeywordId가 없습니다." },
        { status: 400 }
      );
    }

    await prisma.placeKeyword.delete({
      where: {
        id: placeKeywordId,
      },
    });

    return Response.json({
      ok: true,
      message: "키워드가 삭제되었습니다.",
    });
  } catch (error) {
    console.error("place-keyword-delete error:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "키워드 삭제 실패",
      },
      { status: 500 }
    );
  }
}