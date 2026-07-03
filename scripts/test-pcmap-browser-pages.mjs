import { chromium } from "playwright-core";

const keyword = process.argv[2] || "한남동 맛집";
const targetName = process.argv[3] || "뉴오더클럽 한남";
const executablePath =
  process.env.CHROME_EXECUTABLE_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  locale: "ko-KR",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
});
const page = await context.newPage();
const pages = new Map();

page.on("response", async (response) => {
  if (!response.url().includes("pcmap-api.place.naver.com/graphql")) return;
  const request = response.request();
  const postData = request.postData();
  if (!postData || !postData.includes("getRestaurantsPcmap")) return;
  try {
    const payload = JSON.parse(postData);
    const operations = Array.isArray(payload) ? payload : [payload];
    const operation = operations.find(
      (item) => item?.operationName === "getRestaurantsPcmap"
    );
    const start = Number(operation?.variables?.input?.start ?? 0);
    const json = await response.json();
    const parts = Array.isArray(json) ? json : [json];
    const restaurantPart = parts.find(
      (item) => item?.data?.restaurants?.businesses
    );
    const businesses = restaurantPart?.data?.restaurants?.businesses;
    const items = Array.isArray(businesses?.items) ? businesses.items : [];
    pages.set(start, {
      start,
      httpStatus: response.status(),
      total: Number(businesses?.total ?? 0),
      names: items.map((item) => String(item?.name ?? "")).filter(Boolean),
    });
  } catch {
    // 진단 결과에 빈 페이지로 남긴다. 요청 헤더·쿠키는 출력하지 않는다.
  }
});

try {
  await page.goto(
    `https://map.naver.com/p/search/${encodeURIComponent(keyword)}?c=14.00,0,0,3,dh`,
    { waitUntil: "domcontentloaded", timeout: 60_000 }
  );
  const frame = page.frameLocator('iframe[title="Naver Place Search"]');
  await frame.getByRole("button", { name: "2", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  for (const pageNumber of [2, 3]) {
    await frame
      .getByRole("button", { name: String(pageNumber), exact: true })
      .click();
    await page.waitForTimeout(1_500);
  }

  const ordered = [...pages.values()].sort((a, b) => a.start - b.start);
  const found = ordered.find((entry) => entry.names.includes(targetName));
  console.log(
    JSON.stringify(
      {
        ok: ordered.length > 0,
        keyword,
        targetName,
        capturedPages: ordered.map((entry) => ({
          start: entry.start,
          httpStatus: entry.httpStatus,
          count: entry.names.length,
          total: entry.total,
          names: entry.names,
        })),
        targetPage: found?.start ?? null,
        targetPositionInPage: found
          ? found.names.indexOf(targetName) + 1
          : null,
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
