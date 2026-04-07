type ReviewSnapshot = {
  totalReviewCount: number | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCountText: string | null;
};

function extractPublicPlaceId(placeUrl?: string | null) {
  if (!placeUrl) return "";

  const matched =
    placeUrl.match(/restaurant\/(\d+)/) ||
    placeUrl.match(/place\/(\d+)/) ||
    placeUrl.match(/placeId=(\d+)/) ||
    placeUrl.match(/entry\/place\/(\d+)/);

  return matched?.[1] ?? "";
}

function buildReviewUrls(publicPlaceId: string) {
  return {
    mobileHomeUrl: `https://m.place.naver.com/restaurant/${publicPlaceId}/home`,
    mobileVisitorReviewUrl: `https://m.place.naver.com/restaurant/${publicPlaceId}/review/visitor?entry=ple&reviewSort=recent`,
    pcEntryUrl: `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`,
  };
}

function parseKoreanNumber(value: string | null | undefined) {
  if (!value) return null;

  const raw = String(value).replace(/,/g, "").trim();
  if (!raw) return null;

  if (/^\d+\+$/.test(raw)) {
    return Number(raw.replace("+", ""));
  }

  const manMatch = raw.match(/^(\d+(?:\.\d+)?)만$/);
  if (manMatch) {
    return Math.round(Number(manMatch[1]) * 10000);
  }

  const cheonMatch = raw.match(/^(\d+(?:\.\d+)?)천$/);
  if (cheonMatch) {
    return Math.round(Number(cheonMatch[1]) * 1000);
  }

  const only = raw.replace(/[^\d.]/g, "");
  if (!only) return null;

  const num = Number(only);
  return Number.isFinite(num) ? num : null;
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://map.naver.com/",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return "";
  }

  return res.text();
}

function extractFromNextData(html: string) {
  try {
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );

    if (!match?.[1]) return null;

    const json = JSON.parse(match[1]);

    const candidates = [
      json?.props?.pageProps?.initialState?.entry,
      json?.props?.pageProps?.entry,
      json?.props?.pageProps?.place,
      json?.props?.pageProps?.bizInfo,
    ].filter(Boolean);

    for (const entry of candidates) {
      const visitorReviewCount =
        entry?.visitorReviewCount ??
        entry?.visitorReview?.total ??
        null;

      const blogReviewCount =
        entry?.blogReviewCount ??
        entry?.blogReview?.total ??
        null;

      const saveCount =
        entry?.saveCount ??
        entry?.savedCount ??
        null;

      if (
        visitorReviewCount !== null ||
        blogReviewCount !== null ||
        saveCount !== null
      ) {
        return {
          visitorReviewCount:
            typeof visitorReviewCount === "number"
              ? visitorReviewCount
              : parseKoreanNumber(String(visitorReviewCount)),
          blogReviewCount:
            typeof blogReviewCount === "number"
              ? blogReviewCount
              : parseKoreanNumber(String(blogReviewCount)),
          saveCount:
            typeof saveCount === "number"
              ? saveCount
              : parseKoreanNumber(String(saveCount)),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractCountByLabel(html: string, labels: string[]) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const patterns = [
      new RegExp(`${escaped}\\s*([0-9][0-9,]*(?:\\.\\d+)?(?:만|천)?\\+?)`, "i"),
      new RegExp(`([0-9][0-9,]*(?:\\.\\d+)?(?:만|천)?\\+?)\\s*${escaped}`, "i"),
    ];

    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (matched?.[1]) {
        const parsed = parseKoreanNumber(matched[1]);
        if (parsed !== null) return parsed;
      }
    }
  }

  return null;
}

export async function getNaverPlaceReviewSnapshot(
  placeUrl: string
): Promise<ReviewSnapshot> {
  try {
    const publicPlaceId = extractPublicPlaceId(placeUrl);

    if (!publicPlaceId) {
      return {
        totalReviewCount: null,
        visitorReviewCount: null,
        blogReviewCount: null,
        saveCountText: null,
      };
    }

    const urls = buildReviewUrls(publicPlaceId);

    const [homeHtml, visitorHtml, pcHtml] = await Promise.all([
      fetchHtml(urls.mobileHomeUrl),
      fetchHtml(urls.mobileVisitorReviewUrl),
      fetchHtml(urls.pcEntryUrl),
    ]);

    const nextDataParsed =
      extractFromNextData(homeHtml) ||
      extractFromNextData(visitorHtml) ||
      extractFromNextData(pcHtml);

    const visitorReviewCount =
      nextDataParsed?.visitorReviewCount ??
      extractCountByLabel(visitorHtml, ["방문자 리뷰", "방문자리뷰"]) ??
      extractCountByLabel(homeHtml, ["방문자 리뷰", "방문자리뷰"]) ??
      extractCountByLabel(pcHtml, ["방문자 리뷰", "방문자리뷰"]) ??
      null;

    const blogReviewCount =
      nextDataParsed?.blogReviewCount ??
      extractCountByLabel(visitorHtml, ["블로그 리뷰", "블로그리뷰"]) ??
      extractCountByLabel(homeHtml, ["블로그 리뷰", "블로그리뷰"]) ??
      extractCountByLabel(pcHtml, ["블로그 리뷰", "블로그리뷰"]) ??
      null;

    const saveCount =
      nextDataParsed?.saveCount ??
      extractCountByLabel(homeHtml, ["저장"]) ??
      extractCountByLabel(visitorHtml, ["저장"]) ??
      extractCountByLabel(pcHtml, ["저장"]) ??
      null;

    const totalReviewCount =
      visitorReviewCount !== null || blogReviewCount !== null
        ? (visitorReviewCount ?? 0) + (blogReviewCount ?? 0)
        : null;

    return {
      totalReviewCount,
      visitorReviewCount,
      blogReviewCount,
      saveCountText: saveCount !== null ? String(saveCount) : null,
    };
  } catch {
    return {
      totalReviewCount: null,
      visitorReviewCount: null,
      blogReviewCount: null,
      saveCountText: null,
    };
  }
}