export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { fetchNaverPublicPlaceId, fetchNaverPlaceImage } from "@/lib/naver-place-image";

type SearchItem = {
  title: string;
  category: string;
  address: string;
  link: string;
  image: string;
};

function stripHtml(value: string) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

function normalizeLink(link: string) {
  if (!link) return "";
  if (link.startsWith("http://") || link.startsWith("https://")) return link;
  if (link.startsWith("//")) return `https:${link}`;
  if (link.startsWith("/")) return `https://map.naver.com${link}`;
  return `https://${link}`;
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = String(body.query || "").trim();

    if (!query) {
      return Response.json({ items: [] });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return Response.json(
        {
          error: "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없습니다.",
        },
        { status: 500 }
      );
    }

    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(
      query
    )}&display=5&start=1&sort=random`;

    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();

      return Response.json(
        {
          error: `네이버 지역 검색 API 호출 실패: ${response.status} / ${text}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const baseItems = (data.items || []).map((item: any) => ({
      title: stripHtml(item.title || ""),
      category: String(item.category || ""),
      address: String(item.roadAddress || item.address || ""),
      link: normalizeLink(String(item.link || "")),
    }));

    const items: SearchItem[] = await Promise.all(
      baseItems.map(async (item: SearchItem) => {
        try {
          const placeId = await fetchNaverPublicPlaceId(item.title, item.address);
          console.log(`[search-place] title="${item.title}" address="${item.address}" placeId=${placeId}`);
          const rawImage = placeId ? await fetchNaverPlaceImage(placeId) : "";
          const image = rawImage
            ? `/api/place-image?url=${encodeURIComponent(rawImage)}`
            : "";
          console.log(`[search-place] FINAL title="${item.title}" image="${image}"`);

          return {
            ...item,
            image,
          };
        } catch (error) {
          console.error("search-place item enrich error:", error);

          return {
            ...item,
            image: "",
          };
        }
      })
    );

    return Response.json({ items });
  } catch (error) {
    console.error("search-place error:", error);

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "매장 검색 중 오류가 났어요.",
      },
      { status: 500 }
    );
  }
}