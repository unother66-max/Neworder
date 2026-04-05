export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function normalizeImageUrl(url: string) {
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

async function fetchHtml(url: string) {
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

function guessJibunAddressFromRoadAddress(address: string) {
  const cleaned = cleanupAddress(address);
  if (!cleaned) return "";

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 3) return "";

  const district = parts[1] || "";
  const token = parts[2] || "";

  // 이미 동/읍/면/리면 그때만 사용
  if (
    token.endsWith("동") ||
    token.endsWith("읍") ||
    token.endsWith("면") ||
    token.endsWith("리")
  ) {
    return [district, token].filter(Boolean).join(" ").trim();
  }

  // 도로명은 억지로 ~동 만들지 않음
  return "";
}

function buildFallbackLinks(name: string, address = "") {
  const query = String(name || "").trim();
  const encoded = encodeURIComponent(query);

  return {
    placeId: "",
    mobilePlaceLink: `https://m.map.naver.com/search2/search.naver?query=${encoded}`,
    pcPlaceLink: `https://map.naver.com/p/search/${encoded}`,
    image: "",
    jibunAddress: guessJibunAddressFromRoadAddress(address),
    x: null,
    y: null,
  };
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

async function pickBestPublicPlaceId(name: string, address: string) {
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
        const result = await fetchHtml(url);
        if (!result.ok) continue;

        const decodedHtml = decodeHtmlEntities(result.html);
        const normalizedHtml = normalizeText(decodedHtml);

        const normalizedName = normalizeText(trimmedName);
        const normalizedAddress = normalizeText(trimmedAddress);

        const candidateIds = extractCandidateIds(decodedHtml);

        console.log("🔥 query:", query);
        console.log("🔥 candidateIds:", candidateIds);

        if (!candidateIds.length) continue;

        if (normalizedName && normalizedHtml.includes(normalizedName)) {
          if (normalizedAddress && normalizedHtml.includes(normalizedAddress)) {
            console.log("🔥 공개 placeId 찾음(이름+주소):", candidateIds[0]);
            return candidateIds[0];
          }

          console.log("🔥 공개 placeId 찾음(이름 기준):", candidateIds[0]);
          return candidateIds[0];
        }

        console.log("🔥 공개 placeId 찾음(후보 첫번째):", candidateIds[0]);
        return candidateIds[0];
      } catch (error) {
        console.error("pickBestPublicPlaceId error:", error);
      }
    }
  }

  return "";
}

