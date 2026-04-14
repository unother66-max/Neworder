/**
 * smartstore.naver.com 전용: naver.com → smartstore 루트 → 상품 URL 순 진입 후 메타 추출.
 * 재시도 3단계: (1) 기본 컨텍스트 (2) 동일 브라우저·새 컨텍스트 (3) headless 끄고 1컨텍스트, 가능할 때만.
 *
 * 반차단(빈 NEXT_DATA) 완화: initScript·라우트·마우스/스크롤·시그널 대기 후에만 extract 호출.
 */
import { chromium } from "playwright";
import { extractProductMeta } from "./extractMeta.mjs";
import {
  SMARTSTORE_ANTI_DETECT_INIT,
  smartstoreBrowserContextOptions,
} from "./smartstore-host.mjs";

const GOTO_MS = 55_000;
const DOM_SIGNAL_TIMEOUT_MS = 10_000;

/** 상품 DOM 대기 전에 감지하면 즉시 실패 (보안 확인·시스템 오류 HTML) */
const NAVER_SECURITY_OR_ERROR_MARKERS = [
  "NAVER 보안 확인",
  "보안 확인을 완료해 주세요",
  "가게 전화번호",
];

// "시스템오류/에러페이지"는 일시적 429일 수 있어서 Abort 하지 말고 재시도한다.
const NAVER_RETRYABLE_ERROR_MARKERS = ["에러페이지 - 시스템오류", "[에러페이지] 에러페이지"];

const CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function logSmartstore(stage, data) {
  console.log(`[smartstore-scraper][smartstore-only] ${stage}`, data);
}

function metaScore(ex) {
  if (!ex) return -1;
  let s = 0;
  if (ex.name?.trim()) s += 4;
  if (ex.imageUrl?.trim()) s += 4;
  if (ex.category?.trim()) s += 1;
  return s;
}

/**
 * @param {string | null} pageTitle
 * @param {string} bodyHead1000
 * @returns {{ detected: boolean, matchedMarker: string | null }}
 */
function detectNaverSecurityOrErrorPage(pageTitle, bodyHead1000) {
  const title = String(pageTitle || "").trim();
  const body = String(bodyHead1000 || "").trim();
  const combined = `${title}\n${body}`;
  for (const m of NAVER_RETRYABLE_ERROR_MARKERS) {
    if (combined.includes(m)) {
      return { detected: true, matchedMarker: m, retryable: true };
    }
  }
  for (const m of NAVER_SECURITY_OR_ERROR_MARKERS) {
    if (combined.includes(m)) {
      return { detected: true, matchedMarker: m, retryable: false };
    }
  }
  return { detected: false, matchedMarker: null, retryable: false };
}

/**
 * @param {import('playwright').Page} page
 */
async function collectTitleAndBodyHead(page) {
  let pageTitle = null;
  let bodyHead1000 = "";
  try {
    pageTitle = await page.title();
  } catch {
    pageTitle = null;
  }
  try {
    const t = await page.evaluate(() => document.body?.innerText?.slice(0, 1000) || "");
    bodyHead1000 = String(t || "").replace(/\s+/g, " ").trim();
  } catch {
    try {
      bodyHead1000 = (await page.content()).slice(0, 1000).replace(/\s+/g, " ").trim();
    } catch {
      bodyHead1000 = "";
    }
  }
  return { pageTitle, bodyHead1000 };
}

function pickNavHeaders(response) {
  if (!response || typeof response.headers !== "function") {
    return { server: null, location: null, contentType: null };
  }
  try {
    const h = response.headers();
    return {
      server: h.server ?? h.Server ?? null,
      location: h.location ?? h.Location ?? null,
      contentType: h["content-type"] ?? h["Content-Type"] ?? null,
    };
  } catch {
    return { server: null, location: null, contentType: null };
  }
}

