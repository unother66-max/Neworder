import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getKeywordSearchVolume: vi.fn(),
  getNaverPlaceReviewSnapshot: vi.fn(),
  extractReviewFeatureKeywordsFromObject: vi.fn(),
  fetchAllSearchPlacesAutoDetailed: vi.fn(),
  fetch: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  historyUpsert: vi.fn(),
  placeUpdate: vi.fn(),
  getPlaceNameSearchVolume: vi.fn(),
  getServerSession: vi.fn(),
  after: vi.fn(),
  loadRegisteredKeywordCacheState: vi.fn(),
  enqueueRegisteredKeywordCollectionTargets: vi.fn(),
  processRegisteredKeywordQueue: vi.fn(),
}));

vi.mock("@/lib/getKeywordSearchVolume", () => ({
  getKeywordSearchVolume: mocks.getKeywordSearchVolume,
}));

vi.mock("@/lib/getNaverPlaceReviewSnapshot", () => ({
  getNaverPlaceReviewSnapshot: mocks.getNaverPlaceReviewSnapshot,
  extractReviewFeatureKeywordsFromObject:
    mocks.extractReviewFeatureKeywordsFromObject,
}));

vi.mock("@/lib/naver-map-all-search-auto", () => ({
  fetchAllSearchPlacesAutoDetailed: mocks.fetchAllSearchPlacesAutoDetailed,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    place: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      update: mocks.placeUpdate,
    },
    placeReviewHistory: { upsert: mocks.historyUpsert },
  },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});

vi.mock("@/lib/getPlaceNameSearchVolume", () => ({
  getPlaceNameSearchVolume: mocks.getPlaceNameSearchVolume,
}));

vi.mock(
  "@/lib/place-registered-keyword-cache",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/place-registered-keyword-cache")
      >();
    return {
      ...actual,
      loadRegisteredKeywordCacheState:
        mocks.loadRegisteredKeywordCacheState,
    };
  }
);

vi.mock("@/lib/place-registered-keyword-queue", () => ({
  enqueueRegisteredKeywordCollectionTargets:
    mocks.enqueueRegisteredKeywordCollectionTargets,
  processRegisteredKeywordQueue: mocks.processRegisteredKeywordQueue,
}));

import { POST } from "@/app/api/place-rank-analyze/route";
import { POST as trackPlaceReview } from "@/app/api/place-review-track/route";

const FULL_KEYWORD = "한남동 맛집";

const newOrderClub = {
  id: "1699073167",
  name: "뉴오더클럽 한남",
  category: "양식",
  businessCategory: "restaurant",
  roadAddress: "서울 용산구 이태원로54길 58-14",
  address: "서울 용산구 한남동 683-55",
  x: "127.0007",
  y: "37.5359",
  visitorReviewCount: 725,
  blogCafeReviewCount: 900,
  totalReviewCount: 1625,
  saveCount: null,
  newOpening: null,
};

const gallant = {
  ...newOrderClub,
  id: "2035306921",
  name: "갈란트",
  roadAddress: "서울 용산구 한남동",
  newOpening: true,
};

const pipeGround = {
  ...newOrderClub,
  id: "13100550",
  name: "파이프그라운드 한남점",
  roadAddress: "서울 용산구 한남대로27길 66",
};

const buzzaPizza = {
  ...newOrderClub,
  id: "11625358",
  name: "부자피자 1호점",
  roadAddress: "서울 용산구 이태원로55가길 28",
};