async function fetchPlaceImage(publicPlaceId: string) {
  const urls = [
    `https://m.place.naver.com/restaurant/${publicPlaceId}/home`,
    `https://m.place.naver.com/place/${publicPlaceId}/home`,
    `https://pcmap.place.naver.com/restaurant/${publicPlaceId}/home`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchHtml(url);
      if (!result.ok) continue;

      const match =
        result.html.match(/https:\/\/ldb-phinf\.pstatic\.net\/[^"'\\\s]+/i) ||
        result.html.match(
          /https:\/\/search\.pstatic\.net\/common\/\?[^"'\\\s]+/i
        );

      if (match?.[0]) {
        const image = normalizeImageUrl(match[0]);
        if (image && !image.includes("panorama")) {
          console.log("🔥 이미지 찾음:", image);
          return image;
        }
      }
    } catch (error) {
      console.error("fetchPlaceImage error:", error);
    }
  }

  return "";
}

function cleanupAddress(value: string) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJibunAddressFromHtml(html: string) {
  const decoded = cleanupAddress(html);

  const patterns = [
    /"jibunAddress"\s*:\s*"([^"]+)"/i,
    /"lotNumberAddress"\s*:\s*"([^"]+)"/i,
    /"addressOld"\s*:\s*"([^"]+)"/i,
    /지번\s*주소[^가-힣0-9]*([가-힣0-9\s\-]+(?:동|읍|면|리)[^"<\n]*)/i,
    /지번[^가-힣0-9]*([가-힣0-9\s\-]+(?:동|읍|면|리)[^"<\n]*)/i,
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    const value = cleanupAddress(match?.[1] || "");
    if (value) return value;
  }

  return "";
}

async function fetchJibunAddress(publicPlaceId: string, address: string) {
  const urls = [
    `https://m.place.naver.com/restaurant/${publicPlaceId}/home`,
    `https://m.place.naver.com/place/${publicPlaceId}/home`,
    `https://pcmap.place.naver.com/restaurant/${publicPlaceId}/home`,
    `https://pcmap.place.naver.com/place/${publicPlaceId}/home`,
  ];

  for (const url of urls) {
    try {
      const result = await fetchHtml(url);
      if (!result.ok) continue;

      const jibun = extractJibunAddressFromHtml(result.html);
      if (jibun) {
        console.log("🔥 지번주소 찾음(html):", jibun);
        return jibun;
      }
    } catch (error) {
      console.error("fetchJibunAddress error:", error);
    }
  }

  const guessed = guessJibunAddressFromRoadAddress(address);
  if (guessed) {
    console.log("🔥 지번주소 추정값 사용:", guessed);
  }

  return guessed;
}

async function fetchPlaceCoords(publicPlaceId: string) {
  const urls = [
    `https://m.place.naver.com/restaurant/${publicPlaceId}/home`,
    `https://m.place.naver.com/place/${publicPlaceId}/home`,
    `https://pcmap.place.naver.com/restaurant/${publicPlaceId}/home`,
    `https://pcmap.place.naver.com/place/${publicPlaceId}/home`,
  ];

  const patterns = [
    /"x"\s*:\s*"([^"]+)".*?"y"\s*:\s*"([^"]+)"/is,
    /"y"\s*:\s*"([^"]+)".*?"x"\s*:\s*"([^"]+)"/is,
    /"longitude"\s*:\s*"([^"]+)".*?"latitude"\s*:\s*"([^"]+)"/is,
    /"longitude"\s*:\s*([0-9.]+).*?"latitude"\s*:\s*([0-9.]+)/is,
    /"x"\s*:\s*([0-9.]+).*?"y"\s*:\s*([0-9.]+)/is,
  ];

  for (const url of urls) {
    try {
      const result = await fetchHtml(url);
      if (!result.ok) continue;

      const html = result.html;

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (!match) continue;

        let x = "";
        let y = "";

        if (pattern.source.includes('"y"\\s*:\\s*"([^"]+)".*?"x"')) {
          y = String(match[1] || "").trim();
          x = String(match[2] || "").trim();
        } else {
          x = String(match[1] || "").trim();
          y = String(match[2] || "").trim();
        }

        if (x && y) {
          console.log("🔥 좌표 찾음:", { x, y });
          return { x, y };
        }
      }
    } catch (error) {
      console.error("fetchPlaceCoords error:", error);
    }
  }

  return { x: "", y: "" };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const address = String(body.address || "").trim();

    if (!name) {
      return Response.json(
        { error: "name이 필요합니다." },
        { status: 400 }
      );
    }

    const publicPlaceId = await pickBestPublicPlaceId(name, address);

    if (!publicPlaceId) {
      return Response.json(buildFallbackLinks(name, address));
    }

    const [image, jibunAddress, coords] = await Promise.all([
      fetchPlaceImage(publicPlaceId),
      fetchJibunAddress(publicPlaceId, address),
      fetchPlaceCoords(publicPlaceId),
    ]);

    return Response.json({
      placeId: publicPlaceId,
      mobilePlaceLink: `https://m.place.naver.com/restaurant/${publicPlaceId}/home`,
      pcPlaceLink: `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`,
      image: image || "",
      jibunAddress: jibunAddress || "",
      x: coords.x || null,
      y: coords.y || null,
    });
  } catch (error) {
    console.error("resolve-place-link error:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "플레이스 링크 확인 중 오류가 났어요.",
      },
      { status: 500 }
    );
  }
}