function pickBestExtracted(attempts) {
  let best = null;
  for (const a of attempts) {
    if (!a?.extracted) continue;
    if (!best || metaScore(a.extracted) > metaScore(best)) best = a.extracted;
  }
  return best;
}

function attemptLooksBlocked(row) {
  if (!row) return true;
  const st = row.navStatus;
  if (st === 490 || (st != null && st >= 400 && st < 500)) return true;
  if (row.domSignalTimeout) return true;
  if (row.error && !row.extracted) return true;
  if (!row.extracted) return true;
  const ex = row.extracted;
  if (ex.errorPageLikely) return true;
  const hints = ex.extractDebug?.blockHints || [];
  if (hints.includes("captcha_like") || hints.includes("captcha_iframe")) return true;
  const weak = !ex.name?.trim() && !ex.imageUrl?.trim();
  if (weak && hints.length) return true;
  const hay = (row.bodyHead1000 || "").toLowerCase();
  if (
    /captcha|캡차|ncaptcha|자동입력\s*방지|비정상\s*접근|접근이\s*거부|490|429/.test(
      hay
    )
  ) {
    return true;
  }
  return false;
}

function isExtractSuccess(row) {
  if (!row?.extracted) return false;
  if (row.extracted.errorPageLikely) return false;
  if (row.error) return false;
  if (row.domSignalTimeout) return false;
  const st = row.navStatus;
  if (st === 490 || (st != null && st >= 400)) return false;
  return metaScore(row.extracted) > 0;
}

async function collectFailureDiagnostics(page, navResponse) {
  const { pageTitle, bodyHead1000 } = await collectTitleAndBodyHead(page);
  return {
    pageTitle,
    bodyHead1000,
    responseHeaders: pickNavHeaders(navResponse),
  };
}

function logFailureDetail(label, row, extra = {}) {
  const ex = row?.extracted;
  logSmartstore("failure_detail", {
    label,
    최종url: row?.finalUrl,
    status: row?.navStatus,
    title: row?.pageTitle,
    body앞1000자: row?.bodyHead1000,
    blockHints: ex?.extractDebug?.blockHints ?? [],
    responseHeaders: row?.responseHeaders,
    navTrail: row?.navTrail,
    domSignalTimeout: row?.domSignalTimeout,
    detectedSecurityPage: row?.detectedSecurityPage,
    error: row?.error,
    ...extra,
  });
}

/**
 * @param {object} p
 */
function buildSecurityPageAbortRow(p) {
  const {
    label,
    nav,
    page,
    navTrail,
    navStatus,
    contentType,
    pageTitle,
    bodyHead1000,
    matchedMarker,
  } = p;
  const responseHeaders = pickNavHeaders(nav);
  const row = {
    label,
    error: "SMARTSTORE_SECURITY_PAGE",
    securityOrErrorPage: true,
    detectedSecurityPage: true,
    matchedSecurityMarker: matchedMarker ?? null,
    domSignalTimeout: false,
    finalUrl: typeof page.url === "function" ? page.url() : "",
    navStatus,
    contentType: contentType ?? responseHeaders.contentType,
    navTrail,
    pageTitle,
    bodyHead1000,
    responseHeaders,
    extracted: null,
    rawSampleHead: String(bodyHead1000 || "").slice(0, 900),
  };
  logSmartstore("security_or_error_page", {
    label,
    navStatus,
    pageTitle,
    bodyHead1000,
    detectedSecurityPage: true,
    matchedSecurityMarker: matchedMarker,
  });
  logFailureDetail(label, row, { reason: "security_or_error_page" });
  return row;
}

