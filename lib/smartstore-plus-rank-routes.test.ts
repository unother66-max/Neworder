import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  keywordFindFirst: vi.fn(),
  keywordFindMany: vi.fn(),
  productFindMany: vi.fn(),
  historyFindMany: vi.fn(),
  historyCreate: vi.fn(),
  findPlusRank: vi.fn(),
  findOpenApiRank: vi.fn(),
}));

vi.mock("next-auth/next", () => ({ getServerSession: mocks.getSession }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    smartstoreKeyword: {
      findFirst: mocks.keywordFindFirst,
      findMany: mocks.keywordFindMany,
    },
    smartstoreProduct: { findMany: mocks.productFindMany },
    smartstoreRankHistory: {
      findMany: mocks.historyFindMany,
      create: mocks.historyCreate,
    },
  },
}));
vi.mock("@/lib/naver-shopping-nextdata-rank", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/naver-shopping-nextdata-rank")
  >();
  return { ...actual, findProductRankViaNaverShoppingNextData: mocks.findPlusRank };
});
vi.mock("@/lib/naver-openapi-shopping-rank", () => ({
  findProductRankViaNaverShopOpenApi: mocks.findOpenApiRank,
}));
vi.mock("@/lib/smartstore-bot-shield", () => ({
  isSmartstoreNaverRateLimitedError: () => false,
}));

import { POST as checkRank } from "@/app/api/smartstore-keyword-check-rank/route";
import { GET as listProducts } from "@/app/api/smartstore-product-list/route";
import { GET as runCron } from "@/app/api/cron/smartstore-plus-rank-tracking/route";
import { NaverShoppingNextDataHttpError } from "@/lib/naver-shopping-nextdata-rank";

const product = {
  id: "db-product-1",
  userId: "user-1",
  productId: "channel-target",
  productUrl: "https://smartstore.naver.com/store/products/channel-target",
  name: "타겟 상품",
  space: "PLUS_STORE",
  autoTracking: true,
};

function foundResult(rank: number) {
  return {
    source: "PLUS_STORE_ORGANIC_NS_PORTAL" as const,
    rank,
    pageNum: 1,
    position: rank,
    rankLabel: `${rank}위`,
    notFound: false,
    requestUrl: "https://example.test/search",
    responseStatus: 200,
    responsePreview: "{}",
    parserSource: "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot" as const,
    totalProductCount: 20,
    matchedProductNo: "channel-target",
    matchedName: "타겟 상품",
    diagnostics: {
      keyword: "테스트 키워드",
      productName: "타겟 상품",
      storedProductId: "channel-target",
      storedChannelProductId: "channel-target",
      storedMallProductId: null,
      matchedProductId: "channel-target",
      matchedChannelProductId: "channel-target",
      matchedMallProductId: "mall-target",
      productType: "plus-store" as const,
      ranking: rank,
      page: 1,
      indexInPage: rank,
      searchApiSource:
        "ns-portal.shopping.naver.com/api/v2/shopping-paged-slot" as const,
      totalFetchedCount: 21,
      dedupedCount: 20,
      isMatched: true,
      reason: "FOUND" as const,
      debugReason: null,
    },
  };
}

function rankRequest() {
  return new Request("http://localhost/api/smartstore-keyword-check-rank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keywordId: "keyword-1" }),
  });
}

