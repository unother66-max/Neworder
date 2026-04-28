import {
  cooldownOn429,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";
import {
  buildSmartstoreMobileDocumentFetchHeaders,
  loadSystemConfigNaverCookie,
} from "@/lib/naver-smartstore-unified-fetch-headers";
import { randomBytes } from "crypto";
import type { Browser, BrowserContext, Page } from "playwright-core";

const LOG_P = "[smartstore-review-fetcher]";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type SmartstoreReviewSummary = {
  reviewCount: number | null;
  reviewRating: number | null;
  photoVideoReviewCount: number | null;
  monthlyUseReviewCount: number | null;
  repurchaseReviewCount: number | null;
  storePickReviewCount: number | null;
  starScoreSummary: Record<"1" | "2" | "3" | "4" | "5", number> | null;
};

export type SmartstoreRecentReviewItem = {
  reviewKey: string;
  postedAt: Date | null;
  rating: number | null;
  author: string | null;
  content: string;
};

export type FetchSmartstoreReviewResult = {
  productPageUrl: string;
  summary: SmartstoreReviewSummary;
  recentReviews: SmartstoreRecentReviewItem[];
};

function safeNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function snipeReviewInfoFromHtml(html: string): Record<string, any> | null {
  try {
    // SEO 규격 데이터 및 네이버 변형 변수명 통합 탐색
    const countMatch =
      html.match(/"reviewCount"\s*:\s*"?(\d+)"?/i) ||
      html.match(/"totalReviewCount"\s*:\s*(\d+)/i) ||
      html.match(/"reviewAmount"\s*:\s*(\d+)/i);
    const scoreMatch =
      html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i) ||
      html.match(/"averageReviewScore"\s*:\s*([\d.]+)/i) ||
      html.match(/"reviewScore"\s*:\s*([\d.]+)/i);

    if (countMatch && countMatch[1]) {
      const reviewCount = Number(countMatch[1]);
      const averageReviewScore = scoreMatch && scoreMatch[1] ? Number(scoreMatch[1]) : 0;
      return { reviewCount, averageReviewScore };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function randomNnbCookieValue(): string {
  // NNB is typically 32 hex chars; we just need a non-empty, plausible identifier.
  return randomBytes(16).toString("hex");
}

function randomNidJklCookieValue(): string {
  return randomBytes(10).toString("base64");
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of h.entries()) out[k] = v;
  return out;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.stack || e.message;
  return String(e);
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

async function launchBrowser(): Promise<{ context: BrowserContext; launchLabel: string }> {
  const extraArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-blink-features=AutomationControlled",
  ];

  if (isVercelRuntime()) {
    const sparticuz = (await import("@sparticuz/chromium")).default as any;
    const { chromium: pwChromium } = await import("playwright-core");
    const executablePath = await sparticuz.executablePath();
    
    const browser = await pwChromium.launch({
      args: [...sparticuz.args, ...extraArgs],
      executablePath,
      headless: true,
    });
    
    // 💡 Vercel에서도 context를 만들어서 내보냅니다.
    const context = await browser.newContext({
      userAgent: DESKTOP_UA,
      viewport: { width: 1280, height: 800 }
    });
    
    return { context, launchLabel: "@sparticuz/chromium" };
  }

  // 로컬 환경 (소장님 맥북)
  const { chromium: pwChromium } = await import("playwright-core");
  const userDataDir = `/Users/mankind/Library/Application Support/Google/Chrome/Default`;

  const context = await pwChromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 800 },
  });

  return { context, launchLabel: "local-real-profile" };
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
        console.warn(`${LOG_P} context.close`, errMsg(e));
      }),
      new Promise<void>((r) => setTimeout(r, closeContextMs)),
    ]);
  }
  if (browser) {
    await Promise.race([
      browser.close().catch((e) => {
        console.warn(`${LOG_P} browser.close`, errMsg(e));
      }),
      new Promise<void>((r) => setTimeout(r, closeBrowserMs)),
    ]);
  }
}

function pickLeafCategoryIdFromProductUrl(productUrl: string): string | null {
  try {
    const u = new URL(productUrl);
    const v = u.searchParams.get("leafCategoryId");
    const t = v?.trim() || "";
    return t ? t : null;
  } catch {
    return null;
  }
}

