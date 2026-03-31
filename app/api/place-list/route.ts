import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const places = await prisma.place.findMany({
      orderBy: {
        createdAt: "desc",
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

    return Response.json({
      ok: true,
      places,
    });
  } catch (error) {
    console.error("place-list error:", error);

    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "매장 목록 불러오기 실패",
      },
      { status: 500 }
    );
  }
}