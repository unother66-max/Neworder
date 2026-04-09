import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatUpdatedAt(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export async function GET() {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    const userId = session?.user?.id as string | undefined;

    if (!userId) {
      return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 200 });
    }

    const places = await prisma.place.findMany({
      where: { userId, type: "kakao-rank" },
      orderBy: [{ createdAt: "desc" }],
    });

    const normalizedPlaces = places.map((place) => ({
      id: place.id,
      name: place.name,
      category: place.category ?? "",
      address: place.address ?? "",
      kakaoUrl: place.placeUrl ?? "",
      x: place.x ?? null,
      y: place.y ?? null,
      isAutoTracking: false,
      rankRows: [],
      latestUpdatedAt: formatUpdatedAt(place.updatedAt),
      createdAt: place.createdAt,
    }));

    return Response.json({ ok: true, places: normalizedPlaces });
  } catch (error) {
    console.error("kakao-place-list error:", error);
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "매장 목록 불러오기 실패" },
      { status: 500 }
    );
  }
}
