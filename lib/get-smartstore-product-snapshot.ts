import { chromium, type Browser } from "playwright";

const SNAPSHOT_GOTO_TIMEOUT_MS = 30_000;
const POST_LOAD_WAIT_MS = 2_800;

export type SmartstoreProductSnapshot = {
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  finalUrl: string;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
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

  const empty = (finalUrl: string): SmartstoreProductSnapshot => ({
    name: null,
    imageUrl: null,
    category: null,
    finalUrl,
  });

  try {
    new URL(productUrl);
  } catch {
    return empty(fallbackFinal());
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "ko-KR",
    });
    const page = await context.newPage();
    await page.goto(productUrl, {
      waitUntil: "load",
      timeout: SNAPSHOT_GOTO_TIMEOUT_MS,
    });
    await sleep(POST_LOAD_WAIT_MS);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

    const finalUrl = page.url();

    const extracted = await page.evaluate(() => {
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

      let imageUrl: string | null =
        metaProp("og:image") || metaName("twitter:image") || null;

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
            if (!imageUrl) {
              if (typeof img === "string") imageUrl = img;
              else if (Array.isArray(img) && typeof img[0] === "string") {
                imageUrl = img[0];
              } else if (img && typeof img === "object") {
                const u = (img as { url?: unknown }).url;
                if (typeof u === "string") imageUrl = u;
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

      return { name, imageUrl, category };
    });

    const categoryOut = extracted.category || null;
    if (!categoryOut) {
      console.log("[getSmartstoreProductSnapshot] category=null", {
        finalUrl,
        hint: "no BreadcrumbList/Product.category/DOM/meta trail",
      });
    }

    return {
      name: extracted.name || null,
      imageUrl: extracted.imageUrl || null,
      category: categoryOut,
      finalUrl,
    };
  } catch (e) {
    console.error("[getSmartstoreProductSnapshot]", e);
    return empty(fallbackFinal());
  } finally {
    await browser?.close();
  }
}
