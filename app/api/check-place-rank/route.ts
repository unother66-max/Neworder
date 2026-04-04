export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { chromium } from "playwright";

type RestaurantItem = {
  id: string;
  name: string;
};

type CapturedGraphql = {
  headers: Record<string, string>;
  payload: any[];
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

function extractItemsFromBatch(json: any): RestaurantItem[] {
  const batch = Array.isArray(json) ? json : [json];

  const items =
    batch.find((entry) => Array.isArray(entry?.data?.restaurants?.items))?.data
      ?.restaurants?.items ?? [];

  if (!Array.isArray(items)) return [];

  return items
    .map((item: any) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim(),
    }))
    .filter((item: RestaurantItem) => item.id || item.name);
}

function buildReplayPayload(
  basePayload: any[],
  keyword: string,
  start: number
) {
  const cloned = JSON.parse(JSON.stringify(basePayload));
  const compactKeyword = keyword.replace(/\s+/g, "");

  const restaurantOp = cloned.find(
    (item: any) => item?.operationName === "getRestaurants"
  );

  if (restaurantOp?.variables?.restaurantListInput) {
    restaurantOp.variables.restaurantListInput.query = compactKeyword;
    restaurantOp.variables.restaurantListInput.start = start;
  }

  if (restaurantOp?.variables?.restaurantListFilterInput) {
    restaurantOp.variables.restaurantListFilterInput.query = compactKeyword;
    restaurantOp.variables.restaurantListFilterInput.start = start;
  }

  const adOp = cloned.find(
    (item: any) => item?.operationName === "getAdBusinessList"
  );

  if (adOp?.variables?.input) {
    adOp.variables.input.query = compactKeyword;
    adOp.variables.input.start = Math.floor((start - 1) / 70) + 1;
  }

  return cloned;
}

function cleanReplayHeaders(headers: Record<string, string>) {
  const nextHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();

    if (
      [
        "host",
        "content-length",
        "connection",
        "sec-fetch-dest",
        "sec-fetch-mode",
        "sec-fetch-site",
        "priority",
      ].includes(lower)
    ) {
      continue;
    }

    nextHeaders[lower] = value;
  }

  nextHeaders["content-type"] = "application/json";
  nextHeaders["accept"] = "*/*";
  nextHeaders["accept-language"] = nextHeaders["accept-language"] || "ko";
  nextHeaders["origin"] = "https://pcmap.place.naver.com";

  return nextHeaders;
}