function buildRetryableErrorRow(p) {
  const {
    label,
    nav,
    page,
    navTrail,
    navStatus,
    contentType,
    pageTitle,
    bodyHead1000,
    matchedMarker,
  } = p;
  const responseHeaders = pickNavHeaders(nav);
  const row = {
    label,
    error: "SMARTSTORE_RETRYABLE_ERROR_PAGE",
    securityOrErrorPage: true,
    detectedSecurityPage: false,
    matchedSecurityMarker: matchedMarker ?? null,
    domSignalTimeout: false,
    finalUrl: typeof page.url === "function" ? page.url() : "",
    navStatus,
    contentType: contentType ?? responseHeaders.contentType,
    navTrail,
    pageTitle,
    bodyHead1000,
    responseHeaders,
    extracted: null,
    rawSampleHead: String(bodyHead1000 || "").slice(0, 900),
  };
  logSmartstore("retryable_error_page", {
    label,
    navStatus,
    pageTitle,
    bodyHead1000,
    matchedMarker,
  });
  logFailureDetail(label, row, { reason: "retryable_error_page" });
  return row;
}

function isSecurityPageAbortRow(row) {
  return row?.error === "SMARTSTORE_SECURITY_PAGE";
}

function buildReturn(attempts, primaryRow, productUrl) {
  const extracted =
    primaryRow?.extracted ??
    pickBestExtracted(attempts) ??
    null;
  return {
    attempts,
    extracted,
    finalUrl: primaryRow?.finalUrl ?? productUrl,
    navStatus: primaryRow?.navStatus ?? null,
    contentType: primaryRow?.contentType ?? null,
    rawSampleHead: primaryRow?.rawSampleHead ?? "",
  };
}

/** 이미지·CSS·폰트·스크립트는 유지. ping·일부 추적만 끊어 너무 가볍지 않게 유지 */
async function installSmartstoreRoutes(page) {
  await page.route("**/*", (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = req.url().toLowerCase();

    if (type === "document") return route.continue();
    if (type === "stylesheet") return route.continue();
    if (type === "script") return route.continue();
    if (type === "image") return route.continue();
    if (type === "font") return route.continue();
    if (type === "media") return route.continue();
    if (type === "xhr" || type === "fetch") return route.continue();
    if (type === "websocket") return route.continue();
    if (type === "manifest") return route.continue();

    if (type === "ping") return route.abort();

    if (
      type === "other" &&
      (url.includes("googletagmanager.com") ||
        url.includes("google-analytics.com") ||
        url.includes("doubleclick.net") ||
        url.includes("facebook.net/tr"))
    ) {
      return route.abort();
    }

    return route.continue();
  });
}

async function reinforceNavigatorInPage(page) {
  await page.evaluate(() => {
    try {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
        configurable: true,
      });
    } catch (e) {
      /* ignore */
    }
    try {
      if (!window.chrome) {
        window.chrome = {
          runtime: {},
          loadTimes() {},
          csi() {},
          app: {},
        };
      }
    } catch (e) {
      /* ignore */
    }
  });
}

/** 마우스·휠·랜덤 대기 — evaluate(추출) 직전에만 호출 */
async function humanLikeInteraction(page, label) {
  const vw = 1440;
  const vh = 900;
  const moves = randInt(3, 5);
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(randInt(120, vw - 120), randInt(100, vh - 100), {
      steps: randInt(10, 24),
    });
    await sleep(randInt(90, 280));
  }
  const wheels = randInt(2, 4);
  for (let w = 0; w < wheels; w++) {
    await page.mouse.wheel(0, randInt(150, 550));
    await sleep(randInt(220, 480));
  }
  const dwell = randInt(2000, 5000);
  logSmartstore("human_interaction_done", { label, moves, wheels, dwellMs: dwell });
  await sleep(dwell);
}

/**
 * __NEXT_DATA__에 실제 상품 JSON 흔적이 있거나, 상품 이미지 CDN이 뜰 때까지 대기
 */