describe("smartstore plus rank routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.keywordFindFirst.mockResolvedValue({
      id: "keyword-1",
      keyword: "테스트 키워드",
      product,
    });
    mocks.historyCreate.mockResolvedValue({ id: "history-1" });
  });

  it("saves a snapshot whenever a rank is found", async () => {
    mocks.findPlusRank.mockResolvedValue(foundResult(5));

    const response = await checkRank(rankRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, saved: true, rank: 5, reason: "FOUND" });
    expect(mocks.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "db-product-1",
        keyword: "테스트 키워드",
        rank: 5,
      }),
    });
  });

  it("stores a null rank for a completed not-found check without copying the old rank", async () => {
    const notFound = foundResult(5);
    mocks.findPlusRank.mockResolvedValue({
      ...notFound,
      rank: null,
      pageNum: null,
      position: null,
      rankLabel: "20개 확인 / 미발견",
      notFound: true,
      diagnostics: {
        ...notFound.diagnostics,
        ranking: null,
        isMatched: false,
        reason: "NOT_FOUND_IN_FETCHED_RESULTS",
        debugReason: "deeper pagination unsupported",
      },
    });

    const response = await checkRank(rankRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reason).toBe("NOT_FOUND_IN_FETCHED_RESULTS");
    expect(mocks.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ rank: null, rankLabel: "20개 확인 / 미발견" }),
    });
  });

  it("returns ok:false when history persistence fails", async () => {
    mocks.findPlusRank.mockResolvedValue(foundResult(5));
    mocks.historyCreate.mockRejectedValue(new Error("database unavailable"));

    const response = await checkRank(rankRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ ok: false, reason: "HISTORY_SAVE_FAILED" });
  });

  it("does not create a snapshot when fetching or parsing fails", async () => {
    mocks.findPlusRank.mockRejectedValue(
      new NaverShoppingNextDataHttpError(
        "parse failed",
        200,
        "https://example.test/search",
        "bad body",
        "PARSE_FAILED"
      )
    );

    const response = await checkRank(rankRequest());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, reason: "PARSE_FAILED" });
    expect(mocks.historyCreate).not.toHaveBeenCalled();
  });

  it("same-day repeated updates save the newest rank instead of reusing an old value", async () => {
    mocks.findPlusRank
      .mockResolvedValueOnce(foundResult(8))
      .mockResolvedValueOnce(foundResult(3));
    mocks.historyCreate
      .mockResolvedValueOnce({ id: "history-old" })
      .mockResolvedValueOnce({ id: "history-new" });

    await checkRank(rankRequest());
    await checkRank(rankRequest());

    expect(mocks.historyCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ rank: 3 }) })
    );
  });

  it("the list API returns the newest snapshot and does not use product.updatedAt", async () => {
    mocks.productFindMany.mockResolvedValue([
      {
        ...product,
        category: null,
        thumbnailLink: null,
        imageUrl: null,
        rankPinned: false,
        rankPinnedAt: null,
        createdAt: new Date("2026-07-01T00:00:00Z"),
        updatedAt: new Date("2026-07-11T00:00:00Z"),
        keywords: [
          {
            id: "keyword-1",
            keyword: "테스트 키워드",
            mobileVolume: null,
            pcVolume: null,
            totalVolume: null,
            sortOrder: 0,
            isTracking: true,
            createdAt: new Date("2026-07-01T00:00:00Z"),
            updatedAt: new Date("2026-07-11T00:00:00Z"),
          },
        ],
      },
    ]);
    mocks.historyFindMany.mockResolvedValue([
      {
        productId: "db-product-1",
        keyword: "테스트 키워드",
        rank: 3,
        pageNum: 1,
        position: 3,
        rankLabel: "3위",
        createdAt: new Date("2026-07-10T01:00:00Z"),
      },
      {
        productId: "db-product-1",
        keyword: "테스트 키워드",
        rank: 8,
        pageNum: 1,
        position: 8,
        rankLabel: "8위",
        createdAt: new Date("2026-07-09T01:00:00Z"),
      },
    ]);

    const response = await listProducts(
      new Request("http://localhost/api/smartstore-product-list?space=PLUS_STORE")
    );
    const body = await response.json();

    expect(body.products[0].keywords[0]).toMatchObject({
      latestRank: 3,
      latestRankLabel: "3위",
      latestRankAt: "2026-07-10T01:00:00.000Z",
    });
    expect(body.products[0].latestUpdatedAt).not.toContain("07. 11");
  });

  it("cron failures do not create a success-like snapshot", async () => {
    mocks.keywordFindMany.mockResolvedValue([
      { id: "keyword-1", keyword: "테스트 키워드", product },
    ]);
    mocks.findPlusRank.mockRejectedValue(
      new NaverShoppingNextDataHttpError(
        "empty",
        200,
        "https://example.test/search",
        "{}",
        "EMPTY_RESPONSE"
      )
    );

    const response = await runCron(
      new Request("http://localhost/api/cron/smartstore-plus-rank-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, savedCount: 0, failedCount: 1 });
    expect(mocks.historyCreate).not.toHaveBeenCalled();
  });
});
