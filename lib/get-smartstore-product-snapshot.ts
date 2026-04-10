import type { Browser } from "playwright-core";

const LOG_PREFIX = "[getSmartstoreProductSnapshot]";
const SNAPSHOT_GOTO_TIMEOUT_MS = 30_000;
const POST_LOAD_WAIT_MS = 2_800;

export type SmartstoreSnapshotImageDiag = {
  missingFields: ("name" | "imageUrl" | "category")[];
  resolvedOgImage: string | null;
  resolvedTwitterImage: string | null;
  ldJsonImageCandidates: string[];
  bodyImgCandidates: string[];
  finalImageUrl: string | null;
  gotoHttpStatus: number | null;
  pageTitleSample: string | null;
};

export type SmartstoreProductSnapshot = {
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  finalUrl: string;
  launchMode?: string;
  lastError?: string | null;
  imageDiag?: SmartstoreSnapshotImageDiag;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.stack || e.message;
  return String(e);
}

async function launchBrowser(): Promise<{ browser: Browser; launchLabel: string }> {
  const extraArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
  ];

  if (isVercelRuntime()) {
    console.log(`${LOG_PREFIX} launch path: @sparticuz/chromium + playwright-core (VERCEL=1)`);
    const sparticuz = (await import("@sparticuz/chromium")).default as {
      args: string[];
      executablePath: () => Promise<string>;
      setGraphicsMode?: boolean;
    };
    sparticuz.setGraphicsMode = false;

    const { chromium: pwChromium } = await import("playwright-core");

    let executablePath: string;
    try {
      executablePath = await sparticuz.executablePath();
      console.log(`${LOG_PREFIX} chromium.executablePath OK`, {
        length: executablePath.length,
        prefix: executablePath.slice(0, 80),
      });
    } catch (e) {
      const msg = errMsg(e);
      console.error(`${LOG_PREFIX} STAGE=executablePath`, msg);
      throw new Error(`chromium.executablePath failed: ${msg}`);
    }

    const mergedArgs = [...sparticuz.args];
    for (const a of extraArgs) {
      if (!mergedArgs.includes(a)) mergedArgs.push(a);
    }

    try {
      const browser = await pwChromium.launch({
        args: mergedArgs,
        executablePath,
        headless: true,
      });
      console.log(`${LOG_PREFIX} playwright-core.launch OK`, {
        argCount: mergedArgs.length,
      });
      return { browser, launchLabel: "@sparticuz/chromium+playwright-core" };
    } catch (e) {
      const msg = errMsg(e);
      console.error(`${LOG_PREFIX} STAGE=playwright-core.launch`, msg);
      throw new Error(`playwright-core.launch failed: ${msg}`);
    }
  }

  console.log(`${LOG_PREFIX} launch path: playwright package (local bundled Chromium)`);
  const { chromium: pwChromium } = await import("playwright");
  try {
    const browser = (await pwChromium.launch({
      headless: true,
      args: extraArgs,
    })) as unknown as Browser;
    console.log(`${LOG_PREFIX} playwright.launch OK`);
    return { browser, launchLabel: "playwright-bundled" };
  } catch (e) {
    const msg = errMsg(e);
    console.error(`${LOG_PREFIX} STAGE=playwright.launch`, msg);
    throw new Error(`playwright.launch failed: ${msg}`);
  }
}