function mapProductSummaryJsonToSummary(json: ProductSummaryApiJson): SmartstoreReviewSummary {
  function extractReviewInfo(input: any): any {
    if (!input || typeof input !== "object") return {};
    if (input.productReviewInfo) return input.productReviewInfo;
    if (input.contents?.productReviewInfo) return input.contents.productReviewInfo;
    if (input.contents?.reviews?.productSummary) return input.contents.reviews.productSummary;
    if ("reviewCount" in input || "averageReviewScore" in input) return input;
    return {};
  }

  const info = extractReviewInfo(json);

  // 💡 여기서 변수를 정의하기 때문에 에러가 안 납니다.
  const reviewCount = safeNumber(info.reviewCount) ?? 0;
  const averageReviewScore = safeNumber(info.averageReviewScore) ?? 0;

  return {
    reviewCount: clampInt(reviewCount, 0, 100_000_000),
    reviewRating: averageReviewScore, // 🎯 평점 0.00 해결 포인트!
    photoVideoReviewCount: safeNumber(info.photoReviewCount || info.photoVideoReviewCount) ?? 0,
    monthlyUseReviewCount: safeNumber(info.afterUseReviewCount || info.monthlyUseReviewCount) ?? 0,
    repurchaseReviewCount: safeNumber(info.repurchaseReviewCount) ?? 0,
    storePickReviewCount: safeNumber(info.storePickReviewCount) ?? 0,
    starScoreSummary: {
      "1": safeNumber(info.score1ReviewCount) ?? 0,
      "2": safeNumber(info.score2ReviewCount) ?? 0,
      "3": safeNumber(info.score3ReviewCount) ?? 0,
      "4": safeNumber(info.score4ReviewCount) ?? 0,
      "5": safeNumber(info.score5ReviewCount) ?? 0,
    },
  };
}

function normalizeSmartstoreDesktopUrl(inputUrl: string): string {
  const raw = String(inputUrl || "").trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === "m.smartstore.naver.com") {
      u.hostname = "smartstore.naver.com";
    }
    if (u.hostname === "m.brand.naver.com") {
      u.hostname = "brand.naver.com";
    }
    return u.href;
  } catch {
    return raw.replace("m.smartstore.naver.com", "smartstore.naver.com");
  }
}


/**
 * HTML 본문에서 `window.__PRELOADED_STATE__ = {...}` 형태의 JSON 객체를 추출해 파싱한다.
 */
function extractPreloadedStateFromHtml(html: string): unknown | null {
  const marker = "window.__PRELOADED_STATE__=";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;

  const jsonStart = startIdx + marker.length;
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let jsonEnd = -1;

  // 문자열을 순회하며 정확한 JSON 객체의 끝(})을 찾습니다.
  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' || char === "'") { // 네이버는 가끔 작은따옴표도 씁니다
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
  }

  if (jsonEnd === -1) return null;

  let payload = html.slice(jsonStart, jsonEnd).trim();

  try {
    // 보안을 위해 Function 생성자를 통한 파싱(네이버 데이터가 엄격한 JSON이 아닐 경우 대비)
    // (JSON.parse 보다 유연하게 js 객체 리터럴을 파싱합니다)
    const parsed = new Function('return ' + payload)();
    console.log(`${LOG_P} __PRELOADED_STATE__ parse success!`);
    return parsed;
  } catch (e) {
    console.warn(`${LOG_P} __PRELOADED_STATE__ parse error`, errMsg(e));
    return null;
  }
}

function extractNextDataFromHtml(html: string): unknown | null {
  const m = /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!m) return null;
  const raw = (m[1] ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function pickHtmlKeywordLines(html: string, keywords: string[], limitLines: number): string[] {
  const lowers = keywords.map((k) => k.toLowerCase());
  const lines = html.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const low = line.toLowerCase();
    if (lowers.some((k) => low.includes(k))) {
      const trimmed = line.trim();
      if (trimmed) out.push(trimmed.slice(0, 400));
      if (out.length >= limitLines) break;
    }
  }
  return out;
}

