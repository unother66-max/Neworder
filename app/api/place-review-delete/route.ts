import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return Response.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();

    if (!placeId) {
      return Response.json(
        { ok: false, error: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    const deleted = await prisma.place.deleteMany({
      where: {
        id: placeId,
        userId,
        type: "review",
      },
    });

    return Response.json({
      ok: true,
      deletedCount: deleted.count,
      message: "리뷰 매장이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("place-review-delete error:", error);

    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "리뷰 매장 삭제 실패",
      },
      { status: 500 }
    );
  }
}