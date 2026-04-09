import { NextRequest, NextResponse } from "next/server";

function isAllowedImageHost(hostname: string) {
  const allowedHosts = [
    "search.pstatic.net",
    "ldb-phinf.pstatic.net",
    "phinf.pstatic.net",
    "panorama.map.naver.com",
  ];

  return allowedHosts.includes(hostname);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url");

    if (!rawUrl) {
      return NextResponse.json(
        { error: "url 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    let targetUrl = rawUrl.trim();

    // //search.pstatic.net/... 형태 대응
    if (targetUrl.startsWith("//")) {
      targetUrl = `https:${targetUrl}`;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json(
        { error: "올바른 이미지 URL이 아닙니다." },
        { status: 400 }
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: "http/https URL만 허용됩니다." },
        { status: 400 }
      );
    }

    // search.pstatic.net/common?...src=... 형태면 src 파라미터의 실제 원본 URL로 교체
    if (parsedUrl.hostname === "search.pstatic.net") {
      const srcParam = parsedUrl.searchParams.get("src");
      if (srcParam) {
        try {
          const decoded = decodeURIComponent(srcParam);
          const innerUrl = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
          if (["http:", "https:"].includes(innerUrl.protocol) && isAllowedImageHost(innerUrl.hostname)) {
            parsedUrl = innerUrl;
          }
        } catch {
          // src 파싱 실패 시 원본 URL 그대로 사용
        }
      }
    }

    // 보안상 네이버/피스타틱 관련 호스트만 허용
    if (!isAllowedImageHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "허용되지 않은 이미지 호스트입니다." },
        { status: 403 }
      );
    }

    const finalUrl = parsedUrl.toString();
    console.log(`[place-image] fetching: ${finalUrl}`);

    const imageResponse = await fetch(finalUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://m.place.naver.com/",
      },
      cache: "force-cache",
    });

    if (!imageResponse.ok) {
      console.error(`[place-image] fetch failed: ${imageResponse.status} url=${finalUrl}`);
      return NextResponse.json(
        { error: `이미지 요청 실패: ${imageResponse.status}` },
        { status: imageResponse.status }
      );
    }

    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "이미지 응답이 아닙니다." },
        { status: 400 }
      );
    }

    const buffer = await imageResponse.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    console.error("[place-image] error:", error);

    return NextResponse.json(
      { error: "이미지 프록시 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}