function findProductReviewInfoDeep(input: unknown): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [input];

  const looksLikeReviewInfo = (o: Record<string, unknown>) => {
    const hasCount = o.reviewCount != null && safeNumber(o.reviewCount) != null;
    const hasAvg = o.averageReviewScore != null && safeNumber(o.averageReviewScore) != null;
    return hasCount || hasAvg;
  };

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (let i = 0; i < cur.length; i += 1) stack.push(cur[i]);
      continue;
    }

    const o = cur as Record<string, unknown>;
    const pri = o.productReviewInfo;
    if (pri && typeof pri === "object" && !Array.isArray(pri)) {
      const priObj = pri as Record<string, unknown>;
      if (looksLikeReviewInfo(priObj)) return priObj;
    }

    if (looksLikeReviewInfo(o)) return o;

    for (const v of Object.values(o)) stack.push(v);
  }

  return null;
}

type ProductSummaryApiJson = {
  productReviewInfo?: {
    reviewCount?: unknown;
    averageReviewScore?: unknown;
    photoReviewCount?: unknown;
    videoReviewCount?: unknown;
    afterUseReviewCount?: unknown;
    repurchaseReviewCount?: unknown;
    storePickReviewCount?: unknown;
    score1ReviewCount?: unknown;
    score2ReviewCount?: unknown;
    score3ReviewCount?: unknown;
    score4ReviewCount?: unknown;
    score5ReviewCount?: unknown;
  };
};

type MobileHtmlFetchResult = {
  json: ProductSummaryApiJson | null;
  httpStatus: number;
};

/**
 * 모바일 상품 상세 HTML → __PRELOADED_STATE__ → productReviewInfo (메인 웹 서버, API 미사용).
 */
async function fetchProductSummaryFromMobileHtml(input: {
  productUrl: string;
  productId: string;
  naverCookie: string;
}): Promise<MobileHtmlFetchResult> {
  const leafCategoryId = pickLeafCategoryIdFromProductUrl(input.productUrl);
  let pageUrl = `https://m.smartstore.naver.com/products/${encodeURIComponent(input.productId)}`;
  if (leafCategoryId) {
    pageUrl += `?leafCategoryId=${encodeURIComponent(leafCategoryId)}`;
  }

  const normalizedPc = normalizeSmartstoreDesktopUrl(input.productUrl);
  const headers = buildSmartstoreMobileDocumentFetchHeaders({
    mobileUrl: pageUrl,
    normalizedProductUrl: normalizedPc || input.productUrl.trim(),
    productId: input.productId,
    naverCookie: input.naverCookie,
  });

  const res = await fetch(pageUrl, {
    method: "GET",
    headers,
    redirect: "follow",
    cache: "no-store",
  });

  const httpStatus = res.status;

  if (!res.ok) {
    console.warn(`${LOG_P} mobile product page non-200`, {
      productId: input.productId,
      pageUrl,
      httpStatus,
      resHeaders: headersToObject(res.headers),
    });
    return { json: null, httpStatus };
  }

  const html = await res.text();
  
  // --- 여기서부터 스나이퍼 로직 강제 개입 ---
  const snipedData = snipeReviewInfoFromHtml(html);
  if (snipedData) {
    console.log(`${LOG_P} 🎯 SEO 스나이퍼 적중!`, snipedData);
    return {
      json: { productReviewInfo: snipedData as any },
      httpStatus,
    };
  }
  // --- 스나이퍼 로직 끝 ---

  // 차단/로봇 페이지 흔적 체크
  const captchaLike =
    /captcha/i.test(html) ||
    /네이버\s*로봇/i.test(html) ||
    /자동\s*입력\s*방지/i.test(html);
  if (captchaLike) {
    console.warn(`${LOG_P} mobile html looks blocked (captcha/robot)`, {
      productId: input.productId,
      pageUrl,
      captcha: /captcha/i.test(html),
      naverRobot: /네이버\s*로봇/i.test(html),
      autoBlock: /자동\s*입력\s*방지/i.test(html),
    });
  }

  const state = extractPreloadedStateFromHtml(html);
  const nextData = state ? null : extractNextDataFromHtml(html);
  const root = state ?? nextData;

  // 💡 불도저 로직 1: 파싱된 전체 데이터를 문자열로 만들어서 무식하게 정규식으로 뽑아내기
  if (root) {
    try {
      const rootStr = JSON.stringify(root);
      const countMatch = rootStr.match(/"(?:reviewCount|totalReviewCount)"\s*:\s*(\d+)/i);
      const scoreMatch = rootStr.match(/"(?:averageReviewScore|ratingValue)"\s*:\s*"?([\d.]+)"?/i);

      if (countMatch && countMatch[1]) {
        console.log(`${LOG_P} 🎯 불도저 정규식 적중 (JSON 내부)!`, {
          count: countMatch[1],
          score: scoreMatch?.[1],
        });
        return {
          json: {
            productReviewInfo: {
              reviewCount: Number(countMatch[1]),
              averageReviewScore: scoreMatch ? Number(scoreMatch[1]) : 0,
            },
          },
          httpStatus,
        };
      }
    } catch (e) {
      console.warn(`${LOG_P} 불도저 파싱 에러`, e);
    }
  }

  // 💡 불도저 로직 2: JSON 변환도 실패했다면, 아예 HTML 원본 텍스트에서 바로 뽑아내기
  const rawCountMatch = html.match(/"(?:reviewCount|totalReviewCount)"\s*:\s*(\d+)/i);
  const rawScoreMatch = html.match(/"(?:averageReviewScore|ratingValue)"\s*:\s*"?([\d.]+)"?/i);

  if (rawCountMatch && rawCountMatch[1]) {
    console.log(`${LOG_P} 🎯 불도저 정규식 적중 (HTML 원본)!`, {
      count: rawCountMatch[1],
      score: rawScoreMatch?.[1],
    });
    return {
      json: {
        productReviewInfo: {
          reviewCount: Number(rawCountMatch[1]),
          averageReviewScore: rawScoreMatch ? Number(rawScoreMatch[1]) : 0,
        },
      },
      httpStatus,
    };
  }

  console.warn(`${LOG_P} 모든 추출 시도 실패`, { productId: input.productId });
  return { json: null, httpStatus };
}