async function waitForProductDomSignals(page, label) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById("__NEXT_DATA__");
      const t = el?.textContent?.trim() || "";
      if (t.length >= 400) {
        if (
          /product|Product|dispName|representImage|productImages|smartstore/i.test(
            t
          )
        ) {
          return true;
        }
      }
      const imgs = document.querySelectorAll("img[src]");
      for (const img of imgs) {
        const s = (img.getAttribute("src") || "").toLowerCase();
        if (
          s.includes("pstatic.net") ||
          s.includes("shop-phinf") ||
          s.includes("navercdn") ||
          s.includes("shopping-phinf")
        ) {
          return true;
        }
      }
      return false;
    },
    { timeout: DOM_SIGNAL_TIMEOUT_MS }
  );
  logSmartstore("dom_signals_ok", { label });
}

/**
 * www.naver.com → smartstore.naver.com → 상품 URL → 대기 → 추출
 */
async function navigateChainAndExtract(browser, productUrl, label) {
  const cookie = String(process.env.NAVER_COOKIE || process.env.SMARTSTORE_COOKIE || "").trim();
  const ctx = await browser.newContext(smartstoreBrowserContextOptions({ cookie }));
  await ctx.addInitScript(SMARTSTORE_ANTI_DETECT_INIT);

  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(GOTO_MS);

  const navTrail = [];
  let nav = null;
  let navStatus = null;
  let contentType = null;
  let finalUrl = productUrl;
  let rawSample = "";

  const pushTrail = (step, url) => {
    navTrail.push({ step, url: url || null });
  };

  try {
    await installSmartstoreRoutes(page);

    pushTrail("start", null);

    await page.goto("https://www.naver.com/", {
      waitUntil: "domcontentloaded",
      timeout: 18_000,
    });
    pushTrail("after_naver_com", page.url());
    await sleep(randInt(400, 950));

    // smartstore 루트는 sell로 새는 케이스가 있어 shopping 루트로 워밍업
    await page.goto("https://shopping.naver.com/", {
      waitUntil: "domcontentloaded",
      timeout: 18_000,
    });
    pushTrail("after_shopping_root", page.url());
    await sleep(randInt(400, 950));

    nav = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_MS,
    });
    navStatus = nav?.status?.() ?? null;
    try {
      if (nav && typeof nav.headers === "function") {
        const h = nav.headers();
        contentType = h["content-type"] || h["Content-Type"] || null;
      }
    } catch {
      /* ignore */
    }
    finalUrl = page.url();
    pushTrail("after_product_goto", finalUrl);

    await sleep(randInt(350, 800));
    {
      const quick = await collectTitleAndBodyHead(page);
      const sec = detectNaverSecurityOrErrorPage(quick.pageTitle, quick.bodyHead1000);
      if (sec.detected) {
        if (sec.retryable) {
          return buildRetryableErrorRow({
            label,
            nav,
            page,
            navTrail,
            navStatus,
            contentType,
            pageTitle: quick.pageTitle,
            bodyHead1000: quick.bodyHead1000,
            matchedMarker: sec.matchedMarker,
          });
        }
        return buildSecurityPageAbortRow({
          label,
          nav,
          page,
          navTrail,
          navStatus,
          contentType,
          pageTitle: quick.pageTitle,
          bodyHead1000: quick.bodyHead1000,
          matchedMarker: sec.matchedMarker,
        });
      }
    }

    await sleep(randInt(900, 2200));

    await reinforceNavigatorInPage(page);

    await humanLikeInteraction(page, label);

    {
      const mid = await collectTitleAndBodyHead(page);
      const sec2 = detectNaverSecurityOrErrorPage(mid.pageTitle, mid.bodyHead1000);
      if (sec2.detected) {
        if (sec2.retryable) {
          return buildRetryableErrorRow({
            label,
            nav,
            page,
            navTrail,
            navStatus,
            contentType,
            pageTitle: mid.pageTitle,
            bodyHead1000: mid.bodyHead1000,
            matchedMarker: sec2.matchedMarker,
          });
        }
        return buildSecurityPageAbortRow({
          label,
          nav,
          page,
          navTrail,
          navStatus,
          contentType,
          pageTitle: mid.pageTitle,
          bodyHead1000: mid.bodyHead1000,
          matchedMarker: sec2.matchedMarker,
        });
      }
    }

    try {
      await waitForProductDomSignals(page, label);
    } catch (e) {
      const diag = await collectFailureDiagnostics(page, nav);
      const secFail = detectNaverSecurityOrErrorPage(diag.pageTitle, diag.bodyHead1000);
      if (secFail.detected) {
        if (secFail.retryable) {
          return buildRetryableErrorRow({
            label,
            nav,
            page,
            navTrail,
            navStatus,
            contentType,
            pageTitle: diag.pageTitle,
            bodyHead1000: diag.bodyHead1000,
            matchedMarker: secFail.matchedMarker,
          });
        }
        return buildSecurityPageAbortRow({
          label,
          nav,
          page,
          navTrail,
          navStatus,
          contentType,
          pageTitle: diag.pageTitle,
          bodyHead1000: diag.bodyHead1000,
          matchedMarker: secFail.matchedMarker,
        });
      }
      logSmartstore("dom_signal_timeout", {
        label,
        finalUrl,
        err: e?.message,
        timeoutMs: DOM_SIGNAL_TIMEOUT_MS,
        navStatus,
        pageTitle: diag.pageTitle,
        bodyHead1000: diag.bodyHead1000,
        detectedSecurityPage: false,
      });
      const responseHeaders = pickNavHeaders(nav);
      const row = {
        label,
        error: "SMARTSTORE_DOM_SIGNAL_TIMEOUT",
        domSignalTimeout: true,
        detectedSecurityPage: false,
        finalUrl: page.url(),
        navStatus,
        contentType: contentType ?? responseHeaders.contentType,
        navTrail,
        pageTitle: diag.pageTitle,
        bodyHead1000: diag.bodyHead1000,
        responseHeaders,
        extracted: null,
        rawSampleHead: "",
      };
      logFailureDetail(label, row, { reason: "no_next_data_or_product_image" });
      return row;
    }

    await sleep(randInt(600, 1400));

    try {
      rawSample = (await page.content()).slice(0, 2500);
    } catch {
      rawSample = "";
    }

    const extracted = await extractProductMeta(page, { isSmartstore: true });
    const diag = await collectFailureDiagnostics(page, nav);
    const responseHeaders = pickNavHeaders(nav);
    const ct = contentType ?? responseHeaders.contentType;

    const compact = rawSample.replace(/\s+/g, " ").trim().slice(0, 900);
    const row = {
      label,
      navStatus,
      contentType: ct,
      finalUrl,
      extracted,
      rawSampleHead: compact,
      navTrail,
      pageTitle: diag.pageTitle,
      bodyHead1000: diag.bodyHead1000,
      responseHeaders,
      domSignalTimeout: false,
    };

    logSmartstore("attempt_done", {
      label,
      navStatus,
      contentType: ct,
      finalUrl,
      navTrail변화: row.navTrail.map((x) => `${x.step}→${x.url}`),
      responseHeaders: row.responseHeaders,
      pageTitle: row.pageTitle,
      bodyHead1000: row.bodyHead1000,
      detectedSecurityPage: false,
      hasName: Boolean(extracted.name?.trim()),
      hasImage: Boolean(extracted.imageUrl?.trim()),
      hasCategory: Boolean(extracted.category?.trim()),
      hasNextData: extracted.extractDebug?.hasNextData,
      blockHints: extracted.extractDebug?.blockHints,
      errorPageLikely: extracted.errorPageLikely,
    });

    const secPost = detectNaverSecurityOrErrorPage(row.pageTitle, row.bodyHead1000);
    if (secPost.detected) {
      if (secPost.retryable) {
        return buildRetryableErrorRow({
          label,
          nav,
          page,
          navTrail,
          navStatus,
          contentType: ct,
          pageTitle: row.pageTitle,
          bodyHead1000: row.bodyHead1000,
          matchedMarker: secPost.matchedMarker,
        });
      }
      return buildSecurityPageAbortRow({
        label,
        nav,
        page,
        navTrail,
        navStatus,
        contentType: ct,
        pageTitle: row.pageTitle,
        bodyHead1000: row.bodyHead1000,
        matchedMarker: secPost.matchedMarker,
      });
    }

    if (attemptLooksBlocked(row) || extracted.errorPageLikely) {
      logFailureDetail(label, row);
    }

    return row;
  } catch (e) {
    logSmartstore("attempt_throw", { label, message: e?.message });
    let diag = { pageTitle: null, bodyHead1000: "", responseHeaders: {} };
    try {
      diag = await collectFailureDiagnostics(page, nav);
    } catch {
      /* ignore */
    }
    const secThrow = detectNaverSecurityOrErrorPage(diag.pageTitle, diag.bodyHead1000);
    if (secThrow.detected) {
      if (secThrow.retryable) {
        return buildRetryableErrorRow({
          label,
          nav,
          page,
          navTrail,
          navStatus,
          contentType,
          pageTitle: diag.pageTitle,
          bodyHead1000: diag.bodyHead1000,
          matchedMarker: secThrow.matchedMarker,
        });
      }
      return buildSecurityPageAbortRow({
        label,
        nav,
        page,
        navTrail,
        navStatus,
        contentType,
        pageTitle: diag.pageTitle,
        bodyHead1000: diag.bodyHead1000,
        matchedMarker: secThrow.matchedMarker,
      });
    }
    const row = {
      label,
      error: String(e?.message || e),
      finalUrl: typeof page.url === "function" ? page.url() : productUrl,
      navStatus,
      navTrail,
      pageTitle: diag.pageTitle,
      bodyHead1000: diag.bodyHead1000,
      responseHeaders: diag.responseHeaders,
      extracted: null,
      detectedSecurityPage: false,
    };
    logFailureDetail(label, row, { thrown: true });
    return row;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * @param {string} productUrl
 */
export async function runSmartstoreExtract(productUrl) {
  const attempts = [];

  logSmartstore("tier_start", {
    단계: 1,
    headless: true,
    설명: "기본_context",
  });
  let browser = await chromium.launch({
    headless: true,
    args: CHROMIUM_ARGS,
  });
  try {
    const r1 = await navigateChainAndExtract(browser, productUrl, "s1_ctx1_default");
    attempts.push(r1);
    if (isSecurityPageAbortRow(r1)) {
      return buildReturn(attempts, r1, productUrl);
    }
    if (isExtractSuccess(r1)) {
      return buildReturn(attempts, r1, productUrl);
    }

    logSmartstore("tier_start", {
      단계: 2,
      headless: true,
      설명: "동일브라우저_새_context_page",
    });
    const r2 = await navigateChainAndExtract(browser, productUrl, "s2_ctx2_fresh");
    attempts.push(r2);
    if (isSecurityPageAbortRow(r2)) {
      return buildReturn(attempts, r2, productUrl);
    }
    if (isExtractSuccess(r2)) {
      return buildReturn(attempts, r2, productUrl);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  logSmartstore("tier_start", {
    단계: 3,
    headless: false,
    설명: "headless_off_재시도_가능시",
  });
  try {
    browser = await chromium.launch({
      headless: false,
      args: CHROMIUM_ARGS,
    });
  } catch (e) {
    logSmartstore("tier3_headful_launch_skipped", { err: e?.message });
    const last = attempts[attempts.length - 1];
    return buildReturn(attempts, last, productUrl);
  }

  try {
    const r3 = await navigateChainAndExtract(browser, productUrl, "s3_headful_ctx1");
    attempts.push(r3);
    if (isSecurityPageAbortRow(r3)) {
      return buildReturn(attempts, r3, productUrl);
    }
    if (isExtractSuccess(r3)) {
      return buildReturn(attempts, r3, productUrl);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const last = attempts[attempts.length - 1];
  return buildReturn(attempts, last, productUrl);
}
