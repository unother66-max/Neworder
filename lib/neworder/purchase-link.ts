const COUPANG_ANDROID_PACKAGE = "com.coupang.mobile";

function isCoupangHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === "coupang.com" ||
    normalizedHostname.endsWith(".coupang.com") ||
    normalizedHostname === "coupa.ng" ||
    normalizedHostname.endsWith(".coupa.ng")
  );
}

export function isAndroidUserAgent(userAgent: string) {
  return /android/i.test(userAgent);
}

export function isCoupangPurchaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      isCoupangHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

export function buildAndroidCoupangIntentUrl(
  value: string,
  userAgent: string
) {
  if (!isAndroidUserAgent(userAgent) || !isCoupangPurchaseUrl(value)) {
    return null;
  }

  const url = new URL(value);
  const intentTarget = `${url.host}${url.pathname}${url.search}`;

  return (
    `intent://${intentTarget}` +
    `#Intent;scheme=https;package=${COUPANG_ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(value)};end`
  );
}
