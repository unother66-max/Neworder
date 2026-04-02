import { prisma } from "@/lib/prisma";

function toNumber(value: unknown) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  return 0;
}

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const placeId = searchParams.get("placeId") || searchParams.get("id");

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

    const normalizedKeywords = place.keywords.map((item) => {
      const keywordItem = item as any;

      const mobileVolume = toNumber(
        keywordItem.mobileVolume ?? keywordItem.mobile ?? 0
      );

      const pcVolume = toNumber(
        keywordItem.pcVolume ?? keywordItem.pc ?? 0
      );

      const totalVolume =
        toNumber(keywordItem.totalVolume) || mobileVolume + pcVolume;

      const updatedAtRaw =
        keywordItem.updatedAt ??
        keywordItem.checkedAt ??
        keywordItem.lastCheckedAt ??
        keywordItem.createdAt ??
        null;

      return {
        ...item,
        mobileVolume,
        pcVolume,
        totalVolume,
        monthlyVolume: totalVolume,
        updatedAt: updatedAtRaw,
        updatedAtText: formatUpdatedAt(updatedAtRaw),
      };
    });

    const latestUpdatedAtRaw = normalizedKeywords
      .map((item) => item.updatedAt)
      .filter(Boolean)
      .sort((a, b) => {
        return new Date(String(b)).getTime() - new Date(String(a)).getTime();
      })[0] ?? null;

    const latestUpdatedAtText = formatUpdatedAt(latestUpdatedAtRaw);

    return Response.json({
      ok: true,
      place: {
        ...place,
        keywords: normalizedKeywords,
        latestUpdatedAt: latestUpdatedAtRaw,
        latestUpdatedAtText,
      },
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