async function fetchProductSummaryViaPlaywright(input: {
  productUrl: string;
  productId: string;
  naverCookie: string;
  timeoutMs?: number;
}): Promise<ProductSummaryApiJson | null> {
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 45_000, 12_000), 90_000);
  let context: BrowserContext | undefined;

  try {
    // 여기서 .context를 가져옵니다.
    const launched = await launchBrowser();
    context = launched.context; 

    // 이제 context가 확실히 있으므로 에러가 사라집니다.
    const page: Page = await context.newPage();
    // ... 이하 동일
    page.setDefaultNavigationTimeout(timeoutMs);

    // 💡 소장님의 찐 프로필을 쓰므로 별도의 쿠키 주입이나 UA 설정이 필요 없습니다! (이미 로그인된 상태니까요)
    const targetUrl = input.productUrl;
    
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      
      // 💡 이제 세션이 저장되었으니, 로그인 창이 뜰 때만 잠깐 기다려줍니다.
      // 평소에는 바로 통과될 거예요!
      if (page.url().includes("nid.naver.com")) {
        console.log(`${LOG_P} 🔑 세션 만료됨! 수동 로그인이 필요합니다.`);
        await page.waitForURL("**/smartstore.naver.com/**", { timeout: 30000 });
      }

      // 페이지 로딩 완료까지 넉넉하게 2초만 대기
      await page.waitForTimeout(2000);

      const pageTitle = await page.title();
      console.log(`${LOG_P} 🕵️‍♂️ Playwright 시야 확인 - 제목: [${pageTitle}]`);
    } catch (e) {
      console.warn(`${LOG_P} playwright goto warn`, errMsg(e));
    }

    // (이하 데이터 추출 로직은 동일...)
   // 데이터 추출 (ld+json 뿐만 아니라 PRELOADED_STATE와 텍스트까지 싹 뒤집니다)
   const extractedData = await page.evaluate(() => {
    // 1순위: 가장 정확한 PRELOADED_STATE 데이터 찾기
    const stateScript = Array.from(document.querySelectorAll('script')).find(s => s.textContent?.includes('__PRELOADED_STATE__'));
    if (stateScript && stateScript.textContent) {
      try {
        const raw = stateScript.textContent.replace(/^window\.__PRELOADED_STATE__\s*=\s*/, '').replace(/;$/, '');
        const state = JSON.parse(raw);
        const pri = state.product?.summary || state.contents?.productReviewInfo || state.productReviewInfo;
        if (pri && pri.reviewCount) {
          return {
            reviewCount: Number(pri.reviewCount),
            averageReviewScore: Number(pri.averageReviewScore || pri.ratingValue || 0),
            photoReviewCount: Number(pri.photoReviewCount || 0),
            videoReviewCount: Number(pri.videoReviewCount || 0),
            afterUseReviewCount: Number(pri.afterUseReviewCount || 0)
          };
        }
      } catch (e) {}
    }

    // 2순위: 화면에 보이는 텍스트에서 직접 추출 (리뷰 3,644 등)
    const bodyText = document.body.innerText;
    const reviewMatch = bodyText.match(/리뷰\s*([0-9,]+)/);
    const ratingMatch = bodyText.match(/평점\s*([0-5]\.[0-9]+)/);
    
    if (reviewMatch) {
      return {
        reviewCount: parseInt(reviewMatch[1].replace(/,/g, ''), 10),
        averageReviewScore: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
      };
    }

    return null;
  });

    if (extractedData) {
      console.log(`${LOG_P} 🎯 Playwright DOM 물리적 스크래핑 성공!`, extractedData);
      return { productReviewInfo: extractedData };
    }
    return null;
  } finally {
    // 💡 간단하게 context만 닫아주도록 수정합니다.
    if (context) {
      const browser = context.browser(); // context에서 browser 객체를 역으로 가져옴
      await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
}

export async function fetchSmartstoreReviewSnapshot(input: {
  productUrl: string;
  productId: string;
}): Promise<FetchSmartstoreReviewResult> {
  const productUrl = input.productUrl.trim();
  const productId = String(input.productId ?? "").trim();

  const pageUrl = `https://m.smartstore.naver.com/products/${encodeURIComponent(productId)}`;

  console.log(`${LOG_P} started`, { productId, productUrl, mode: "mobile-html", pageUrl });

  await randomSmartstoreDelay("ranking");

  let primary429 = false;
  let json: ProductSummaryApiJson | null = null;

  const naverCookie = await loadSystemConfigNaverCookie();

  console.log("[DEBUG-COOKIE]", {
    cookieExists: Boolean(naverCookie),
    cookieLength: naverCookie.length,
    cookieHead20: naverCookie ? naverCookie.slice(0, 20) : "",
  });

  try {
    const mobile = await fetchProductSummaryFromMobileHtml({
      productUrl,
      productId,
      naverCookie,
    });
    json = mobile.json;
    primary429 = mobile.httpStatus === 429;
    if (json) {
      console.log(`${LOG_P} mobile-html summary raw (truncated)`, JSON.stringify(json, null, 2).slice(0, 4000));
    }
  } catch (e) {
    console.warn(`${LOG_P} mobile product page fetch error`, errMsg(e));
  }

  if (!json || primary429) {
    try {
      console.warn(`${LOG_P} fallback to playwright`, { productId, primary429 });
      const fromPw = await fetchProductSummaryViaPlaywright({
        productUrl,
        productId,
        naverCookie,
        timeoutMs: 55_000,
      });
      if (fromPw) json = fromPw;
    } catch (e) {
      console.error(`${LOG_P} playwright fallback failed`, errMsg(e));
      if (primary429) {
        await cooldownOn429();
        throw new SmartstoreNaverRateLimitedError(
          "보안 차단 감지: 네이버가 요청을 일시적으로 제한(HTTP 429)했고 Playwright 폴백도 실패했습니다."
        );
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!json) {
    if (primary429) {
      await cooldownOn429();
      throw new SmartstoreNaverRateLimitedError(
        "보안 차단 감지: 네이버가 요청을 일시적으로 제한(HTTP 429)했고 Playwright 폴백에서도 데이터를 획득하지 못했습니다."
      );
    }
    throw new Error("Smartstore 리뷰 요약 데이터를 가져오지 못했습니다. (fetch 실패 + playwright miss)");
  }

  const summary: SmartstoreReviewSummary = mapProductSummaryJsonToSummary(json);

  const recentReviews: SmartstoreRecentReviewItem[] = [];

  return {
    productPageUrl: productUrl,
    summary,
    recentReviews,
  };
}