async function findRankWithPlaywright(
  keyword: string,
  placeId: string,
  placeName: string
) {
  const targetId = String(placeId || "").trim();
  const targetNames = makeNameCandidates(placeName);

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

  const collected: RestaurantItem[] = [];
  const seen = new Set<string>();
  let capturedGraphql: CapturedGraphql | null = null;

  const pushItems = (items: RestaurantItem[]) => {
    for (const item of items) {
      const key = item.id || item.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      collected.push(item);
    }
  };

  // 디버그용: 주요 요청 로그
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("graphql") ||
      url.includes("search") ||
      url.includes("place") ||
      url.includes("list")
    ) {
      console.log("[PW-RANK request]", url);
    }
  });

  // GraphQL request 캡처
  page.on("request", async (request) => {
    try {
      const url = request.url();
      if (!url.includes("graphql")) return;
      if (!url.includes("pcmap-api.place.naver.com")) return;

      const postData = request.postData();
      if (!postData) return;

      let parsed: any;
      try {
        parsed = JSON.parse(postData);
      } catch {
        return;
      }

      const batch = Array.isArray(parsed) ? parsed : [parsed];

      const hasGetRestaurants = batch.some(
        (item: any) => item?.operationName === "getRestaurants"
      );

      if (!hasGetRestaurants) return;

      if (!capturedGraphql) {
        capturedGraphql = {
          headers: request.headers(),
          payload: batch,
        };

        console.log(
          "[PW-RANK] graphql request captured:",
          capturedGraphql.payload.map((item: any) => item?.operationName)
        );
      }
    } catch (error) {
      console.error("[PW-RANK] request capture error:", error);
    }
  });

  // 주요 response 로그 + GraphQL 응답 수집
  page.on("response", async (response) => {
    try {
      const url = response.url();

      if (
        url.includes("graphql") ||
        url.includes("search") ||
        url.includes("place") ||
        url.includes("list")
      ) {
        console.log("[PW-RANK response]", response.status(), url);
      }

      if (!url.includes("graphql")) return;
      if (!url.includes("pcmap-api.place.naver.com")) return;

      const json = await response.json().catch(() => null);
      if (!json) return;

      const items = extractItemsFromBatch(json);
      if (!items.length) return;

      pushItems(items);

      console.log(
        "[PW-RANK] live sample:",
        items.slice(0, 10).map((v) => `${v.id}:${v.name}`)
      );
    } catch (error) {
      console.error("[PW-RANK] response parse error:", error);
    }
  });

  try {
    const searchUrl = `https://map.naver.com/p/search/${encodeURIComponent(
      keyword
    )}`;

    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    console.log("[PW-RANK] final url:", page.url());
    console.log("[PW-RANK] title:", await page.title());

    await page.waitForTimeout(3000);

    const htmlPreview = await page.content();
    console.log("[PW-RANK] html preview:", htmlPreview.slice(0, 500));

    await page.waitForTimeout(7000);

    if (!capturedGraphql) {
      console.log("[PW-RANK] initial graphql not captured");
    }

    // 1차: 초기 live 응답에서 바로 찾기
    if (targetId) {
      const liveIndex = collected.findIndex(
        (item) => String(item.id).trim() === targetId
      );

      if (liveIndex !== -1) {
        return {
          rank: liveIndex + 1,
          source: "playwright-live",
          debug: {
            matchedBy: "id",
            totalCollected: collected.length,
            sample: collected.slice(0, 10),
          },
        };
      }
    }

    // 2차: 캡처한 성공 GraphQL 요청으로 브라우저 안에서 페이지별 재호출
    const captured = capturedGraphql as CapturedGraphql | null;

if (captured) {
  const replayHeaders = cleanReplayHeaders(captured.headers);

  for (let start = 1; start <= 351; start += 70) {
    const replayPayload = buildReplayPayload(
      captured.payload,
      keyword,
      start
    );

        const replayJson = await page.evaluate(
          async ({ headers, payload }) => {
            const res = await fetch("https://pcmap-api.place.naver.com/graphql", {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
              credentials: "include",
            });

            const text = await res.text();

            try {
              return JSON.parse(text);
            } catch {
              return { __rawText: text };
            }
          },
          {
            headers: replayHeaders,
            payload: replayPayload,
          }
        );

        if ((replayJson as any)?.__rawText) {
          console.log(
            `[PW-RANK] replay start=${start} non-json:`,
            String((replayJson as any).__rawText).slice(0, 200)
          );
          continue;
        }

        const items = extractItemsFromBatch(replayJson);
        pushItems(items);

        console.log(
          `[PW-RANK] replay start=${start} sampleIds:`,
          items.slice(0, 10).map((item) => item.id)
        );

        console.log(
          `[PW-RANK] replay start=${start} sampleNames:`,
          items.slice(0, 10).map((item) => item.name)
        );

        if (targetId) {
          const indexById = collected.findIndex(
            (item) => String(item.id).trim() === targetId
          );

          if (indexById !== -1) {
            return {
              rank: indexById + 1,
              source: "playwright-replay-id",
              debug: {
                matchedBy: "id",
                totalCollected: collected.length,
                sample: collected.slice(0, 10),
              },
            };
          }
        }

        if (targetNames.length) {
          const indexByName = collected.findIndex((item) => {
            const name = normalizeText(item.name);
            if (!name) return false;

            return targetNames.some(
              (target) =>
                target &&
                (name === target ||
                  name.includes(target) ||
                  target.includes(name))
            );
          });

          if (indexByName !== -1) {
            return {
              rank: indexByName + 1,
              source: "playwright-replay-name",
              debug: {
                matchedBy: "name",
                totalCollected: collected.length,
                sample: collected.slice(0, 10),
              },
            };
          }
        }
      }
    }

    return {
      rank: "-",
      source: "playwright-not-found",
      debug: {
        placeId: targetId,
        placeName,
        totalCollected: collected.length,
        capturedGraphql: Boolean(capturedGraphql),
        sample: collected.slice(0, 20),
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

    const result = await findRankWithPlaywright(keyword, placeId, placeName);

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
      source: "playwright-error",
    });
  }
}