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

    // 보안상 네이버/피스타틱 관련 호스트만 허용
    if (!isAllowedImageHost(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "허용되지 않은 이미지 호스트입니다." },
        { status: 403 }
      );
    }

    const imageResponse = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        Accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: "https://map.naver.com/",
      },
      cache: "force-cache",
    });

    if (!imageResponse.ok) {
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