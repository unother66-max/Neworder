export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body.query as string)?.trim();

    if (!query) {
      return Response.json({ items: [] });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return Response.json(
        { error: "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없습니다." },
        { status: 500 }
      );
    }

    const url =
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(
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
        { error: `네이버 지역 검색 API 호출 실패: ${response.status} / ${text}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    const items = (data.items || []).map((item: any) => ({
      title: String(item.title || "").replace(/<[^>]*>/g, ""),
      category: String(item.category || ""),
      address: String(item.roadAddress || item.address || ""),
      link: String(item.link || ""),
    }));

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