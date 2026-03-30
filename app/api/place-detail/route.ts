import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json(
        { error: "id가 없습니다." },
        { status: 400 }
      );
    }

    const place = await prisma.place.findUnique({
      where: { id },
      include: {
        keywords: {
          orderBy: { createdAt: "asc" },
          include: {
            histories: {
              orderBy: { checkedAt: "desc" },
            },
          },
        },
      },
    });

    if (!place) {
      return NextResponse.json(
        { error: "매장을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ place });
  } catch (error) {
    console.error("place-detail error", error);
    return NextResponse.json(
      { error: "매장 상세 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}