export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { chromium } from "playwright";

type SearchResultItem = {
  id: string;
  name: string;
  rank: number | null;
  index: number | null;
};

function normalizeText(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function makeNameCandidates(name: string) {
  const raw = String(name || "").trim();
  const set = new Set<string>();

  if (!raw) return [];

  set.add(normalizeText(raw));

  const noBracket = raw.replace(/\([^)]*\)/g, "").trim();
  if (noBracket) set.add(normalizeText(noBracket));

  const noBranchWord = raw
    .replace(/\s*(지점|본점|직영점|점)$/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  if (noBranchWord) set.add(normalizeText(noBranchWord));

  return [...set].filter(Boolean);
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pushUnique(
  target: SearchResultItem[],
  seen: Set<string>,
  item: SearchResultItem
) {
  const key = `${item.id}__${item.name}__${item.rank ?? ""}__${item.index ?? ""}`;
  if (!item.id && !item.name) return;
  if (seen.has(key)) return;
  seen.add(key);
  target.push(item);
}

function collectItemsDeep(
  value: any,
  out: SearchResultItem[],
  seen: Set<string>
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectItemsDeep(item, out, seen);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  const id = String(value.id ?? "").trim();
  const name = String(value.name ?? value.display ?? "").trim();
  const rank = toNumberOrNull(value.rank);
  const index = toNumberOrNull(value.index);

  if (id && name) {
    pushUnique(out, seen, {
      id,
      name,
      rank,
      index,
    });
  }

  for (const nested of Object.values(value)) {
    collectItemsDeep(nested, out, seen);
  }
}

function extractItemsFromAllSearch(json: any) {
  const out: SearchResultItem[] = [];
  const seen = new Set<string>();

  collectItemsDeep(json, out, seen);

  return out;
}

function findRankFromItems(
  items: SearchResultItem[],
  placeId: string,
  placeName: string
) {
  const targetId = String(placeId || "").trim();
  const targetNames = makeNameCandidates(placeName);

  if (targetId) {
    const foundById = items.find(
      (item) => String(item.id).trim() === targetId
    );

    if (foundById) {
      return foundById.rank ?? foundById.index ?? items.indexOf(foundById) + 1;
    }
  }

  if (targetNames.length) {
    const foundByName = items.find((item) => {
      const normalized = normalizeText(item.name);
      if (!normalized) return false;

      return targetNames.some(
        (target) =>
          target &&
          (normalized === target ||
            normalized.includes(target) ||
            target.includes(normalized))
      );
    });

    if (foundByName) {
      return foundByName.rank ?? foundByName.index ?? items.indexOf(foundByName) + 1;
    }
  }

  return "-";
}

async function forceScrollLeftList(page: any) {
  await page.evaluate(() => {
    const all = Array.from(
      document.querySelectorAll("div, section, aside, main")
    ) as HTMLElement[];

    const scrollables = all.filter((el) => {
      const style = getComputedStyle(el);
      return (
        el.scrollHeight > el.clientHeight + 150 &&
        style.overflowY !== "visible"
      );
    });

    // 가장 왼쪽/좁은 리스트 후보 우선
    scrollables.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      const aScore = ar.left + ar.width;
      const bScore = br.left + br.width;

      return aScore - bScore;
    });

    const target = scrollables[0];
    if (target) {
      target.scrollTop += Math.max(1200, target.clientHeight);
    }

    window.scrollBy(0, 800);
  });
}

