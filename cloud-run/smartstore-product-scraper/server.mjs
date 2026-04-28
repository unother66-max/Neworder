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
import { runSmartstoreExtract } from "./run-smartstore-extract.mjs";
import { runSmartstoreFetchHtml } from "./run-smartstore-extract.mjs";

const PORT = Number(process.env.PORT || 8765);
/** 로컬만: 127.0.0.1 (기본). LAN에서 직접 붙이려면 HOST=0.0.0.0 */
const HOST = (process.env.HOST || "127.0.0.1").trim();
const SECRET = process.env.SMARTSTORE_PLAYWRIGHT_SECRET?.trim();

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
  const cookie = String(req.body?.cookie ?? "").trim();
  const maxRunsRaw = Number(req.body?.maxRuns ?? 4);
  const maxRuns =
    Number.isFinite(maxRunsRaw) && maxRunsRaw >= 1 && maxRunsRaw <= 12
      ? Math.floor(maxRunsRaw)
      : 4;
  console.log("[smartstore-scraper] 단계=요청수신", { productUrl, ip: req.ip });

  if (!productUrl.startsWith("http://") && !productUrl.startsWith("https://")) {
    console.warn("[smartstore-scraper] 단계=검증실패", { reason: "productUrl_not_http", productUrl });
    return res.status(400).json({
      ok: false,
      error: "productUrl must be http(s)",
    });
  }

  try {
    console.log("[smartstore-scraper] 단계=extract_runSmartstoreExtract");
    const prevCookie = process.env.NAVER_COOKIE;
    const prevSmartstoreCookie = process.env.SMARTSTORE_COOKIE;
    if (cookie) {
      // 쿠키는 로그에 남기지 않는다.
      process.env.NAVER_COOKIE = cookie;
      process.env.SMARTSTORE_COOKIE = cookie;
      console.log("[smartstore-scraper] cookie provided", { cookieLength: cookie.length });
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    let extracted = null;
    let last = null;
    for (let i = 1; i <= maxRuns; i += 1) {
      console.log("[smartstore-scraper] run_start", { run: i, maxRuns });
      last = await runSmartstoreExtract(productUrl);
      extracted = last?.extracted ?? null;
      const ok = Boolean(extracted?.name?.trim?.()) || Boolean(extracted?.imageUrl?.trim?.());
      console.log("[smartstore-scraper] run_done", {
        run: i,
        ok,
        hasName: Boolean(extracted?.name?.trim?.()),
        hasImage: Boolean(extracted?.imageUrl?.trim?.()),
        hasCategory: Boolean(extracted?.category?.trim?.()),
      });
      if (ok) break;
      if (i < maxRuns) {
        // 429/오류페이지는 시간 두고 재시도하면 풀리는 케이스가 있음
        const waitMs = 2500 + Math.floor(Math.random() * 5500);
        await sleep(waitMs);
      }
    }

    if (cookie) {
      process.env.NAVER_COOKIE = prevCookie;
      process.env.SMARTSTORE_COOKIE = prevSmartstoreCookie;
    }

    const payload = {
      ok: true,
      name: extracted?.name?.trim?.() ? extracted.name.trim() : null,
      imageUrl: extracted?.imageUrl?.trim?.() ? extracted.imageUrl.trim() : null,
      category: extracted?.category?.trim?.() ? extracted.category.trim() : null,
      runs: maxRuns,
    };

    console.log("[smartstore-scraper] 단계=추출완료", {
      ms: Date.now() - started,
      ...payload,
    });

    return res.json(payload);
  } catch (e) {
    logError("extract처리중", e, { productUrl, ms: Date.now() - started });
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

app.post("/html", async (req, res) => {
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

  const url = String(req.body?.url ?? req.body?.productUrl ?? "").trim();
  const cookie = String(req.body?.cookie ?? "").trim();
  console.log("[smartstore-scraper] 단계=요청수신(/html)", { url, ip: req.ip });

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.warn("[smartstore-scraper] 단계=검증실패(/html)", { reason: "url_not_http", url });
    return res.status(400).json({ ok: false, error: "url must be http(s)" });
  }

  try {
    const prevCookie = process.env.NAVER_COOKIE;
    const prevSmartstoreCookie = process.env.SMARTSTORE_COOKIE;
    if (cookie) {
      process.env.NAVER_COOKIE = cookie;
      process.env.SMARTSTORE_COOKIE = cookie;
      console.log("[smartstore-scraper] cookie provided(/html)", { cookieLength: cookie.length });
    }

    const out = await runSmartstoreFetchHtml(url);

    if (cookie) {
      process.env.NAVER_COOKIE = prevCookie;
      process.env.SMARTSTORE_COOKIE = prevSmartstoreCookie;
    }

    console.log("[smartstore-scraper] 단계=HTML완료", {
      ms: Date.now() - started,
      navStatus: out?.navStatus ?? null,
      finalUrl: String(out?.finalUrl || "").slice(0, 160),
      htmlLen: typeof out?.html === "string" ? out.html.length : 0,
    });

    return res.json({
      ok: true,
      finalUrl: out?.finalUrl ?? url,
      navStatus: out?.navStatus ?? null,
      html: out?.html ?? "",
    });
  } catch (e) {
    logError("/html처리중", e, { url, ms: Date.now() - started });
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

app.listen(PORT, HOST, () => {
  console.log("[smartstore-scraper] listening", { HOST, PORT, health: `http://${HOST}:${PORT}/health` });
});
