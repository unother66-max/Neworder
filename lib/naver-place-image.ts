function decodeHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value: string) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractCandidateIds(html: string) {
  const ids = new Set<string>();

  const patterns = [
    /https?:\/\/m\.place\.naver\.com\/restaurant\/(\d+)\/home/gi,
    /https?:\/\/m\.place\.naver\.com\/place\/(\d+)\/home/gi,
    /https?:\\\/\\\/m\.place\.naver\.com\\\/restaurant\\\/(\d+)\\\/home/gi,
    /https?:\\\/\\\/m\.place\.naver\.com\\\/place\\\/(\d+)\\\/home/gi,
    /\/restaurant\/(\d+)\/home/gi,
    /\/place\/(\d+)\/home/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (match?.[1]) ids.add(match[1]);
    }
  }

  return Array.from(ids);
}

/**
 * resolve-place-link와 동일한 placeId 탐색 로직.
 * name + address 기준으로 Naver 지도 검색 후 공개 placeId를 반환.
 */
export async function fetchNaverPublicPlaceId(
  name: string,
  address: string
): Promise<string> {
  const trimmedName = String(name || "").trim();
  const trimmedAddress = String(address || "").trim();

  if (!trimmedName) return "";

  const queries = [
    trimmedName,
    [trimmedName, trimmedAddress].filter(Boolean).join(" "),
  ];

  for (const query of queries) {
    const encoded = encodeURIComponent(query);

    const candidateUrls = [
      `https://m.map.naver.com/search2/search.naver?query=${encoded}`,
      `https://m.search.naver.com/search.naver?query=${encoded}`,
    ];

    for (const url of candidateUrls) {
      try {
        const result = await fetchNaverPlaceHtml(url);
        if (!result.ok) continue;

        const decodedHtml = decodeHtmlEntities(result.html);
        const normalizedHtml = normalizeText(decodedHtml);
        const normalizedName = normalizeText(trimmedName);
        const normalizedAddress = normalizeText(trimmedAddress);
        const candidateIds = extractCandidateIds(decodedHtml);

        if (!candidateIds.length) continue;

        if (normalizedName && normalizedHtml.includes(normalizedName)) {
          if (normalizedAddress && normalizedHtml.includes(normalizedAddress)) {
            console.log(`[naver-place-image] placeId(이름+주소): ${candidateIds[0]}`);
            return candidateIds[0];
          }
          console.log(`[naver-place-image] placeId(이름): ${candidateIds[0]}`);
          return candidateIds[0];
        }

        console.log(`[naver-place-image] placeId(첫번째 후보): ${candidateIds[0]}`);
        return candidateIds[0];
      } catch (error) {
        console.error("[naver-place-image] fetchNaverPublicPlaceId error:", error);
      }
    }
  }

  return "";
}

export function normalizeNaverImageUrl(url: string): string {
  if (!url) return "";

  const decoded = decodeHtmlEntities(url)
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
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

export async function fetchNaverPlaceHtml(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://map.naver.com/",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
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

/**
 * resolve-place-link와 동일한 이미지 추출 로직.
 * ldb-phinf.pstatic.net 또는 search.pstatic.net/common URL을 반환.
 */
export async function fetchNaverPlaceImage(placeId: string): Promise<string> {
  const urls = [
    `https://m.place.naver.com/restaurant/${placeId}/home`,
    `https://m.place.naver.com/place/${placeId}/home`,
    `https://pcmap.place.naver.com/restaurant/${placeId}/home`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchNaverPlaceHtml(url);
      if (!result.ok) continue;

      const match =
        result.html.match(/https:\/\/ldb-phinf\.pstatic\.net\/[^"'\\\s]+/i) ||
        result.html.match(
          /https:\/\/search\.pstatic\.net\/common\/\?[^"'\\\s]+/i
        );

      if (match?.[0]) {
        const image = normalizeNaverImageUrl(match[0]);
        if (image && !image.includes("panorama")) {
          console.log(`[naver-place-image] found placeId=${placeId} => ${image}`);
          return image;
        }
      }
    } catch (error) {
      console.error(`[naver-place-image] error placeId=${placeId} url=${url}`, error);
    }
  }

  console.warn(`[naver-place-image] no image found for placeId=${placeId}`);
  return "";
}