async function findRankWithAllSearch(
  keyword: string,
  placeId: string,
  placeName: string
) {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    locale: "ko-KR",
    viewport: { width: 1440, height: 1200 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  const collected: SearchResultItem[] = [];
  const seen = new Set<string>();
  const allSearchUrls = new Set<string>();

  const mergeItems = (items: SearchResultItem[]) => {
    for (const item of items) {
      pushUnique(collected, seen, item);
    }
  };

  page.on("request", (request) => {
    const url = request.url();

    if (url.includes("/p/api/search/allSearch")) {
      allSearchUrls.add(url);
      console.log("[ALLSEARCH request]", url);
    }
  });

  page.on("response", async (response) => {
    try {
      const url = response.url();

      if (!url.includes("/p/api/search/allSearch")) return;

      console.log("[ALLSEARCH response]", response.status(), url);

      const json = await response.json().catch(() => null);
      if (!json) return;

      const items = extractItemsFromAllSearch(json);
      if (!items.length) return;

      mergeItems(items);

      console.log(
        "[ALLSEARCH sample]",
        items.slice(0, 10).map((item) => ({
          id: item.id,
          name: item.name,
          rank: item.rank,
          index: item.index,
        }))
      );

      console.log("[ALLSEARCH totalCollected]", collected.length);
    } catch (error) {
      console.error("[ALLSEARCH parse error]", error);
    }
  });

  try {
    const url = `https://map.naver.com/p/search/${encodeURIComponent(
      keyword
    )}?c=12.00,0,0,0,dh`;

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    console.log("[ALLSEARCH final url]", page.url());
    console.log("[ALLSEARCH title]", await page.title());

    await page.waitForTimeout(4000);

    // 1차: 초기 응답 확인
    let rank = findRankFromItems(collected, placeId, placeName);
    if (rank !== "-") {
      return {
        rank,
        source: "allsearch-initial",
        debug: {
          totalCollected: collected.length,
          allSearchCount: allSearchUrls.size,
          sample: collected.slice(0, 20),
        },
      };
    }

    // 2차: 리스트를 더 깊게 스크롤
    let stableCount = 0;
    let previousCount = collected.length;

    for (let i = 0; i < 35; i++) {
      await forceScrollLeftList(page);
      await page.waitForTimeout(1500);

      rank = findRankFromItems(collected, placeId, placeName);
      if (rank !== "-") {
        return {
          rank,
          source: "allsearch-scroll",
          debug: {
            totalCollected: collected.length,
            allSearchCount: allSearchUrls.size,
            sample: collected.slice(0, 20),
          },
        };
      }

      if (collected.length === previousCount) {
        stableCount += 1;
      } else {
        stableCount = 0;
        previousCount = collected.length;
      }

      console.log(
        `[ALLSEARCH scroll] step=${i + 1}, totalCollected=${collected.length}, stableCount=${stableCount}`
      );

      // 여러 번 연속으로 더 안 늘어나면 중단
      if (stableCount >= 5) {
        break;
      }
    }

    // 3차: 마지막 이름 fallback
    rank = findRankFromItems(collected, placeId, placeName);

    return {
      rank,
      source: rank === "-" ? "allsearch-not-found" : "allsearch-fallback",
      debug: {
        totalCollected: collected.length,
        allSearchCount: allSearchUrls.size,
        sample: collected.slice(0, 30),
      },
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();

    if (!raw || !raw.trim()) {
      console.error("[check-place-rank] empty request body");
      return Response.json(
        {
          ok: false,
          error: "빈 요청 body",
        },
        { status: 400 }
      );
    }

    let body: any;

    try {
      body = JSON.parse(raw);
    } catch {
      console.error("[check-place-rank] invalid json body:", raw);
      return Response.json(
        {
          ok: false,
          error: "잘못된 JSON body",
        },
        { status: 400 }
      );
    }

    const keyword = String(body.keyword || "").trim();
    const placeId = String(body.placeId || "").trim();
    const placeName = String(body.placeName || "").trim();

    console.log(
      `[check-place-rank] 시작: ${keyword} / ${placeName} / placeId=${placeId || "-"}`
    );

    if (!keyword || !placeId) {
      return Response.json(
        {
          ok: false,
          error: "keyword 또는 placeId가 없습니다.",
        },
        { status: 400 }
      );
    }

    const result = await findRankWithAllSearch(keyword, placeId, placeName);

    console.log(
      `[check-place-rank] 결과: ${keyword} / ${placeName} / rank=${result.rank} / source=${result.source}`
    );

    return Response.json({
      ok: true,
      rank: result.rank,
      monthly: "-",
      mobile: "-",
      pc: "-",
      source: result.source,
      debug: result.debug,
    });
  } catch (error) {
    console.error("[check-place-rank] fatal error:", error);

    return Response.json({
      ok: true,
      rank: "-",
      monthly: "-",
      mobile: "-",
      pc: "-",
      source: "allsearch-error",
    });
  }
}