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

    const items = (data.documents || []).map((doc: KakaoDocument) => ({
      kakaoId: doc.id,
      title: doc.place_name,
      category: doc.category_name,
      address: doc.road_address_name || doc.address_name,
      kakaoUrl: doc.place_url,
      x: doc.x,
      y: doc.y,
      image: "",
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
