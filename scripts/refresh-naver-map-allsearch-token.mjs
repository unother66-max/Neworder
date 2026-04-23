#!/usr/bin/env node
/**
 * map.naver.com 검색 페이지를 열고 Network의 allSearch 요청에서 token 쿼리를 잡아
 * NAVER_MAP_ALL_SEARCH_TOKEN 값으로 stdout / .env.local에 반영합니다.
 *
 * 사용: npm run naver-map-token -- --keyword "서울역 필라테스" --write-env-local
 * 로그인 세션이 필요하면 한 번 headless: false 로 띄워 수동 로그인 후 재실행하세요.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseArgs(argv) {
  let keyword = "서울역 필라테스";
  let writeEnvLocal = false;
  let headless = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keyword" && argv[i + 1]) {
      keyword = argv[++i];
      continue;
    }
    if (a === "--write-env-local") {
      writeEnvLocal = true;
      continue;
    }
    if (a === "--headed") {
      headless = false;
      continue;
    }
  }
  return { keyword, writeEnvLocal, headless };
}

function upsertEnvLine(filePath, key, value) {
  const line = `${key}=${value}`;
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    content = "";
  }
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");
  const next = re.test(content)
    ? content.replace(re, line)
    : `${content.replace(/\s*$/, "")}\n${line}\n`;
  fs.writeFileSync(filePath, next, "utf8");
}

function tryCaptureTokenFromUrl(url) {
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

const { keyword, writeEnvLocal, headless } = parseArgs(process.argv.slice(2));

let captured = null;
const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  locale: "ko-KR",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await context.newPage();

const grab = (url) => {
  const t = tryCaptureTokenFromUrl(url);
  if (t) captured = t;
};

page.on("request", (req) => grab(req.url()));
page.on("response", (res) => grab(res.url()));

const searchUrl = `https://map.naver.com/p/search/${encodeURIComponent(keyword)}?c=15.00,0,0,0,dh`;
await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
await new Promise((r) => setTimeout(r, 10_000));

await browser.close();

if (!captured) {
  console.error(
    "[naver-map-token] allSearch에서 token을 찾지 못했습니다. --headed 로 로그인 후 재시도하거나, DevTools Network에서 allSearch URL의 token을 수동 복사하세요."
  );
  process.exit(1);
}

const envLine = `NAVER_MAP_ALL_SEARCH_TOKEN=${captured}`;
console.log(envLine);

if (writeEnvLocal) {
  const envPath = path.join(root, ".env.local");
  upsertEnvLine(envPath, "NAVER_MAP_ALL_SEARCH_TOKEN", captured);
  console.error(`[naver-map-token] wrote: ${envPath}`);
}
