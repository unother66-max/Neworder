import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  enqueueCollection: vi.fn(),
  enqueueVolume: vi.fn(),
  processQueue: vi.fn(),
  loadCacheState: vi.fn(),
  hasFreshCache: vi.fn(),
  isCooldownActive: vi.fn(),
  loadVolumeCache: vi.fn(),
  buildWithVolumes: vi.fn(),
  missingVolumes: vi.fn(),
}));

vi.mock("@/lib/require-auth-api", () => ({
  requireAuthApi: mocks.requireAuth,
}));

vi.mock("@/lib/place-registered-keyword-queue", () => ({
  enqueueRegisteredKeywordCollectionTargets: mocks.enqueueCollection,
  enqueueRegisteredKeywordVolumeBackfillTargets: mocks.enqueueVolume,
  processRegisteredKeywordQueue: mocks.processQueue,
}));

vi.mock("@/lib/place-registered-keyword-cache", () => ({
  loadRegisteredKeywordCacheState: mocks.loadCacheState,
  hasFreshRegisteredKeywordCache: mocks.hasFreshCache,
  isRegisteredKeywordCooldownActive: mocks.isCooldownActive,
}));

vi.mock("@/lib/place-registered-keyword-volumes", () => ({
  loadRegisteredKeywordVolumeCache: mocks.loadVolumeCache,
  buildRegisteredKeywordsWithVolumes: mocks.buildWithVolumes,
  missingRegisteredKeywordVolumes: mocks.missingVolumes,
}));

import {
  POST,
  maxDuration,
} from "@/app/api/place-analysis-registered-keywords/route";

function request(targets: unknown[]) {
  return new Request(
    "http://localhost/api/place-analysis-registered-keywords",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    }
  );
}

function cacheEntry(overrides: Record<string, unknown> = {}) {
  return {
    publicPlaceId: "101",
    keywords: ["한남동맛집"],
    hasSuccessfulValue: true,
    source: "NAVER_INFORMATION",
    collectedAt: new Date("2026-07-27T10:00:00.000Z"),
    lastAttemptAt: new Date("2026-07-27T10:00:00.000Z"),
    cooldownUntil: null,
    refreshLeaseUntil: null,
    lastFailureCode: null,
    placeName: "첫 매장",
    category: "한식",
    businessType: "restaurant",
    x: "127.0",
    y: "37.5",
    queueStatus: "IDLE",
    queuedAt: null,
    processingStartedAt: null,
    ...overrides,
  };
}

