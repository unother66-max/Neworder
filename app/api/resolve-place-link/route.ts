export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { fetchNaverPlaceHtml, fetchNaverPlaceImage, fetchNaverPublicPlaceId } from "@/lib/naver-place-image";

function decodeHtmlEntities(value: string) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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
      const result = await fetchNaverPlaceHtml(url);
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
      const result = await fetchNaverPlaceHtml(url);
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

    const publicPlaceId = await fetchNaverPublicPlaceId(name, address);

    if (!publicPlaceId) {
      return Response.json(buildFallbackLinks(name, address));
    }

    const [image, jibunAddress, coords] = await Promise.all([
      fetchNaverPlaceImage(publicPlaceId),
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