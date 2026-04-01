import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const placeId =
      searchParams.get("placeId") || searchParams.get("id");

    if (!placeId) {
      return Response.json(
        { ok: false, message: "placeId가 없습니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: {
        id: placeId,
      },
      include: {
        keywords: {
          orderBy: {
            createdAt: "asc",
          },
        },
        rankHistory: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!place) {
      return Response.json(
        { ok: false, message: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      place,
    });
  } catch (error) {
    console.error("place-detail error:", error);

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "매장 상세 조회 실패",
      },
      { status: 500 }
    );
  }
}