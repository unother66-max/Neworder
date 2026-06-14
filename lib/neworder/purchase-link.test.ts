import { describe, expect, it } from "vitest";

import {
  buildAndroidCoupangIntentUrl,
  isAndroidUserAgent,
  isCoupangPurchaseUrl,
} from "./purchase-link";

const ANDROID_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";

describe("purchase link helpers", () => {
  it("detects Android without treating iPadOS as Android", () => {
    expect(isAndroidUserAgent(ANDROID_USER_AGENT)).toBe(true);
    expect(
      isAndroidUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe(false);
  });

  it.each([
    "https://coupang.com/vp/products/1",
    "https://www.coupang.com/vp/products/1",
    "https://link.coupang.com/a/test",
    "https://applink.coupang.com/a/test",
    "https://coupa.ng/test",
  ])("recognizes a Coupang purchase URL: %s", (url) => {
    expect(isCoupangPurchaseUrl(url)).toBe(true);
  });

  it("does not treat Naver links as Coupang links", () => {
    expect(
      isCoupangPurchaseUrl("https://smartstore.naver.com/postlabs/products/1")
    ).toBe(false);
  });

  it("keeps the original Coupang host, path, and query in the intent URL", () => {
    const originalUrl =
      "https://link.coupang.com/a/test?itemId=123&vendorItemId=456";

    expect(
      buildAndroidCoupangIntentUrl(originalUrl, ANDROID_USER_AGENT)
    ).toBe(
      `intent://link.coupang.com/a/test?itemId=123&vendorItemId=456` +
        `#Intent;scheme=https;package=com.coupang.mobile;` +
        `S.browser_fallback_url=${encodeURIComponent(originalUrl)};end`
    );
  });

  it("returns null outside Android so the existing link behavior is preserved", () => {
    expect(
      buildAndroidCoupangIntentUrl(
        "https://www.coupang.com/vp/products/1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
      )
    ).toBeNull();
  });
});
