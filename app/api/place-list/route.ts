import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";

function formatUpdatedAt(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

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

    const normalizedPlaces = await Promise.all(
      places.map(async (place) => {
        const latestUpdatedAt =
          [...place.keywords]
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )[0]?.updatedAt ?? null;

        let placeMonthlyVolume = 0;
        let placeMobileVolume = 0;
        let placePcVolume = 0;

        try {
          const placeSearchVolume = await getKeywordSearchVolume(place.name);
          placeMonthlyVolume = placeSearchVolume.total ?? 0;
          placeMobileVolume = placeSearchVolume.mobile ?? 0;
          placePcVolume = placeSearchVolume.pc ?? 0;
        } catch (volumeError) {
          console.error(
            `[place-list] 매장명 검색량 조회 실패: ${place.name}`,
            volumeError
          );
        }

        return {
          ...place,
          jibunAddress: (place as any).jibunAddress ?? null,
          latestUpdatedAt,
          latestUpdatedAtText: formatUpdatedAt(latestUpdatedAt),
          placeMonthlyVolume,
          placeMobileVolume,
          placePcVolume,
        };
      })
    );

    return Response.json({
      ok: true,
      places: normalizedPlaces,
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