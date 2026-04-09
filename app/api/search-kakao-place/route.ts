export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KakaoDocument = {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  phone: string;
  place_url: string;
  x: string;
  y: string;
};

async function fetchKakaoPlaceImage(kakaoId: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://place.map.kakao.com/${kakaoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);
    if (!res.ok) return "";

    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = String(body.query || "").trim();

    if (!query) {
      return Response.json({ items: [] });
    }

    const apiKey = process.env.KAKAO_REST_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "KAKAO_REST_API_KEY가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`;

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return Response.json(
        { error: `카카오 장소 검색 API 호출 실패: ${response.status} / ${text}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const docs: KakaoDocument[] = data.documents || [];

    const images = await Promise.all(docs.map((doc) => fetchKakaoPlaceImage(doc.id)));

    const items = docs.map((doc, i) => ({
      kakaoId: doc.id,
      title: doc.place_name,
      category: doc.category_name,
      address: doc.road_address_name || doc.address_name,
      kakaoUrl: doc.place_url,
      x: doc.x,
      y: doc.y,
      image: images[i] ?? "",
    }));

    return Response.json({ items });
  } catch (error) {
    console.error("search-kakao-place error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "카카오 매장 검색 중 오류가 났어요." },
      { status: 500 }
    );
  }
}
