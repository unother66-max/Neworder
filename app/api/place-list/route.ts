import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return Response.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const places = await prisma.place.findMany({
      where: {
        userId,
      },
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