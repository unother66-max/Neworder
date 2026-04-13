/**
 * map.naver.com 검색 페이지를 headless로 열어 allSearch 요청 URL에서 token을 추출합니다.
 * 서버(place-rank-analyze)에서 무토큰 차단 시 자동 폴백용.
 *
 * launch / goto / close 각각 상한을 두어 무한 대기를 막습니다.
 */

import type { Browser, BrowserContext } from "playwright-core";

const LOG_PREFIX = "[naver-map-playwright-token]";

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.stack || e.message;
  return String(e);
}

function parseLaunchTimeoutMs(): number {
  const raw = parseInt(
    String(process.env.NAVER_MAP_PLAYWRIGHT_LAUNCH_TIMEOUT_MS || "").trim(),
    10
  );
  if (Number.isFinite(raw) && raw >= 5_000 && raw <= 90_000) return raw;
  return 45_000;
}

async function launchBrowserUncapped(): Promise<{
  browser: Browser;
  launchLabel: string;
}> {
  const extraArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
  ];

  if (isVercelRuntime()) {
    const sparticuz = (await import("@sparticuz/chromium")).default as {
      args: string[];
      executablePath: () => Promise<string>;
      setGraphicsMode?: boolean;
    };
    sparticuz.setGraphicsMode = false;
    const { chromium: pwChromium } = await import("playwright-core");
    const executablePath = await sparticuz.executablePath();
    const mergedArgs = [...sparticuz.args];
    for (const a of extraArgs) {
      if (!mergedArgs.includes(a)) mergedArgs.push(a);
    }
    const browser = await pwChromium.launch({
      args: mergedArgs,
      executablePath,
      headless: true,
    });
    return { browser, launchLabel: "@sparticuz/chromium" };
  }

  const { chromium: pwChromium } = await import("playwright");
  const browser = (await pwChromium.launch({
    headless: true,
    args: extraArgs,
  })) as unknown as Browser;
  return { browser, launchLabel: "playwright-bundled" };
}

async function launchBrowser(): Promise<{
  browser: Browser;
  launchLabel: string;
}> {
  const ms = parseLaunchTimeoutMs();
  return await Promise.race([
    launchBrowserUncapped(),
    new Promise<never>((_, rej) =>
      setTimeout(
        () => rej(new Error(`playwright_launch_timeout_${ms}ms`)),
        ms
      )
    ),
  ]);
}

async function disposeContextAndBrowser(
  context: BrowserContext | undefined,
  browser: Browser | undefined
): Promise<void> {
  const closeContextMs = 8_000;
  const closeBrowserMs = 10_000;
  if (context) {
    await Promise.race([
      context.close().catch((e) => {
        console.warn(`${LOG_PREFIX} context.close`, errMsg(e));
      }),
      new Promise<void>((r) => setTimeout(r, closeContextMs)),
    ]);
  }
  if (browser) {
    await Promise.race([
      browser.close().catch((e) => {
        console.warn(`${LOG_PREFIX} browser.close`, errMsg(e));
      }),
      new Promise<void>((r) => setTimeout(r, closeBrowserMs)),
    ]);
  }
}

export function parseTokenFromAllSearchUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  if (!url.includes("allSearch")) return null;
  try {
    const u = new URL(url);
    const t = u.searchParams.get("token");
    if (t && String(t).length > 8) return String(t);
  } catch {
    return null;
  }
  return null;
}

export type CaptureNaverMapTokenResult = {
  token: string | null;
  launchLabel?: string;
  error?: string;
};

/**
 * @param keyword 검색어 — 지도 검색 URL과 동일하게 사용
 * @param opts.timeoutMs page.goto 상한(및 폴링 상한과 함께 쓰임)
 */
export async function captureNaverMapAllSearchToken(
  keyword: string,
  opts?: { timeoutMs?: number }
): Promise<CaptureNaverMapTokenResult> {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) {
    return { token: null, error: "keyword_empty" };
  }

  const gotoMs = Math.min(
    Math.max(opts?.timeoutMs ?? 42_000, 12_000),
    75_000
  );
  const pollBudgetMs = Math.min(gotoMs, 15_000);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let launchLabel: string | undefined;

  try {
    try {
      const launched = await launchBrowser();
      browser = launched.browser;
      launchLabel = launched.launchLabel;
    } catch (e) {
      const msg = errMsg(e);
      console.error(`${LOG_PREFIX} launch failed`, msg);
      return { token: null, error: `launch:${msg.slice(0, 200)}` };
    }

    const state = { token: null as string | null };
    const grab = (url: string) => {
      const t = parseTokenFromAllSearchUrl(url);
      if (t) state.token = t;
    };

    context = await browser.newContext({
      locale: "ko-KR",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    page.on("request", (req) => grab(req.url()));
    page.on("response", (res) => grab(res.url()));

    const searchUrl = `https://map.naver.com/p/search/${encodeURIComponent(trimmed)}?c=15.00,0,0,0,dh`;

    try {
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: gotoMs,
      });
    } catch (e) {
      console.warn(`${LOG_PREFIX} goto`, errMsg(e));
    }

    const pollUntil = Date.now() + pollBudgetMs;
    while (!state.token && Date.now() < pollUntil) {
      await new Promise((r) => setTimeout(r, 400));
    }

    const captured = state.token;
    if (captured) {
      console.log(`${LOG_PREFIX} ok`, {
        launchLabel,
        tokenLen: captured.length,
        keywordSample: trimmed.slice(0, 40),
      });
      return { token: captured, launchLabel };
    }

    console.warn(`${LOG_PREFIX} no token`, { launchLabel, keyword: trimmed });
    return { token: null, launchLabel, error: "no_token_in_network" };
  } finally {
    await disposeContextAndBrowser(context, browser);
  }
}

