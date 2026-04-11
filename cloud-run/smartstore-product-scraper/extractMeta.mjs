/**
 * Playwright page.evaluate 안에서 실행: 스마트스토어 상품 URL 페이지에서
 * name / imageUrl / category 만 추출 (로컬 Playwright 서버에서 호출).
 * 앱의 lib/get-smartstore-product-snapshot.ts 와 규칙을 맞추려면 양쪽 함께 유지보수.
 */
export async function extractProductMeta(page) {
  return page.evaluate(() => {
    const base = document.baseURI || location.href;

    const resolveHref = (href) => {
      const raw = href?.trim?.() || String(href || "").trim();
      if (!raw) return null;
      try {
        return new URL(raw, base).href;
      } catch {
        return raw;
      }
    };

    const metaProp = (prop) =>
      document
        .querySelector(`meta[property="${prop}"]`)
        ?.getAttribute("content")
        ?.trim() || null;
    const metaName = (name) =>
      document
        .querySelector(`meta[name="${name}"]`)
        ?.getAttribute("content")
        ?.trim() || null;

    let name = metaProp("og:title") || metaName("twitter:title") || null;
    const titleRaw = document.querySelector("title")?.textContent?.trim();
    if (!name && titleRaw) name = titleRaw;

    const resolvedOgImage = resolveHref(metaProp("og:image"));
    const resolvedTwitterImage = resolveHref(metaName("twitter:image"));

    let imageUrl = resolvedOgImage || resolvedTwitterImage || null;

    const ldJsonImageCandidates = [];
    const pushLdImg = (v) => {
      const a = resolveHref(v || null);
      if (a && !ldJsonImageCandidates.includes(a)) ldJsonImageCandidates.push(a);
    };

    const normType = (t) => {
      if (t == null) return [];
      if (Array.isArray(t)) return t.filter((x) => typeof x === "string");
      return typeof t === "string" ? [t] : [];
    };

    const LEADING_SKIP =
      /^(home|홈|메인|네이버|전체|쇼핑|스마트스토어|브랜드스토어|smartstore|brandstore|상품목록|카테고리|category|shop|store)$/i;

    function normalizeCrumbParts(parts) {
      const trimmed = parts.map((p) => p.trim()).filter(Boolean);
      let i = 0;
      while (i < trimmed.length && LEADING_SKIP.test(trimmed[i])) i += 1;
      const rest = trimmed.slice(i);
      const deduped = [];
      for (const p of rest) {
        if (deduped.length > 0 && deduped[deduped.length - 1] === p) continue;
        deduped.push(p);
      }
      return deduped;
    }

    function formatCategory(parts) {
      const n = normalizeCrumbParts(parts);
      if (n.length === 0) return null;
      return n.join(" > ");
    }

    function collectJsonLdTypedNodes(data) {
      const out = [];
      const visit = (x) => {
        if (x == null) return;
        if (Array.isArray(x)) {
          for (const y of x) visit(y);
          return;
        }
        if (typeof x !== "object") return;
        const o = x;
        if (o["@graph"] != null) visit(o["@graph"]);
        if (o["@type"] != null) out.push(o);
      };
      visit(data);
      return out;
    }

    function listItemNamesFromBreadcrumb(o) {
      const raw = o.itemListElement;
      if (!Array.isArray(raw)) return [];
      const rows = [];
      for (let idx = 0; idx < raw.length; idx += 1) {
        const el = raw[idx];
        if (!el || typeof el !== "object") continue;
        const e = el;
        const pos =
          typeof e.position === "number" && Number.isFinite(e.position)
            ? e.position
            : idx + 1;
        let part = "";
        if (typeof e.name === "string") part = e.name;
        else if (e.item && typeof e.item === "object") {
          const item = e.item;
          if (typeof item.name === "string") part = item.name;
          else if (typeof item["@id"] === "string") {
            try {
              const u = new URL(item["@id"], "https://naver.com");
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

    function categoryFromProductValue(cat) {
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
        const names = [];
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
        const o = cat;
        if (typeof o.name === "string" && o.name.trim()) {
          return formatCategory([o.name]);
        }
      }
      return null;
    }

    let category = null;
    const breadcrumbCandidates = [];
    const productCategoryCandidates = [];

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      const rawText = script.textContent?.trim();
      if (!rawText) continue;
      let data;
      try {
        data = JSON.parse(rawText);
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
                const u = item.url;
                if (typeof u === "string") {
                  pushLdImg(u);
                  if (!imageUrl) imageUrl = resolveHref(u);
                }
              }
            }
          } else if (img && typeof img === "object") {
            const u = img.url;
            if (typeof u === "string") {
              pushLdImg(u);
              if (!imageUrl) imageUrl = resolveHref(u);
            }
          }
        }
      }
    }

    if (breadcrumbCandidates.length > 0) {
      category = breadcrumbCandidates.reduce((best, cur) => {
        if (!best || cur.length > best.length) return cur;
        return best;
      }, null);
    }

    if (!category && productCategoryCandidates.length > 0) {
      category = productCategoryCandidates.reduce((best, cur) => {
        if (!best || cur.length > best.length) return cur;
        return best;
      }, null);
    }

    if (!category) {
      const domFromNav = () => {
        const nav =
          document.querySelector("nav[aria-label*='bread' i]") ||
          document.querySelector("nav[aria-label*='Bread' i]");
        if (!nav) return [];
        const parts = [];
        nav.querySelectorAll("a").forEach((a) => {
          const t = a.textContent?.replace(/\s+/g, " ").trim();
          if (t && t.length > 0 && t.length < 120) parts.push(t);
        });
        return parts;
      };

      const domFromOl = () => {
        const ol =
          document.querySelector("ol[class*='bread' i]") ||
          document.querySelector("ol[class*='Bread' i]");
        if (!ol) return [];
        const parts = [];
        ol.querySelectorAll(":scope > li").forEach((li) => {
          const t = li.textContent?.replace(/\s+/g, " ").trim();
          if (t && t.length > 0 && t.length < 120) parts.push(t);
        });
        return parts;
      };

      const domFromPath = () => {
        const root =
          document.querySelector("[class*='categoryPath' i]") ||
          document.querySelector("[class*='CategoryPath' i]") ||
          document.querySelector("[class*='breadcrumb' i]") ||
          document.querySelector("[class*='Breadcrumb' i]");
        if (!root) return [];
        const parts = [];
        root.querySelectorAll("a").forEach((a) => {
          const t = a.textContent?.replace(/\s+/g, " ").trim();
          if (t && t.length > 0 && t.length < 120) parts.push(t);
        });
        return parts;
      };

      const tryDom = (...groups) => {
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

    const bodyImgCandidates = [];
    document.querySelectorAll("img[src]").forEach((img, i) => {
      if (i >= 20) return;
      const s = img.getAttribute("src")?.trim();
      if (!s || s.startsWith("data:")) return;
      const abs = resolveHref(s);
      if (abs && !bodyImgCandidates.includes(abs)) bodyImgCandidates.push(abs);
    });

    const isLikelyProductImage = (href) => {
      const u = href.toLowerCase();
      if (u.includes("favicon")) return false;
      if (/\/1x1|pixel|blank|spacer|transparent/i.test(u)) return false;
      if (u.endsWith(".svg") && u.includes("logo")) return false;
      return true;
    };

    const pickFallbackImage = () => {
      const order = [
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
    };
  });
}