function keywordCacheEntry(params: {
  publicPlaceId: string;
  keywords?: string[];
  collectedAt?: Date | null;
  hasSuccessfulValue?: boolean;
  source?: string | null;
  lastAttemptAt?: Date | null;
  cooldownUntil?: Date | null;
  refreshLeaseUntil?: Date | null;
  lastFailureCode?: string | null;
}) {
  return {
    publicPlaceId: params.publicPlaceId,
    keywords: params.keywords ?? [],
    hasSuccessfulValue: params.hasSuccessfulValue ?? true,
    source:
      "source" in params ? params.source ?? null : "NAVER_INFORMATION",
    collectedAt:
      "collectedAt" in params
        ? params.collectedAt ?? null
        : new Date("2026-07-01T00:00:00.000Z"),
    lastAttemptAt: params.lastAttemptAt ?? null,
    cooldownUntil: params.cooldownUntil ?? null,
    refreshLeaseUntil: params.refreshLeaseUntil ?? null,
    lastFailureCode: params.lastFailureCode ?? null,
    placeName: null,
    category: null,
    businessType: null,
    x: null,
    y: null,
    queueStatus: "IDLE",
    queuedAt: null,
    processingStartedAt: null,
  };
}

function placeListBatch(
  total: number,
  items: Array<Record<string, unknown>> = [newOrderClub]
) {
  return [
    {
      data: {
        places: {
          businesses: { total, items },
        },
      },
    },
  ];
}

function withoutNewOpening<T extends Record<string, unknown>>(item: T) {
  const copy: Record<string, unknown> = { ...item };
  delete copy.newOpening;
  return copy;
}

function analyzeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/place-rank-analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      keyword: FULL_KEYWORD,
      businessesGraphqlSchemaVersion: 2,
      businessesGraphqlSource: "pcmap-graphql",
      ...body,
    }),
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("place-rank-analyze route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getKeywordSearchVolume.mockResolvedValue({
      ok: true,
      mobile: 100,
      pc: 20,
      total: 120,
    });
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      ok: false,
      reason: "REVIEW_METRICS_INCOMPLETE",
      debugReason: "restaurant:SAVE_COUNT_UNAVAILABLE",
      hintType: "restaurant",
      chosenType: "restaurant",
      triedTypes: ["restaurant", "place"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "MISS",
      totalReviewCount: 1625,
      visitorReviewCount: 725,
      blogReviewCount: 900,
      saveCountText: null,
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      reviewFeatureKeywords: null,
      reviewFeatureKeywordsStatus: "UNAVAILABLE",
      keywordList: null,
      keywordListStatus: "UNAVAILABLE",
    });
    mocks.extractReviewFeatureKeywordsFromObject.mockImplementation(
      (item: { microReview?: unknown }) =>
        Object.prototype.hasOwnProperty.call(item, "microReview")
          ? {
              keywords: Array.isArray(item.microReview)
                ? item.microReview
                : [],
              status: "AVAILABLE",
            }
          : { keywords: null, status: "UNAVAILABLE" }
    );
    mocks.fetchAllSearchPlacesAutoDetailed.mockResolvedValue({
      ok: false,
      failureCode: "EMPTY_LIST",
      userMessage: "empty",
    });
    mocks.fetch.mockRejectedValue(new Error("unexpected network request"));
    mocks.getPlaceNameSearchVolume.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    mocks.historyUpsert.mockResolvedValue({ id: "history-1" });
    mocks.placeUpdate.mockResolvedValue({});
    mocks.getServerSession.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
    mocks.after.mockImplementation(() => undefined);
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map(),
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.enqueueRegisteredKeywordCollectionTargets.mockResolvedValue({
      requested: 0,
      queued: 0,
      deduped: 0,
      freshSkipped: 0,
    });
    mocks.processRegisteredKeywordQueue.mockResolvedValue({ status: "EMPTY" });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the exact regional keyword and forwards restaurant metadata to the review snapshot", async () => {
    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(37),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      keyword: FULL_KEYWORD,
      originalKeyword: FULL_KEYWORD,
      requestedKeyword: FULL_KEYWORD,
      graphqlKeyword: FULL_KEYWORD,
      totalCount: 37,
      resultCount: 1,
      fallbackUsed: false,
      saveCountUnavailableCount: 1,
    });
    expect(body.debug).toMatchObject({
      originalKeyword: FULL_KEYWORD,
      requestedKeyword: FULL_KEYWORD,
      graphqlKeyword: FULL_KEYWORD,
      queryUsed: FULL_KEYWORD,
      totalCount: 37,
      fallbackUsed: false,
      primaryError: null,
    });
    expect(body.list[0]).toMatchObject({
      placeId: newOrderClub.id,
      name: newOrderClub.name,
      category: newOrderClub.category,
      businessCategory: "restaurant",
      registeredKeywordsCacheStatus: "QUEUE_PENDING",
      review: {
        visitor: 725,
        visitorStatus: "AVAILABLE",
        blog: 900,
        blogStatus: "AVAILABLE",
        total: 1625,
        save: null,
        saveStatus: "UNAVAILABLE",
        chosenType: "restaurant",
        debugReason: "restaurant:SAVE_COUNT_UNAVAILABLE",
      },
    });
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: newOrderClub.id,
        placeName: newOrderClub.name,
        category: newOrderClub.category,
        businessType: "restaurant",
        placeUrl: expect.stringContaining(
          `/restaurant/${newOrderClub.id}/home`
        ),
        pcmapUrl: expect.stringContaining(
          `/restaurant/${newOrderClub.id}/home`
        ),
        collectRegisteredKeywords: false,
      })
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("maps pcmap newOpening without changing rank or review metrics", async () => {
    const legacyBuzzaPizza = withoutNewOpening(buzzaPizza);
    const businesses = [
      gallant,
      { ...pipeGround, newOpening: false },
      legacyBuzzaPizza,
    ];

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(3, businesses),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.list).toHaveLength(3);
    expect(body.list.map((row: { rank: number }) => row.rank)).toEqual([
      1, 2, 3,
    ]);
    expect(body.list[0]).toMatchObject({
      placeId: gallant.id,
      name: gallant.name,
      isNewOpen: true,
      newOpenLabel: "새로오픈",
      source: "pcmap-graphql",
      review: { visitor: 725, blog: 900, total: 1625, save: null },
    });
    expect(body.list[1]).toMatchObject({
      name: pipeGround.name,
      isNewOpen: false,
      newOpenLabel: null,
    });
    expect(body.list[2]).toMatchObject({
      name: buzzaPizza.name,
      isNewOpen: null,
      newOpenLabel: null,
    });
    expect(body).toMatchObject({
      source: "pcmap-graphql",
      debug: {
        responseCache: "none",
        gallantNewOpenTrace: {
          placeId: gallant.id,
          rawHasNewOpening: true,
          rawNewOpening: true,
          mappedIsNewOpen: true,
          finalIsNewOpen: true,
          finalNewOpenLabel: "새로오픈",
        },
      },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects a legacy fieldless batch and recollects the same keyword", async () => {
    const legacyGallant = withoutNewOpening(gallant);
    mocks.fetch.mockImplementation(async () =>
      jsonResponse(placeListBatch(1, [gallant]))
    );

    const response = await POST(
      analyzeRequest({
        businessesGraphqlSchemaVersion: 1,
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(1, [legacyGallant]),
      })
    );
    const body = await response.json();
    const row = body.list.find(
      (item: { placeId?: string }) => item.placeId === gallant.id
    );

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalled();
    expect(row).toMatchObject({
      isNewOpen: true,
      newOpenLabel: "새로오픈",
      source: "pcmap-graphql",
    });
    expect(body.debug).toMatchObject({
      fallbackUsed: true,
      responseCache: "none",
      gallantNewOpenTrace: {
        rawNewOpening: true,
        finalIsNewOpen: true,
      },
    });
    expect(body.debug.primaryError).toContain("CLIENT_BATCH_SCHEMA_STALE");
  });

  it("rejects a client batch for 맛집 and never accepts its nationwide total", async () => {
    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: "맛집",
        businessesGraphqlBatch: placeListBatch(911_430, [
          {
            ...newOrderClub,
            id: "nationwide-result",
            name: "전국 맛집 결과",
          },
        ]),
        mapAllSearchPlaces: [newOrderClub],
        mapAllSearchTotalCount: 19,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalCount).toBe(19);
    expect(body.totalCount).not.toBe(911_430);
    expect(body.list).toHaveLength(1);
    expect(body.list[0].name).toBe(newOrderClub.name);
    expect(body.list[0]).toMatchObject({
      isNewOpen: null,
      newOpenLabel: null,
      source: "allsearch",
    });
    expect(body.source).toBe("allsearch");
    expect(body.list.some((row: { name?: string }) => row.name === "전국 맛집 결과"))
      .toBe(false);
    expect(body.debug).toMatchObject({
      originalKeyword: FULL_KEYWORD,
      requestedKeyword: FULL_KEYWORD,
      graphqlKeyword: FULL_KEYWORD,
      queryUsed: FULL_KEYWORD,
      totalCount: 19,
      fallbackUsed: true,
    });
    expect(body.debug.primaryError).toMatch(
      /^(?:CLIENT_BATCH_QUERY_MISMATCH|\[REDACTED\]):맛집$/
    );
    expect(body.diagnostics).toMatchObject({
      resolvedSource: "mapAllSearch",
      fallbackUsed: true,
      queryUsed: FULL_KEYWORD,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uses the full keyword for every GraphQL attempt and exposes primary-error fallback diagnostics", async () => {
    mocks.fetch.mockImplementation(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body ?? "[]")) as Array<{
          variables?: {
            input?: {
              businessType?: string;
              deviceType?: string;
              query?: string;
              x?: string;
              y?: string;
              start?: number;
              display?: number;
              isPcmap?: boolean;
            };
          };
        }>;
        const businessType = payload[0]?.variables?.input?.businessType;

        if (businessType === "restaurant") {
          return jsonResponse([
            {
              errors: [
                {
                  message:
                    "Cannot read properties of undefined (reading 'charAt')",
                },
              ],
            },
          ]);
        }

        if (businessType === "place") {
          return jsonResponse(placeListBatch(23));
        }

        throw new Error(`unexpected businessType: ${businessType}`);
      }
    );

    const response = await POST(analyzeRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalCount).toBe(23);
    expect(body.list[0].name).toBe(newOrderClub.name);
    expect(body.debug).toMatchObject({
      originalKeyword: FULL_KEYWORD,
      requestedKeyword: FULL_KEYWORD,
      graphqlKeyword: FULL_KEYWORD,
      queryUsed: FULL_KEYWORD,
      fallbackUsed: true,
    });
    expect(body.debug.primaryError).toContain("charAt");
    expect(body.diagnostics).toMatchObject({
      resolvedSource: "businesses",
      fallbackUsed: true,
      queryUsed: FULL_KEYWORD,
    });

    const payloads = mocks.fetch.mock.calls.flatMap(([, init]) => {
      const parsed = JSON.parse(String((init as RequestInit | undefined)?.body ?? "[]"));
      return Array.isArray(parsed) ? parsed : [];
    }) as Array<{
      variables: {
        input: {
          businessType: string;
          deviceType: string;
          query: string;
          x: string;
          y: string;
          start: number;
          display: number;
          isPcmap: boolean;
        };
      };
    }>;

    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.every(({ variables }) => variables.input.query === FULL_KEYWORD))
      .toBe(true);
    expect(payloads.some(({ variables }) => variables.input.query === "맛집"))
      .toBe(false);
    for (const { variables } of payloads) {
      expect(variables.input).toEqual(
        expect.objectContaining({
          businessType: expect.stringMatching(/^(?:restaurant|place)$/),
          deviceType: "pcmap",
          query: FULL_KEYWORD,
          x: expect.any(String),
          y: expect.any(String),
          start: expect.any(Number),
          display: expect.any(Number),
          isPcmap: true,
        })
      );
      expect(Object.values(variables.input)).not.toContain(undefined);
    }
  });

  it("keeps registered keywords separate from microReview for 뉴오더클럽, 키코, and 난포", async () => {
    const businesses = [
      {
        ...newOrderClub,
        microReview: ["피자가 맛있어요", "분위기가 좋아요"],
      },
      {
        ...newOrderClub,
        id: "kiko-pilates",
        name: "키코필라테스 앤 발레",
        category: "필라테스",
        businessCategory: "place",
        roadAddress: "서울 용산구 청파로47길 42",
        microReview: ["시설이 깨끗해요"],
      },
      {
        ...newOrderClub,
        id: "nanpo-hannam",
        name: "난포 한남",
        roadAddress: "서울 용산구 이태원로49길 18",
        microReview: ["음식이 맛있어요", "인테리어가 멋져요"],
      },
    ];
    const registeredKeywordsByName: Record<string, string[]> = {
      "뉴오더클럽 한남": ["블루스퀘어맛집", "한남동데이트", "화덕피자"],
      "키코필라테스 앤 발레": [
        "서울역개인필라테스",
        "숙대입구그룹필라테스",
      ],
      "난포 한남": ["한남동맛집", "한남동데이트"],
    };
    const reviewFeaturesByName: Record<string, string[]> = {
      "뉴오더클럽 한남": ["피자가 맛있어요", "분위기가 좋아요"],
      "키코필라테스 앤 발레": ["시설이 깨끗해요"],
      "난포 한남": ["음식이 맛있어요", "인테리어가 멋져요"],
    };
    mocks.getNaverPlaceReviewSnapshot.mockImplementation(
      async ({ placeName }: { placeName?: string }) => ({
        ok: true,
        reason: null,
        debugReason: null,
        hintType: "restaurant",
        chosenType: "restaurant",
        triedTypes: ["restaurant"],
        requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
        cacheStatus: "MISS",
        totalReviewCount: 1625,
        visitorReviewCount: 725,
        blogReviewCount: 900,
        saveCountText: "28000",
        registeredKeywords:
          registeredKeywordsByName[placeName ?? ""] ?? [],
        registeredKeywordsStatus: "AVAILABLE",
        reviewFeatureKeywords:
          reviewFeaturesByName[placeName ?? ""] ?? [],
        reviewFeatureKeywordsStatus: "AVAILABLE",
        keywordList: registeredKeywordsByName[placeName ?? ""] ?? [],
        keywordListStatus: "AVAILABLE",
      })
    );
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map(
        businesses.map((business) => [
          business.id,
          keywordCacheEntry({
            publicPlaceId: business.id,
            keywords: registeredKeywordsByName[business.name] ?? [],
            collectedAt: new Date(),
          }),
        ])
      ),
      globalBlockUntil: null,
      globalBlockReason: null,
    });

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(3, businesses),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.list).toHaveLength(3);
    for (const [name, registeredKeywords] of Object.entries(
      registeredKeywordsByName
    )) {
      const item = body.list.find(
        (candidate: { name: string }) => candidate.name === name
      );
      expect(item).toMatchObject({
        name,
        registeredKeywords,
        registeredKeywordsStatus: "AVAILABLE",
        keywords: registeredKeywords,
        reviewFeatureKeywords: reviewFeaturesByName[name],
        reviewFeatureKeywordsStatus: "AVAILABLE",
      });
      expect(item.registeredKeywords).not.toEqual(item.reviewFeatureKeywords);
      expect(item).not.toHaveProperty("featureKeywords");

      mocks.findUnique.mockResolvedValueOnce({
        id: `review-${name}`,
        name,
        category: name.includes("키코") ? "필라테스" : "음식점",
        placeUrl: `https://m.place.naver.com/restaurant/${
          name.length + 1000
        }/home`,
        x: "127.0",
        y: "37.5",
        placeMobileVolume: 0,
        placePcVolume: 0,
        placeMonthlyVolume: 0,
        reviewHistory: [],
      });
      const reviewResponse = await trackPlaceReview(
        new Request("http://localhost/api/place-review-track", {
          method: "POST",
          body: JSON.stringify({ placeId: `review-${name}` }),
        })
      );
      expect(reviewResponse.status).toBe(200);
      const lastUpsert = mocks.historyUpsert.mock.calls.at(-1)?.[0];
      expect(lastUpsert?.update?.keywords).toEqual(registeredKeywords);
    }
  });

  it("distinguishes unavailable registered keywords from an available empty list", async () => {
    const businesses = [
      { ...newOrderClub, microReview: ["피자가 맛있어요"] },
      {
        ...newOrderClub,
        id: "empty-keywords",
        name: "등록 키워드 없는 업체",
        microReview: ["친절해요"],
      },
    ];
    mocks.getNaverPlaceReviewSnapshot.mockImplementation(
      async ({ placeName }: { placeName?: string }) => {
        const available = placeName === "등록 키워드 없는 업체";
        return {
          ok: true,
          reason: null,
          debugReason: available
            ? null
            : "restaurant:REGISTERED_KEYWORDS_UNAVAILABLE",
          hintType: "restaurant",
          chosenType: "restaurant",
          triedTypes: ["restaurant"],
          requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
          cacheStatus: "MISS",
          totalReviewCount: 1625,
          visitorReviewCount: 725,
          blogReviewCount: 900,
          saveCountText: "28000",
          registeredKeywords: available ? [] : null,
          registeredKeywordsStatus: available ? "AVAILABLE" : "UNAVAILABLE",
          reviewFeatureKeywords: available ? ["친절해요"] : ["피자가 맛있어요"],
          reviewFeatureKeywordsStatus: "AVAILABLE",
          keywordList: available ? [] : null,
          keywordListStatus: available ? "AVAILABLE" : "UNAVAILABLE",
        };
      }
    );
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map([
        [
          "empty-keywords",
          keywordCacheEntry({
            publicPlaceId: "empty-keywords",
            keywords: [],
            collectedAt: new Date(),
          }),
        ],
      ]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(2, businesses),
      })
    );
    const body = await response.json();

    expect(body.list[0]).toMatchObject({
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      keywords: null,
      reviewFeatureKeywords: ["피자가 맛있어요"],
    });
    expect(body.list[1]).toMatchObject({
      registeredKeywords: [],
      registeredKeywordsStatus: "AVAILABLE",
      keywords: [],
      reviewFeatureKeywords: ["친절해요"],
    });
  });

  it("uses a fresh publicPlaceId cache without starting a registered-keyword refresh", async () => {
    const collectedAt = new Date();
    const cached = keywordCacheEntry({
      publicPlaceId: newOrderClub.id,
      keywords: ["블루스퀘어맛집", "화덕피자"],
      collectedAt,
    });
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map([[newOrderClub.id, cached]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(1),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.list[0]).toMatchObject({
      name: "뉴오더클럽 한남",
      registeredKeywords: ["블루스퀘어맛집", "화덕피자"],
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywordsSource: "REGISTERED_KEYWORD_CACHE",
      registeredKeywordsCollectedAt: collectedAt.toISOString(),
      registeredKeywordsCacheSource: "NAVER_INFORMATION",
      registeredKeywordsCacheStatus: "HIT_FRESH",
      registeredKeywordsLiveAttempted: false,
    });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: newOrderClub.id,
        collectRegisteredKeywords: false,
      })
    );
  });

  it("keeps review collection behavior but never adds a registered-keyword request", async () => {
    const cached = keywordCacheEntry({
      publicPlaceId: newOrderClub.id,
      keywords: ["한남동데이트"],
      collectedAt: new Date(),
    });
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map([[newOrderClub.id, cached]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      ok: false,
      reason: "NAVER_BLOCKED_OR_CAPTCHA",
      debugReason: "restaurant:GRAPHQL_NCAPTCHA",
      hintType: "restaurant",
      chosenType: "restaurant",
      triedTypes: ["restaurant"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "MISS",
      totalReviewCount: null,
      visitorReviewCount: null,
      blogReviewCount: null,
      saveCountText: null,
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      reviewFeatureKeywords: null,
      reviewFeatureKeywordsStatus: "UNAVAILABLE",
      keywordList: null,
      keywordListStatus: "UNAVAILABLE",
    });

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(2, [
          newOrderClub,
          buzzaPizza,
        ]),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.getNaverPlaceReviewSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: newOrderClub.id,
        collectRegisteredKeywords: false,
      })
    );
    expect(body.list[1]).toMatchObject({
      name: buzzaPizza.name,
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      registeredKeywordsCacheStatus: "QUEUE_PENDING",
      review: {
        debugReason: "restaurant:GRAPHQL_NCAPTCHA",
      },
    });
    expect(
      mocks.getNaverPlaceReviewSnapshot.mock.calls.every(
        ([input]) => input.collectRegisteredKeywords === false
      )
    ).toBe(true);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("returns cache data immediately and leaves missing keyword collection to the async queue", async () => {
    const staleCollectedAt = new Date("2026-07-01T03:00:00.000Z");
    const pipeCache = keywordCacheEntry({
      publicPlaceId: pipeGround.id,
      keywords: ["한남동맛집", "옥수수피자"],
      collectedAt: staleCollectedAt,
    });
    mocks.loadRegisteredKeywordCacheState.mockResolvedValue({
      byPlaceId: new Map([[pipeGround.id, pipeCache]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.getNaverPlaceReviewSnapshot.mockImplementation(
      async ({ placeName }: { placeName?: string }) => {
        if (placeName === newOrderClub.name) {
          return {
            ok: true,
            reason: null,
            debugReason: null,
            hintType: "restaurant",
            chosenType: "restaurant",
            triedTypes: ["restaurant"],
            requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
            cacheStatus: "MISS",
            totalReviewCount: 1645,
            visitorReviewCount: 738,
            blogReviewCount: 907,
            saveCountText: "28000",
            registeredKeywords: ["블루스퀘어맛집", "한남동데이트"],
            registeredKeywordsStatus: "AVAILABLE",
            reviewFeatureKeywords: ["피자가 맛있어요"],
            reviewFeatureKeywordsStatus: "AVAILABLE",
            keywordList: ["블루스퀘어맛집", "한남동데이트"],
            keywordListStatus: "AVAILABLE",
          };
        }
        if (placeName === pipeGround.name) {
          return {
            ok: true,
            reason: null,
            debugReason: "restaurant:HTML_NCAPTCHA",
            hintType: "restaurant",
            chosenType: "restaurant",
            triedTypes: ["restaurant"],
            requestUrls: [
              "https://pcmap-api.place.naver.com/graphql",
              `https://pcmap.place.naver.com/restaurant/${pipeGround.id}/information`,
            ],
            cacheStatus: "MISS",
            totalReviewCount: 3000,
            visitorReviewCount: 1500,
            blogReviewCount: 1500,
            saveCountText: "45000",
            registeredKeywords: null,
            registeredKeywordsStatus: "UNAVAILABLE",
            reviewFeatureKeywords: [],
            reviewFeatureKeywordsStatus: "AVAILABLE",
            keywordList: null,
            keywordListStatus: "UNAVAILABLE",
          };
        }
        return {
          ok: true,
          reason: null,
          debugReason: null,
          hintType: "restaurant",
          chosenType: "restaurant",
          triedTypes: ["restaurant"],
          requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
          cacheStatus: "MISS",
          totalReviewCount: 2200,
          visitorReviewCount: 1100,
          blogReviewCount: 1100,
          saveCountText: "32000",
          registeredKeywords: null,
          registeredKeywordsStatus: "UNAVAILABLE",
          reviewFeatureKeywords: [],
          reviewFeatureKeywordsStatus: "AVAILABLE",
          keywordList: null,
          keywordListStatus: "UNAVAILABLE",
        };
      }
    );

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(3, [
          newOrderClub,
          pipeGround,
          buzzaPizza,
        ]),
      })
    );
    const body = await response.json();
    const byName = new Map(
      body.list.map((item: { name: string }) => [item.name, item])
    );

    expect(response.status).toBe(200);
    expect(byName.get(newOrderClub.name)).toMatchObject({
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      registeredKeywordsSource: null,
      registeredKeywordsCacheStatus: "QUEUE_PENDING",
      registeredKeywordsLiveAttempted: false,
    });
    expect(byName.get(pipeGround.name)).toMatchObject({
      registeredKeywords: ["한남동맛집", "옥수수피자"],
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywordsSource: "REGISTERED_KEYWORD_CACHE",
      registeredKeywordsCollectedAt: staleCollectedAt.toISOString(),
      registeredKeywordsCacheStatus: "HIT_STALE_QUEUE_PENDING",
      registeredKeywordsLiveAttempted: false,
    });
    expect(byName.get(buzzaPizza.name)).toMatchObject({
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      registeredKeywordsSource: null,
      registeredKeywordsCacheStatus: "QUEUE_PENDING",
      registeredKeywordsLiveAttempted: false,
    });

    expect(mocks.after).toHaveBeenCalledTimes(1);

    const snapshotInputs = mocks.getNaverPlaceReviewSnapshot.mock.calls.map(
      ([input]) => input
    );
    expect(snapshotInputs.length).toBeGreaterThanOrEqual(2);
    expect(
      snapshotInputs.every(
        (input) => input.collectRegisteredKeywords === false
      )
    ).toBe(true);
  });

  it("uses the authenticated place-review history only when live registered keywords are unavailable", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findMany.mockResolvedValue([
      {
        placeUrl: `https://m.place.naver.com/restaurant/${newOrderClub.id}/home`,
        reviewHistory: [
          {
            keywords: ["맥주술집", "화덕피자"],
            updatedAt: new Date("2026-07-10T03:11:00.000Z"),
          },
        ],
      },
    ]);
    mocks.getNaverPlaceReviewSnapshot.mockResolvedValue({
      ok: true,
      reason: null,
      debugReason: "restaurant:HTML_NCAPTCHA",
      hintType: "restaurant",
      chosenType: "restaurant",
      triedTypes: ["restaurant"],
      requestUrls: ["https://pcmap-api.place.naver.com/graphql"],
      cacheStatus: "MISS",
      totalReviewCount: 1625,
      visitorReviewCount: 725,
      blogReviewCount: 900,
      saveCountText: "28000",
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      reviewFeatureKeywords: ["피자가 맛있어요"],
      reviewFeatureKeywordsStatus: "AVAILABLE",
      keywordList: null,
      keywordListStatus: "UNAVAILABLE",
    });

    const response = await POST(
      analyzeRequest({
        businessesGraphqlKeyword: FULL_KEYWORD,
        businessesGraphqlBatch: placeListBatch(1, [
          { ...newOrderClub, microReview: ["피자가 맛있어요"] },
        ]),
      })
    );
    const body = await response.json();

    expect(body.list[0]).toMatchObject({
      registeredKeywords: ["맥주술집", "화덕피자"],
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywordsSource: "PLACE_REVIEW_HISTORY",
      registeredKeywordsCacheStatus: "LEGACY_HISTORY_QUEUE_PENDING",
      keywords: ["맥주술집", "화덕피자"],
      reviewFeatureKeywords: ["피자가 맛있어요"],
      review: {
        visitor: 725,
        blog: 900,
        total: 1625,
        save: "28000",
      },
    });
    expect(body.list[0]).not.toHaveProperty(
      "registeredKeywordsCollectionTicket"
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });
});