export async function getSmartstoreProductSnapshot(
  productUrl: string
): Promise<SmartstoreProductSnapshot> {
  const fallbackFinal = (): string => {
    try {
      return new URL(productUrl).href;
    } catch {
      return productUrl;
    }
  };

  const fail = (
    finalUrl: string,
    launchMode: string | undefined,
    lastError: string,
    partial?: Partial<Pick<SmartstoreProductSnapshot, "name" | "imageUrl" | "category">>
  ): SmartstoreProductSnapshot => ({
    name: partial?.name ?? null,
    imageUrl: partial?.imageUrl ?? null,
    category: partial?.category ?? null,
    finalUrl,
    launchMode,
    lastError,
    imageDiag: {
      missingFields: ["name", "imageUrl", "category"],
      resolvedOgImage: null,
      resolvedTwitterImage: null,
      ldJsonImageCandidates: [],
      bodyImgCandidates: [],
      finalImageUrl: null,
      gotoHttpStatus: null,
      pageTitleSample: null,
    },
  });

  try {
    new URL(productUrl);
  } catch {
    return fail(fallbackFinal(), undefined, "invalid productUrl (not a URL)");
  }

  let launchMode: string | undefined;
  let browser!: Browser;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    launchMode = launched.launchLabel;
  } catch (e) {
    console.error(`${LOG_PREFIX} STAGE=launchBrowser (fatal)`, errMsg(e));
    return fail(fallbackFinal(), launchMode, errMsg(e));
  }

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "ko-KR",
    });
    const page = await context.newPage();

    let gotoHttpStatus: number | null = null;
    try {
      const response = await page.goto(productUrl, {
        waitUntil: "load",
        timeout: SNAPSHOT_GOTO_TIMEOUT_MS,
      });
      gotoHttpStatus = response?.status() ?? null;
      console.log(`${LOG_PREFIX} STAGE=page.goto OK`, {
        httpStatus: gotoHttpStatus,
        url: page.url().slice(0, 120),
      });
    } catch (e) {
      const msg = errMsg(e);
      console.error(`${LOG_PREFIX} STAGE=page.goto FAIL`, {
        message: msg,
        currentUrl: page.url(),
      });
      await browser.close().catch(() => {});
      return fail(page.url() || fallbackFinal(), launchMode, `page.goto failed: ${msg}`);
    }

    await sleep(POST_LOAD_WAIT_MS);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

    const finalUrl = page.url();
    let pageTitleSample: string | null = null;
    try {
      const t = await page.title();
      pageTitleSample = t?.slice(0, 200) ?? null;
    } catch (e) {
      console.warn(`${LOG_PREFIX} STAGE=page.title`, errMsg(e));
    }

    type EvalOut = {
      name: string | null;
      imageUrl: string | null;
      category: string | null;
      resolvedOgImage: string | null;
      resolvedTwitterImage: string | null;
      ldJsonImageCandidates: string[];
      bodyImgCandidates: string[];
    };

    let extracted: EvalOut;
    try {
      extracted = await page.evaluate(() => {
        const base = document.baseURI || location.href;

        const resolveHref = (href: string | null | undefined): string | null => {
          const raw = href?.trim();
          if (!raw) return null;
          try {
            return new URL(raw, base).href;
          } catch {
            return raw;
          }
        };

        const metaProp = (prop: string) =>
          document
            .querySelector(`meta[property="${prop}"]`)
            ?.getAttribute("content")
            ?.trim() || null;
        const metaName = (name: string) =>
          document
            .querySelector(`meta[name="${name}"]`)
            ?.getAttribute("content")
            ?.trim() || null;

        let name: string | null =
          metaProp("og:title") || metaName("twitter:title") || null;
        const titleRaw = document.querySelector("title")?.textContent?.trim();
        if (!name && titleRaw) name = titleRaw;

        const resolvedOgImage = resolveHref(metaProp("og:image"));
        const resolvedTwitterImage = resolveHref(metaName("twitter:image"));

        let imageUrl: string | null = resolvedOgImage || resolvedTwitterImage || null;

        const ldJsonImageCandidates: string[] = [];
        const pushLdImg = (v: string | null | undefined) => {
          const a = resolveHref(v || null);
          if (a && !ldJsonImageCandidates.includes(a)) ldJsonImageCandidates.push(a);
        };

        const normType = (t: unknown): string[] => {
          if (t == null) return [];
          if (Array.isArray(t)) return t.filter((x) => typeof x === "string");
          return typeof t === "string" ? [t] : [];
        };

        const LEADING_SKIP =
          /^(home|홈|메인|네이버|전체|쇼핑|스마트스토어|브랜드스토어|smartstore|brandstore|상품목록|카테고리|category|shop|store)$/i;

        function normalizeCrumbParts(parts: string[]): string[] {
          const trimmed = parts.map((p) => p.trim()).filter(Boolean);
          let i = 0;
          while (i < trimmed.length && LEADING_SKIP.test(trimmed[i])) i += 1;
          const rest = trimmed.slice(i);
          const deduped: string[] = [];
          for (const p of rest) {
            if (deduped.length > 0 && deduped[deduped.length - 1] === p) continue;
            deduped.push(p);
          }
          return deduped;
        }

        function formatCategory(parts: string[]): string | null {
          const n = normalizeCrumbParts(parts);
          if (n.length === 0) return null;
          return n.join(" > ");
        }

        function collectJsonLdTypedNodes(data: unknown): Record<string, unknown>[] {
          const out: Record<string, unknown>[] = [];
          const visit = (x: unknown) => {
            if (x == null) return;
            if (Array.isArray(x)) {
              for (const y of x) visit(y);
              return;
            }
            if (typeof x !== "object") return;
            const o = x as Record<string, unknown>;
            if (o["@graph"] != null) visit(o["@graph"]);
            if (o["@type"] != null) out.push(o);
          };
          visit(data);
          return out;
        }

        function listItemNamesFromBreadcrumb(o: Record<string, unknown>): string[] {
          const raw = o.itemListElement;
          if (!Array.isArray(raw)) return [];
          const rows: { pos: number; name: string }[] = [];
          for (let idx = 0; idx < raw.length; idx += 1) {
            const el = raw[idx];
            if (!el || typeof el !== "object") continue;
            const e = el as Record<string, unknown>;
            const pos =
              typeof e.position === "number" && Number.isFinite(e.position)
                ? e.position
                : idx + 1;
            let part = "";
            if (typeof e.name === "string") part = e.name;
            else if (e.item && typeof e.item === "object") {
              const item = e.item as Record<string, unknown>;
              if (typeof item.name === "string") part = item.name;
              else if (typeof item["@id"] === "string") {
                try {
                  const u = new URL(item["@id"] as string, "https://naver.com");
                  const last = decodeURIComponent(u.pathname.split("/").pop() || "");
                  if (last && !/^\d+$/.test(last)) part = last.replace(/-/g, " ");
                } catch {
                  /* ignore */
                }
              }
            }
            const t = part.trim();
            if (t) rows.push({ pos, name: t });
          }
          rows.sort((a, b) => a.pos - b.pos);
          return rows.map((r) => r.name);
        }

        function categoryFromProductValue(cat: unknown): string | null {
          if (cat == null) return null;
          if (typeof cat === "string") {
            const s = cat.trim();
            if (!s) return null;
            if (/\s*>\s*/.test(s)) {
              return formatCategory(s.split(/\s*>\s*/));
            }
            return formatCategory([s]);
          }
          if (Array.isArray(cat)) {
            const names: string[] = [];
            for (const c of cat) {
              const inner = categoryFromProductValue(c);
              if (inner) {
                if (inner.includes(" > ")) {
                  names.push(...inner.split(/\s*>\s*/).map((x) => x.trim()));
                } else {
                  names.push(inner);
                }
              }
            }
            return formatCategory(names);
          }
          if (typeof cat === "object") {
            const o = cat as Record<string, unknown>;
            if (typeof o.name === "string" && o.name.trim()) {
              return formatCategory([o.name]);
            }
          }
          return null;
        }

        let category: string | null = null;
        const breadcrumbCandidates: string[] = [];
        const productCategoryCandidates: string[] = [];

        for (const script of document.querySelectorAll(
          'script[type="application/ld+json"]'
        )) {
          const raw = script.textContent?.trim();
          if (!raw) continue;
          let data: unknown;
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }
          const nodes = collectJsonLdTypedNodes(data);
          for (const node of nodes) {
            const types = normType(node["@type"]);
            if (types.includes("BreadcrumbList")) {
              const names = listItemNamesFromBreadcrumb(node);
              const formatted = formatCategory(names);
              if (formatted) breadcrumbCandidates.push(formatted);
            }
            if (types.includes("Product")) {
              const pc = categoryFromProductValue(node.category);
              if (pc) productCategoryCandidates.push(pc);
              if (typeof node.name === "string" && node.name.trim() && !name) {
                name = node.name.trim();
              }
              const img = node.image;
              if (typeof img === "string") {
                pushLdImg(img);
                if (!imageUrl) imageUrl = resolveHref(img);
              } else if (Array.isArray(img)) {
                for (const item of img) {
                  if (typeof item === "string") {
                    pushLdImg(item);
                    if (!imageUrl) imageUrl = resolveHref(item);
                  } else if (item && typeof item === "object") {
                    const u = (item as { url?: unknown }).url;
                    if (typeof u === "string") {
                      pushLdImg(u);
                      if (!imageUrl) imageUrl = resolveHref(u);
                    }
                  }
                }
              } else if (img && typeof img === "object") {
                const u = (img as { url?: unknown }).url;
                if (typeof u === "string") {
                  pushLdImg(u);
                  if (!imageUrl) imageUrl = resolveHref(u);
                }
              }
            }
          }
        }

        if (breadcrumbCandidates.length > 0) {
          category = breadcrumbCandidates.reduce<string | null>((best, cur) => {
            if (!best || cur.length > best.length) return cur;
            return best;
          }, null);
        }

        if (!category && productCategoryCandidates.length > 0) {
          category = productCategoryCandidates.reduce<string | null>((best, cur) => {
            if (!best || cur.length > best.length) return cur;
            return best;
          }, null);
        }

        if (!category) {
          const domFromNav = (): string[] => {
            const nav =
              document.querySelector("nav[aria-label*='bread' i]") ||
              document.querySelector("nav[aria-label*='Bread' i]");
            if (!nav) return [];
            const parts: string[] = [];
            nav.querySelectorAll("a").forEach((a) => {
              const t = a.textContent?.replace(/\s+/g, " ").trim();
              if (t && t.length > 0 && t.length < 120) parts.push(t);
            });
            return parts;
          };

          const domFromOl = (): string[] => {
            const ol =
              document.querySelector("ol[class*='bread' i]") ||
              document.querySelector("ol[class*='Bread' i]");
            if (!ol) return [];
            const parts: string[] = [];
            ol.querySelectorAll(":scope > li").forEach((li) => {
              const t = li.textContent?.replace(/\s+/g, " ").trim();
              if (t && t.length > 0 && t.length < 120) parts.push(t);
            });
            return parts;
          };

          const domFromPath = (): string[] => {
            const root =
              document.querySelector("[class*='categoryPath' i]") ||
              document.querySelector("[class*='CategoryPath' i]") ||
              document.querySelector("[class*='breadcrumb' i]") ||
              document.querySelector("[class*='Breadcrumb' i]");
            if (!root) return [];
            const parts: string[] = [];
            root.querySelectorAll("a").forEach((a) => {
              const t = a.textContent?.replace(/\s+/g, " ").trim();
              if (t && t.length > 0 && t.length < 120) parts.push(t);
            });
            return parts;
          };

          const tryDom = (...groups: string[][]) => {
            for (const g of groups) {
              if (g.length >= 2) {
                const fc = formatCategory(g);
                if (fc) return fc;
              }
            }
            for (const g of groups) {
              if (g.length === 1) {
                const fc = formatCategory(g);
                if (fc) return fc;
              }
            }
            return null;
          };

          category = tryDom(domFromNav(), domFromOl(), domFromPath());
        }

        if (!category) {
          const metaCat =
            metaProp("product:category") ||
            metaProp("article:section") ||
            metaName("category") ||
            null;
          if (metaCat) category = formatCategory([metaCat]);
        }

        if (name) {
          name = name
            .replace(/\s*[-–|:]\s*네이버.*$/i, "")
            .replace(/\s*:\s*스마트스토어.*$/i, "")
            .trim();
        }

        const bodyImgCandidates: string[] = [];
        document.querySelectorAll("img[src]").forEach((img, i) => {
          if (i >= 20) return;
          const s = img.getAttribute("src")?.trim();
          if (!s || s.startsWith("data:")) return;
          const abs = resolveHref(s);
          if (abs && !bodyImgCandidates.includes(abs)) bodyImgCandidates.push(abs);
        });

        const isLikelyProductImage = (href: string): boolean => {
          const u = href.toLowerCase();
          if (u.includes("favicon")) return false;
          if (/\/1x1|pixel|blank|spacer|transparent/i.test(u)) return false;
          if (u.endsWith(".svg") && u.includes("logo")) return false;
          return true;
        };

        const pickFallbackImage = (): string | null => {
          const order: (string | null)[] = [
            resolvedOgImage,
            resolvedTwitterImage,
            ...ldJsonImageCandidates,
            ...bodyImgCandidates,
          ];
          for (const u of order) {
            if (!u) continue;
            if (!/^https?:\/\//i.test(u)) continue;
            if (!isLikelyProductImage(u)) continue;
            return u;
          }
          return null;
        };

        if (!imageUrl?.trim()) {
          imageUrl = pickFallbackImage();
        }

        return {
          name,
          imageUrl,
          category,
          resolvedOgImage,
          resolvedTwitterImage,
          ldJsonImageCandidates,
          bodyImgCandidates,
        };
      });
      console.log(`${LOG_PREFIX} STAGE=page.evaluate OK`);
    } catch (e) {
      const msg = errMsg(e);
      console.error(`${LOG_PREFIX} STAGE=page.evaluate FAIL`, msg);
      await browser.close().catch(() => {});
      return fail(finalUrl, launchMode, `page.evaluate failed: ${msg}`);
    }

    const nameOut = extracted.name || null;
    const imageOut = extracted.imageUrl || null;
    const categoryOut = extracted.category || null;

    const missingFields: ("name" | "imageUrl" | "category")[] = [];
    if (!nameOut?.trim()) missingFields.push("name");
    if (!imageOut?.trim()) missingFields.push("imageUrl");
    if (!categoryOut?.trim()) missingFields.push("category");

    const imageDiag: SmartstoreSnapshotImageDiag = {
      missingFields,
      resolvedOgImage: extracted.resolvedOgImage,
      resolvedTwitterImage: extracted.resolvedTwitterImage,
      ldJsonImageCandidates: extracted.ldJsonImageCandidates,
      bodyImgCandidates: extracted.bodyImgCandidates.slice(0, 12),
      finalImageUrl: imageOut,
      gotoHttpStatus,
      pageTitleSample,
    };

    if (!categoryOut) {
      console.log(`${LOG_PREFIX} category=null`, {
        finalUrl,
        hint: "no BreadcrumbList/Product.category/DOM/meta trail",
      });
    }

    if (!imageOut?.trim()) {
      console.warn(`${LOG_PREFIX} snapshot imageUrl still empty — image fallback trace`, {
        finalUrl,
        launchMode,
        gotoHttpStatus,
        resolvedOgImage: extracted.resolvedOgImage,
        resolvedTwitterImage: extracted.resolvedTwitterImage,
        ldJsonCount: extracted.ldJsonImageCandidates.length,
        ldJsonHead: extracted.ldJsonImageCandidates.slice(0, 5),
        bodyImgCount: extracted.bodyImgCandidates.length,
        bodyImgHead: extracted.bodyImgCandidates.slice(0, 5),
        pageTitleSample,
      });
    }

    await browser.close().catch(() => {});

    return {
      name: nameOut,
      imageUrl: imageOut,
      category: categoryOut,
      finalUrl,
      launchMode,
      lastError: null,
      imageDiag,
    };
  } catch (e) {
    const msg = errMsg(e);
    console.error(`${LOG_PREFIX} STAGE=unexpected`, msg);
    await browser.close().catch(() => {});
    return fail(fallbackFinal(), launchMode, msg);
  }
}
