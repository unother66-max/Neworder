import { prisma } from "@/lib/prisma";

/** Chrome 147 — 스마트스토어 Naver fetch 전역 통일 */
export const SMARTSTORE_UNIFIED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

/** zstd 제외 — 디코딩/프록시 이슈 회피 */
export const SMARTSTORE_UNIFIED_ACCEPT_ENCODING = "gzip, deflate, br";

export const SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE =
  "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7";

export function naverProductPageOrigin(productPageUrl: string): string {
  try {
    const h = new URL(productPageUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (h === "smartstore.naver.com") return "https://smartstore.naver.com";
    if (h === "brand.naver.com") return "https://brand.naver.com";
  } catch {
    /* ignore */
  }
  return "https://brand.naver.com";
}

export function secFetchSiteForNaver(productPageUrl: string, requestUrl: string): string {
  try {
    const p = new URL(productPageUrl);
    const a = new URL(requestUrl);
    if (p.origin === a.origin) return "same-origin";
    const pn = p.hostname.toLowerCase();
    const an = a.hostname.toLowerCase();
    if (pn.endsWith("naver.com") && an.endsWith("naver.com")) return "same-site";
  } catch {
    /* ignore */
  }
  return "cross-site";
}

/**
 * `m.smartstore.naver.com` JSON API 전용 (리뷰 product-summary 등).
 * Host/Origin/Referer m. 통일, Sec-Fetch-Site same-origin, 헤더 경량화(UA·Cookie·Accept 중심).
 */
export function buildSmartstoreUnifiedJsonFetchHeaders(
  productId: string,
  naverCookie: string
): Record<string, string> {
  return {
    Host: "m.smartstore.naver.com",
    Accept: "application/json, text/plain, */*",
    "User-Agent": SMARTSTORE_UNIFIED_USER_AGENT,
    Origin: "https://m.smartstore.naver.com",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: `https://m.smartstore.naver.com/products/${productId}`,
    "Accept-Encoding": SMARTSTORE_UNIFIED_ACCEPT_ENCODING,
    "Accept-Language": SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
    Cookie: naverCookie,
  };
}

/**
 * 동일 브라우저 지문; 요청 Host·Origin·Referer·Sec-Fetch-Site는 URL·상품 페이지에 맞춤
 * (brand.naver.com / smartstore.naver.com 교차 API).
 */
export function buildNaverJsonFetchHeadersUnified(input: {
  productId: string;
  naverCookie: string;
  productPageUrl: string;
  requestUrl: string;
}): Record<string, string> {
  const { productId, naverCookie, productPageUrl, requestUrl } = input;
  let host = "smartstore.naver.com";
  try {
    host = new URL(requestUrl).hostname;
  } catch {
    /* keep default */
  }

  let referer = productPageUrl;
  try {
    const u = new URL(productPageUrl);
    if (
      u.hostname.toLowerCase().replace(/^www\./, "") === "smartstore.naver.com" &&
      productId
    ) {
      referer = `https://m.smartstore.naver.com/products/${productId}`;
    }
  } catch {
    /* keep productPageUrl */
  }

  let origin = naverProductPageOrigin(productPageUrl);
  let secFetchSite = secFetchSiteForNaver(productPageUrl, requestUrl);
  try {
    const rh = new URL(requestUrl).hostname.toLowerCase();
    if (rh === "m.smartstore.naver.com") {
      origin = "https://m.smartstore.naver.com";
      secFetchSite = "same-origin";
    }
  } catch {
    /* keep computed */
  }

  return {
    Host: host,
    Accept: "application/json, text/plain, */*",
    "User-Agent": SMARTSTORE_UNIFIED_USER_AGENT,
    Origin: origin,
    "Sec-Fetch-Site": secFetchSite,
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: referer,
    "Accept-Encoding": SMARTSTORE_UNIFIED_ACCEPT_ENCODING,
    "Accept-Language": SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
    Cookie: naverCookie,
  };
}

/** m.smartstore / m.brand HTML GET — UA·Encoding·쿠키와 m. 리퍼러 정합 */
export function buildSmartstoreMobileDocumentFetchHeaders(input: {
  mobileUrl: string;
  normalizedProductUrl: string;
  productId: string | null;
  naverCookie: string;
}): Record<string, string> {
  const { mobileUrl, normalizedProductUrl, productId, naverCookie } = input;
  let host: string;
  try {
    host = new URL(mobileUrl).hostname;
  } catch {
    host = "m.smartstore.naver.com";
  }

  let referer = normalizedProductUrl;
  try {
    const u = new URL(normalizedProductUrl);
    if (
      u.hostname.toLowerCase().replace(/^www\./, "") === "smartstore.naver.com" &&
      productId
    ) {
      referer = `https://m.smartstore.naver.com/products/${productId}`;
    }
  } catch {
    /* */
  }

  const h: Record<string, string> = {
    Host: host,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Encoding": SMARTSTORE_UNIFIED_ACCEPT_ENCODING,
    "Accept-Language": SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
    Referer: referer,
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": SMARTSTORE_UNIFIED_USER_AGENT,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": secFetchSiteForNaver(normalizedProductUrl, mobileUrl),
    "Sec-Fetch-User": "?1",
  };
  if (naverCookie) {
    h.Cookie = naverCookie;
  }
  return h;
}

/** SystemConfig 우선, 없으면 env `NAVER_COOKIE` / `SMARTSTORE_COOKIE` */
export async function loadSystemConfigNaverCookie(): Promise<string> {
  try {
    const row = await (prisma as any).systemConfig.findUnique({
      where: { id: "global" },
      select: { naverCookie: true },
    });
    const fromDb = String(row?.naverCookie || "").trim();
    if (fromDb) return fromDb;
  } catch {
    /* ignore */
  }
  return (
    process.env.NAVER_COOKIE?.trim() ||
    process.env.SMARTSTORE_COOKIE?.trim() ||
    ""
  );
}
