export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function extractPlaceIdFromLink(link: string) {
  if (!link) return null;

  const patterns = [
    /\/entry\/place\/(\d+)/i,
    /place\/(\d+)/i,
    /id=(\d+)/i,
    /placeId=(\d+)/i,
    /businessId=(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeImageUrl(url: string) {
  if (!url) return "";

  const decoded = decodeHtmlEntities(url)
    .replace(/\\u002F/g, "/")
    .replace(/\\/g, "")
    .trim();

  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    return decoded;
  }

  if (decoded.startsWith("//")) {
    return `https:${decoded}`;
  }

  return decoded;
}

function isUsableImageUrl(url?: string) {
  if (!url) return false;

  const trimmed = url.trim().toLowerCase();

  return (
    trimmed.includes("search.pstatic.net/common?") ||
    trimmed.includes("search.pstatic.net/common/?") ||
    trimmed.includes("ldb-phinf.pstatic.net") ||
    trimmed.includes("phinf.pstatic.net")
  );
}

async function fetchHtml(url: string) {
  if (!url || !url.trim()) {
    throw new Error("fetchHtml url이 비어있습니다.");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Referer: "https://www.naver.com/",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
    cache: "no-store",
  });

  const html = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    finalUrl: response.url || url,
    html,
  };
}

async function resolvePlaceId(link: string) {
  const normalizedLink = normalizeLink(link);

  if (!normalizedLink) return null;

  const directPlaceId = extractPlaceIdFromLink(normalizedLink);
  if (directPlaceId) return directPlaceId;

  try {
    const result = await fetchHtml(normalizedLink);

    if (!result.ok) return null;

    const fromFinalUrl = extractPlaceIdFromLink(result.finalUrl);
    if (fromFinalUrl) return fromFinalUrl;

    const fromHtml = extractPlaceIdFromLink(result.html);
    if (fromHtml) return fromHtml;

    return null;
  } catch (error) {
    console.error("resolvePlaceId error:", error);
    return null;
  }
}

function collectImageCandidates(html: string) {
  const results = new Set<string>();

  const add = (value?: string) => {
    if (!value) return;
    const normalized = normalizeImageUrl(value);
    if (!normalized) return;
    if (isUsableImageUrl(normalized)) {
      results.add(normalized);
    }
  };

  const metaPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/gi,
  ];

  for (const pattern of metaPatterns) {
    for (const match of html.matchAll(pattern)) {
      add(match[1]);
    }
  }

  const jsonPatterns = [
    /"image"\s*:\s*"([^"]+)"/gi,
    /"thumbnail"\s*:\s*"([^"]+)"/gi,
    /"thumbnailUrl"\s*:\s*"([^"]+)"/gi,
    /"imageUrl"\s*:\s*"([^"]+)"/gi,
    /"originalUrl"\s*:\s*"([^"]+)"/gi,
    /"shareImage"\s*:\s*"([^"]+)"/gi,
    /"businessImage"\s*:\s*"([^"]+)"/gi,
    /"mainImage"\s*:\s*"([^"]+)"/gi,
    /"commonImageUrl"\s*:\s*"([^"]+)"/gi,
    /"representImage"\s*:\s*"([^"]+)"/gi,
    /"photoUrl"\s*:\s*"([^"]+)"/gi,
  ];

  for (const pattern of jsonPatterns) {
    for (const match of html.matchAll(pattern)) {
      add(match[1]);
    }
  }

  const searchPstaticMatches =
    html.match(/https:\/\/search\.pstatic\.net\/common\/\?[^"'\\\s<]+/gi) || [];
  for (const match of searchPstaticMatches) add(match);

  const ldbMatches =
    html.match(/https?:\/\/(?:ldb-phinf|phinf)\.pstatic\.net\/[^"'\\\s<]+/gi) ||
    [];
  for (const match of ldbMatches) add(match);

  return Array.from(results);
}

function pickBestImage(candidates: string[]) {
  if (!candidates.length) return "";

  const score = (url: string) => {
    const lower = url.toLowerCase();
    let value = 0;

    if (lower.includes("ldb-phinf.pstatic.net")) value += 100;
    if (lower.includes("phinf.pstatic.net")) value += 80;
    if (lower.includes("search.pstatic.net/common/?")) value += 60;
    if (lower.includes("src=https%3a%2f%2fldb-phinf.pstatic.net")) value += 40;
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) value += 10;

    return value;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0] || "";
}

async function fetchPlaceImage(placeId: string) {
  try {
    const urls = [
      `https://m.place.naver.com/place/${placeId}/home`,
      `https://m.place.naver.com/place/${placeId}`,
      `https://pcmap.place.naver.com/restaurant/${placeId}/home`,
    ];

    for (const url of urls) {
      try {
        const result = await fetchHtml(url);
        if (!result.ok) continue;

        const candidates = collectImageCandidates(result.html);
        const image = pickBestImage(candidates);

        if (image) return image;
      } catch (error) {
        console.error("fetchPlaceImage url error:", url, error);
      }
    }

    return "";
  } catch (error) {
    console.error("fetchPlaceImage error:", error);
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
          const placeId = item.link ? await resolvePlaceId(item.link) : null;
          const image = placeId ? await fetchPlaceImage(placeId) : "";

          return {
            ...item,
            image: image || "",
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