describe("place-analysis registered-keyword progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
    });
    mocks.enqueueCollection.mockResolvedValue({
      requested: 2,
      queued: 1,
      deduped: 0,
      freshSkipped: 1,
    });
    mocks.enqueueVolume.mockResolvedValue({
      requested: 2,
      queued: 0,
      deduped: 0,
      skipped: 2,
    });
    mocks.processQueue.mockResolvedValue({
      status: "COMPLETED",
      attempted: 1,
      succeeded: 1,
      failed: 0,
      blocked: false,
      cooldownUntil: null,
      failureCode: null,
    });
    mocks.hasFreshCache.mockImplementation(
      (entry: { hasSuccessfulValue?: boolean } | undefined) =>
        Boolean(entry?.hasSuccessfulValue)
    );
    mocks.isCooldownActive.mockReturnValue(false);
    mocks.loadVolumeCache.mockResolvedValue({
      rows: new Map(),
      loadStatus: "AVAILABLE",
    });
    mocks.buildWithVolumes.mockImplementation((keywords: string[] | null) =>
      keywords?.map((keyword) => ({
        keyword,
        volume: 120,
        volumeStatus: "AVAILABLE",
      })) ?? null
    );
    mocks.missingVolumes.mockImplementation(
      (
        keywords:
          | Array<{ keyword: string; volumeStatus: string }>
          | null
      ) =>
        keywords
          ?.filter(
            (keyword) =>
              keyword.volumeStatus === "PENDING" ||
              keyword.volumeStatus === "UNAVAILABLE"
          )
          .map((keyword) => keyword.keyword) ?? []
    );
  });

  it("rejects a request without valid numeric place ids", async () => {
    const response = await POST(
      request([{ publicPlaceId: "bad", placeName: "잘못된 매장" }])
    );

    expect(response.status).toBe(400);
    expect(mocks.processQueue).not.toHaveBeenCalled();
  });

  it("requires an authenticated session before starting collection", async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: "로그인이 필요한 기능입니다." },
        { status: 401 }
      ),
    });

    const response = await POST(
      request([{ publicPlaceId: "101", placeName: "첫 매장" }])
    );

    expect(response.status).toBe(401);
    expect(mocks.enqueueCollection).not.toHaveBeenCalled();
    expect(mocks.processQueue).not.toHaveBeenCalled();
  });

  it("processes only requested stores and returns merge-ready progress rows", async () => {
    const first = cacheEntry();
    const second = cacheEntry({
      publicPlaceId: "202",
      keywords: [],
      hasSuccessfulValue: false,
      source: null,
      collectedAt: null,
      lastAttemptAt: null,
      placeName: "둘째 매장",
      queueStatus: "QUEUED",
    });
    mocks.loadCacheState.mockResolvedValue({
      byPlaceId: new Map([
        ["101", first],
        ["202", second],
      ]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });

    const targets = [
      {
        publicPlaceId: "101",
        placeName: "첫 매장",
        category: "한식",
        businessType: "restaurant",
        x: "127.0",
        y: "37.5",
      },
      {
        publicPlaceId: "202",
        placeName: "둘째 매장",
        category: "카페",
        businessType: "cafe",
      },
    ];
    const response = await POST(request(targets));
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(response.status).toBe(200);
    expect(mocks.enqueueCollection).toHaveBeenCalledWith([
      targets[0],
      {
        ...targets[1],
        x: null,
        y: null,
      },
    ]);
    expect(mocks.enqueueVolume).toHaveBeenCalledWith([]);
    expect(mocks.processQueue).toHaveBeenCalledWith({
      maxItems: 2,
      timeBudgetMs: 45_000,
      jitterMs: 1_000,
      publicPlaceIds: ["101", "202"],
    });
    expect(body).toMatchObject({
      ok: true,
      complete: false,
      collectionComplete: false,
      remainingPlaceIds: ["202"],
      retryableNowPlaceIds: ["202"],
      retryableCollectionPlaceIds: ["202"],
      retryableVolumePlaceIds: [],
      rows: [
        {
          placeId: "101",
          registeredKeywordsStatus: "AVAILABLE",
          registeredKeywords: [
            {
              keyword: "한남동맛집",
              volume: 120,
              volumeStatus: "AVAILABLE",
            },
          ],
          registeredKeywordsCacheStatus: "HIT_FRESH",
        },
        {
          placeId: "202",
          registeredKeywordsStatus: "UNAVAILABLE",
          registeredKeywords: null,
          registeredKeywordsCacheStatus: "QUEUED",
        },
      ],
    });
  });

  it("keeps polling while keyword search volumes are still pending", async () => {
    const first = cacheEntry();
    mocks.loadCacheState.mockResolvedValue({
      byPlaceId: new Map([["101", first]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.buildWithVolumes.mockImplementation((keywords: string[] | null) =>
      keywords?.map((keyword) => ({
        keyword,
        volume: null,
        volumeStatus: "PENDING",
      })) ?? null
    );

    const target = {
      publicPlaceId: "101",
      placeName: "첫 매장",
      category: "한식",
      businessType: "restaurant",
      x: "127.0",
      y: "37.5",
    };
    const response = await POST(request([target]));
    const body = await response.json();

    expect(mocks.enqueueVolume).toHaveBeenCalledWith([target]);
    expect(body).toMatchObject({
      complete: false,
      collectionComplete: true,
      volumeComplete: false,
      pendingPlaceIds: ["101"],
      remainingPlaceIds: [],
      volumePendingPlaceIds: ["101"],
      retryableNowPlaceIds: ["101"],
      retryableCollectionPlaceIds: [],
      retryableVolumePlaceIds: ["101"],
    });
  });

  it("does not requeue volume work when every cached volume is complete", async () => {
    const first = cacheEntry();
    mocks.loadCacheState.mockResolvedValue({
      byPlaceId: new Map([["101", first]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });

    const response = await POST(
      request([{ publicPlaceId: "101", placeName: "첫 매장" }])
    );
    const body = await response.json();

    expect(mocks.enqueueVolume).toHaveBeenCalledWith([]);
    expect(body).toMatchObject({
      complete: true,
      collectionComplete: true,
      volumeComplete: true,
      pendingPlaceIds: [],
      remainingPlaceIds: [],
      volumePendingPlaceIds: [],
    });
  });

  it("keeps collecting names but defers SearchAD while a volume rate-limit cooldown is active", async () => {
    const first = cacheEntry({
      cooldownUntil: new Date("2099-07-27T12:00:00.000Z"),
      lastFailureCode: "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED",
      queueStatus: "QUEUED",
    });
    mocks.loadCacheState.mockResolvedValue({
      byPlaceId: new Map([["101", first]]),
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.isCooldownActive.mockReturnValue(true);
    mocks.buildWithVolumes.mockImplementation((keywords: string[] | null) =>
      keywords?.map((keyword) => ({
        keyword,
        volume: null,
        volumeStatus: "PENDING",
      })) ?? null
    );

    const response = await POST(
      request([{ publicPlaceId: "101", placeName: "첫 매장" }])
    );
    const body = await response.json();

    expect(mocks.processQueue).toHaveBeenCalledWith({
      maxItems: 1,
      timeBudgetMs: 45_000,
      jitterMs: 1_000,
      publicPlaceIds: ["101"],
      deferSearchVolumeRefresh: true,
    });
    expect(body).toMatchObject({
      complete: false,
      collectionComplete: true,
      volumeDeferred: true,
      pendingPlaceIds: ["101"],
      retryableNowPlaceIds: [],
      retryableCollectionPlaceIds: [],
      retryableVolumePlaceIds: [],
    });
  });

  it("keeps all uncollected stores retryable while only volume lookups are deferred", async () => {
    const volumeLimited = cacheEntry({
      cooldownUntil: new Date("2099-07-27T12:00:00.000Z"),
      lastFailureCode: "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED",
      queueStatus: "QUEUED",
    });
    const missing = Array.from({ length: 64 }, (_, index) =>
      cacheEntry({
        publicPlaceId: String(1_000 + index),
        keywords: [],
        hasSuccessfulValue: false,
        source: null,
        collectedAt: null,
        lastAttemptAt: null,
        placeName: `미수집 매장 ${index + 1}`,
        queueStatus: "QUEUED",
      })
    );
    const byPlaceId = new Map(
      [volumeLimited, ...missing].map((entry) => [
        entry.publicPlaceId,
        entry,
      ])
    );
    mocks.loadCacheState.mockResolvedValue({
      byPlaceId,
      globalBlockUntil: null,
      globalBlockReason: null,
    });
    mocks.isCooldownActive.mockImplementation(
      (entry: { publicPlaceId?: string } | undefined) =>
        entry?.publicPlaceId === volumeLimited.publicPlaceId
    );
    mocks.buildWithVolumes.mockImplementation((keywords: string[] | null) =>
      keywords?.map((keyword) => ({
        keyword,
        volume: null,
        volumeStatus: "PENDING",
      })) ?? null
    );

    const targets = [volumeLimited, ...missing].map((entry) => ({
      publicPlaceId: entry.publicPlaceId,
      placeName: entry.placeName,
    }));
    const response = await POST(request(targets));
    const body = await response.json();

    expect(body.volumeDeferred).toBe(true);
    expect(body.remainingPlaceIds).toHaveLength(64);
    expect(body.retryableCollectionPlaceIds).toEqual(
      missing.map((entry) => entry.publicPlaceId)
    );
    expect(body.retryableVolumePlaceIds).toEqual([]);
  });

  it("stops immediate retries when Naver has a global cooldown", async () => {
    const cooldownUntil = new Date("2099-07-27T12:00:00.000Z");
    mocks.processQueue.mockResolvedValue({
      status: "GLOBAL_COOLDOWN",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      blocked: true,
      cooldownUntil: cooldownUntil.toISOString(),
      failureCode: "restaurant:HTML_CONFIRMED_NCAPTCHA",
    });
    mocks.loadCacheState.mockResolvedValue({
      byPlaceId: new Map(),
      globalBlockUntil: cooldownUntil,
      globalBlockReason: "restaurant:HTML_CONFIRMED_NCAPTCHA",
    });

    const response = await POST(
      request([{ publicPlaceId: "303", placeName: "지연 매장" }])
    );
    const body = await response.json();

    expect(body).toMatchObject({
      complete: false,
      remainingPlaceIds: ["303"],
      retryableNowPlaceIds: [],
      rows: [
        {
          placeId: "303",
          registeredKeywordsCacheStatus: "COLLECTION_DELAYED",
          registeredKeywordsLastFailureCode: null,
          registeredKeywordsDebugReason:
            "restaurant:HTML_CONFIRMED_NCAPTCHA",
        },
      ],
    });
  });
});
