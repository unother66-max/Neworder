type ReviewSnapshot = {
  totalReviewCount: number | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCountText: string | null;
};

function toNumber(value: string | null | undefined) {
  if (!value) return null;
  const only = String(value).replace(/[^\d]/g, "");
  if (!only) return null;
  const num = Number(only);
  return Number.isFinite(num) ? num : null;
}

function normalizeUrl(placeUrl: string) {
  return placeUrl.replace(/\/+$/, "");
}

function buildVisitorReviewUrl(placeUrl: string) {
  const normalized = normalizeUrl(placeUrl);

  if (normalized.includes("/review/visitor")) {
    return normalized;
  }

  return normalized.replace(/\/home(?:\?.*)?$/, "/review/visitor?entry=ple&reviewSort=recent");
}

function buildHomeUrl(placeUrl: string) {
  const normalized = normalizeUrl(placeUrl);

  if (normalized.includes("/review/visitor")) {
    return normalized.replace(/\/review\/visitor.*$/, "/home");
  }

  return normalized.replace(/\?.*$/, "");
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://m.place.naver.com/",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`네이버 페이지 요청 실패: ${res.status}`);
  }

  return res.text();
}

function pickFirstNumber(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const matched = html.match(pattern);
    if (matched?.[1]) {
      const num = toNumber(matched[1]);
      if (num !== null) return num;
    }
  }
  return null;
}

function extractVisitorReviewCount(html: string) {
  return pickFirstNumber(html, [
    /방문자\s*리뷰[^0-9]{0,20}([0-9][0-9,]*)/i,
    /방문자리뷰[^0-9]{0,20}([0-9][0-9,]*)/i,
    /([0-9][0-9,]*)[^가-힣]{0,10}방문자\s*리뷰/i,
    /([0-9][0-9,]*)[^가-힣]{0,10}방문자리뷰/i,
    /"visitorReviewCount"\s*:\s*"?([0-9][0-9,]*)"?/i,
    /"name"\s*:\s*"방문자리뷰"[^}]{0,80}"count"\s*:\s*"?([0-9][0-9,]*)"?/i,
    /"count"\s*:\s*"?([0-9][0-9,]*)"?[^}]{0,80}"name"\s*:\s*"방문자리뷰"/i,
  ]);
}

function extractBlogReviewCount(html: string) {
  return pickFirstNumber(html, [
    /블로그\s*리뷰[^0-9]{0,20}([0-9][0-9,]*)/i,
    /블로그리뷰[^0-9]{0,20}([0-9][0-9,]*)/i,
    /([0-9][0-9,]*)[^가-힣]{0,10}블로그\s*리뷰/i,
    /([0-9][0-9,]*)[^가-힣]{0,10}블로그리뷰/i,
    /"blogReviewCount"\s*:\s*"?([0-9][0-9,]*)"?/i,
    /"name"\s*:\s*"블로그리뷰"[^}]{0,80}"count"\s*:\s*"?([0-9][0-9,]*)"?/i,
    /"count"\s*:\s*"?([0-9][0-9,]*)"?[^}]{0,80}"name"\s*:\s*"블로그리뷰"/i,
  ]);
}

function extractSaveCount(html: string) {
  const num = pickFirstNumber(html, [
    /저장[^0-9]{0,20}([0-9][0-9,]*)/i,
    /([0-9][0-9,]*)[^가-힣]{0,10}저장/i,
    /"saveCount"\s*:\s*"?([0-9][0-9,]*)"?/i,
    /"savedCount"\s*:\s*"?([0-9][0-9,]*)"?/i,
  ]);

  if (num === null) return null;
  return `${num}+`;
}

export async function getNaverPlaceReviewSnapshot(
  placeUrl: string
): Promise<ReviewSnapshot> {
  const homeUrl = buildHomeUrl(placeUrl);
  const visitorUrl = buildVisitorReviewUrl(placeUrl);

  const [homeHtml, visitorHtml] = await Promise.allSettled([
    fetchHtml(homeUrl),
    fetchHtml(visitorUrl),
  ]);

  const home =
    homeHtml.status === "fulfilled" ? homeHtml.value : "";
  const visitor =
    visitorHtml.status === "fulfilled" ? visitorHtml.value : "";

  const merged = `${home}\n${visitor}`;

  const visitorReviewCount =
    extractVisitorReviewCount(visitor) ??
    extractVisitorReviewCount(home) ??
    extractVisitorReviewCount(merged);

  const blogReviewCount =
    extractBlogReviewCount(visitor) ??
    extractBlogReviewCount(home) ??
    extractBlogReviewCount(merged);

  const saveCountText =
    extractSaveCount(home) ??
    extractSaveCount(visitor) ??
    extractSaveCount(merged);

  const totalReviewCount =
    visitorReviewCount !== null || blogReviewCount !== null
      ? (visitorReviewCount ?? 0) + (blogReviewCount ?? 0)
      : null;

  return {
    totalReviewCount,
    visitorReviewCount,
    blogReviewCount,
    saveCountText,
  };
}