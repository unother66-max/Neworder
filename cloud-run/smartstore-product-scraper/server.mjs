/**
 * 스마트스토어 상품 페이지용 Playwright HTTP 서버 (로컬 맥 실행 + Cloudflare Tunnel 공개 전제).
 * 폴더명 cloud-run/ 은 과거 Composer 구조 잔재 — 배포 안 해도 됨.
 *
 * 엔드포인트:
 *   GET  /health
 *   POST /extract  { "productUrl": "https://..." }
 * 응답: { "ok": true, "name", "imageUrl", "category" } (없으면 null)
 *
 * 충돌 주의: 맥에서 다른 프로세스가 같은 PORT 쓰면 EADDRINUSE → PORT 바꿔 실행.
 */
import express from "express";
import { chromium } from "playwright";
import { extractProductMeta } from "./extractMeta.mjs";

const PORT = Number(process.env.PORT || 8765);
/** 로컬만: 127.0.0.1 (기본). LAN에서 직접 붙이려면 HOST=0.0.0.0 */
const HOST = (process.env.HOST || "127.0.0.1").trim();
const SECRET = process.env.SMARTSTORE_PLAYWRIGHT_SECRET?.trim();
const GOTO_TIMEOUT_MS = 45_000;
const POST_LOAD_WAIT_MS = 2_800;

function logError(stage, err, extra = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`[smartstore-scraper] 단계=${stage}`, {
    message: e.message,
    stack: e.stack,
    name: e.name,
    ...extra,
  });
}

const app = express();
app.use(express.json({ limit: "48kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "smartstore-product-scraper" });
});

app.post("/extract", async (req, res) => {
  const started = Date.now();

  if (SECRET) {
    const h = req.headers["x-smartstore-scrape-secret"];
    if (h !== SECRET) {
      logError("인증실패", new Error("x-smartstore-scrape-secret 불일치 또는 누락"), {
        hasHeader: Boolean(h),
      });
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
  }

  const productUrl = String(req.body?.productUrl ?? "").trim();
  console.log("[smartstore-scraper] 단계=요청수신", { productUrl, ip: req.ip });

  if (!productUrl.startsWith("http://") && !productUrl.startsWith("https://")) {
    console.warn("[smartstore-scraper] 단계=검증실패", { reason: "productUrl_not_http", productUrl });
    return res.status(400).json({
      ok: false,
      error: "productUrl must be http(s)",
    });
  }

  let browser;
  try {
    console.log("[smartstore-scraper] 단계=브라우저시작");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile Safari/604.1",
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(GOTO_TIMEOUT_MS);

    console.log("[smartstore-scraper] 단계=goto", { productUrl, timeoutMs: GOTO_TIMEOUT_MS });
    const nav = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
      timeout: GOTO_TIMEOUT_MS,
    });
    console.log("[smartstore-scraper] 단계=goto완료", {
      status: nav?.status?.() ?? null,
      url: page.url(),
    });

    await new Promise((r) => setTimeout(r, POST_LOAD_WAIT_MS));

    console.log("[smartstore-scraper] 단계=DOM추출");
    const extracted = await extractProductMeta(page);

    const payload = {
      ok: true,
      name: extracted.name?.trim?.() ? extracted.name.trim() : null,
      imageUrl: extracted.imageUrl?.trim?.() ? extracted.imageUrl.trim() : null,
      category: extracted.category?.trim?.() ? extracted.category.trim() : null,
    };

    console.log("[smartstore-scraper] 단계=추출완료", {
      ms: Date.now() - started,
      ...payload,
    });

    await context.close().catch((e) => logError("context종료", e));
    await browser.close().catch((e) => logError("browser종료", e));
    browser = null;

    return res.json(payload);
  } catch (e) {
    logError("extract처리중", e, { productUrl, ms: Date.now() - started });
    if (browser) {
      await browser.close().catch((err) => logError("browser종료(finally)", err));
    }
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

app.listen(PORT, HOST, () => {
  console.log("[smartstore-scraper] listening", { HOST, PORT, health: `http://${HOST}:${PORT}/health` });
});
