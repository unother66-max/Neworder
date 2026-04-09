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
      return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const placeId = String(body.placeId || "").trim();
    if (!placeId) {
      return Response.json({ ok: false, message: "placeId가 없습니다." }, { status: 400 });
    }

    const place = await prisma.place.findFirst({
      where: { id: placeId, userId, type: "kakao-place" },
    });
    if (!place) {
      return Response.json({ ok: false, message: "매장을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.place.delete({ where: { id: placeId } });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("kakao-keyword-place-delete error:", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제 실패" },
      { status: 500 }
    );
  }
}
