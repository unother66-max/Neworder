/**
 * smartstore.naver.com 일반 상품 전용 Playwright 설정 (brand·shopping과 분리).
 */

export function isSmartstoreProductUrl(url) {
  try {
    const h = new URL(String(url).trim()).hostname.toLowerCase();
    const c = h.replace(/^www\./, "").replace(/^m\./, "");
    return c === "smartstore.naver.com";
  } catch {
    return /smartstore\.naver\.com/i.test(String(url));
  }
}

/** document 로드 전 주입: webdriver / languages / plugins 등 봇 탐지 완화 */
export const SMARTSTORE_ANTI_DETECT_INIT = `
(() => {
  try {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
      configurable: true,
    });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, "languages", {
      get: () => Object.freeze(["ko-KR", "ko", "en-US", "en"]),
      configurable: true,
    });
  } catch (e) {}
  try {
    const plugins = {
      0: { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
      1: { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
      2: { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
      length: 3,
      item(i) { return this[i] ?? null; },
      namedItem() { return null; },
      refresh() {},
    };
    Object.defineProperty(navigator, "plugins", {
      get: () => plugins,
      configurable: true,
    });
  } catch (e) {}
  try {
    if (!window.chrome) window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {}, app: {} };
  } catch (e) {}
})();
`;

/** 데스크톱 macOS Chrome 프로필 + 한국 로케일 (스마트스토어 차단 완화용) */
export function smartstoreBrowserContextOptions() {
  return {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    colorScheme: "light",
    extraHTTPHeaders: {
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://www.naver.com/",
      "Upgrade-Insecure-Requests": "1",
    },
  };
}