/**
 * map.naver.com 탭 컨텍스트에서 allSearch fetch — 세션 쿠키가 붙어 서버만 토큰 넣을 때보다
 * CE_TOKEN_REUSE 등 제한이 덜한 경우가 많음.
 */
export async function fetchAllSearchPlaywrightInPageDetailed(
  keyword: string,
  opts?: { timeoutMs?: number }
): Promise<
  import("./naver-map-all-search").FetchAllSearchCheckPlaceDetailedResult
> {
  const {
    interpretAllSearchJsonDetailed,
    userMessageForAllSearchFailure,
  } = await import("./naver-map-all-search");
  const { pickBusinessesCoords } = await import(
    "./naver-map-businesses-shared"
  );

  const trimmed = String(keyword || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      failureCode: "KEYWORD_EMPTY",
      userMessage: userMessageForAllSearchFailure("KEYWORD_EMPTY"),
    };
  }

  const gotoMs = Math.min(
    Math.max(opts?.timeoutMs ?? 48_000, 12_000),
    78_000
  );

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;

    const { x, y } = pickBusinessesCoords(trimmed);
    context = await browser.newContext({
      locale: "ko-KR",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const searchUrl = `https://map.naver.com/p/search/${encodeURIComponent(trimmed)}?c=15.00,0,0,0,dh`;

    try {
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: gotoMs,
      });
    } catch (e) {
      console.warn(`${LOG_PREFIX} in-page goto`, errMsg(e));
    }

    await new Promise((r) => setTimeout(r, 1_800));

    const evalResult = (await page.evaluate(
      async (args: { q: string; sx: string; sy: string }) => {
        const sc = `${args.sx};${args.sy}`;
        const boundary = `${sc};${sc}`;
        const u = `https://map.naver.com/p/api/search/allSearch?${new URLSearchParams({
          query: args.q,
          type: "all",
          searchCoord: sc,
          boundary,
          sscode: "svc.mapv5.search",
        }).toString()}`;
        const r = await fetch(u, { credentials: "include" });
        const text = await r.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          return {
            kind: "parse_err" as const,
            status: r.status,
            preview: text.slice(0, 500),
          };
        }
        return {
          kind: "ok" as const,
          status: r.status,
          httpOk: r.ok,
          json,
        };
      },
      { q: trimmed, sx: x, sy: y }
    )) as
      | { kind: "parse_err"; status: number; preview: string }
      | { kind: "ok"; status: number; httpOk: boolean; json: unknown };

    if (evalResult.kind === "parse_err") {
      console.warn(`${LOG_PREFIX} in-page JSON parse`, evalResult.preview?.slice(0, 120));
      return {
        ok: false,
        failureCode: "JSON_PARSE",
        userMessage: userMessageForAllSearchFailure("JSON_PARSE"),
      };
    }
    if (!evalResult.httpOk) {
      return {
        ok: false,
        failureCode: "HTTP_ERROR",
        userMessage: userMessageForAllSearchFailure("HTTP_ERROR"),
      };
    }

    const out = interpretAllSearchJsonDetailed(trimmed, evalResult.json, {
      url: "https://map.naver.com/p/api/search/allSearch#playwright",
      httpStatus: evalResult.status,
    });
    if (out.ok) {
      console.log(`${LOG_PREFIX} in-page allSearch ok`, {
        places: out.places.length,
        totalCount: out.totalCount,
      });
    } else {
      console.warn(`${LOG_PREFIX} in-page allSearch`, {
        failureCode: out.failureCode,
      });
    }
    return out;
  } catch (e) {
    console.error(`${LOG_PREFIX} in-page fatal`, errMsg(e));
    return {
      ok: false,
      failureCode: "HTTP_ERROR",
      userMessage: userMessageForAllSearchFailure("HTTP_ERROR"),
    };
  } finally {
    await disposeContextAndBrowser(context, browser);
  }
}

export function isNaverMapPlaywrightDisabled(): boolean {
  return String(process.env.NAVER_MAP_PLAYWRIGHT_DISABLE || "").trim() === "1";
}
