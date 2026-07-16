import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  createMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    placeRegisteredKeywordCache: {
      findMany: prismaMocks.findMany,
      findFirst: prismaMocks.findFirst,
      findUnique: prismaMocks.findUnique,
      createMany: prismaMocks.createMany,
      updateMany: prismaMocks.updateMany,
      upsert: prismaMocks.upsert,
    },
  },
}));

import {
  claimRegisteredKeywordRefresh,
  getRegisteredKeywordFailureCooldownMs,
  getRegisteredKeywordSuccessTtlMs,
  hasFreshRegisteredKeywordCache,
  isRegisteredKeywordBlockReason,
  isRegisteredKeywordCooldownActive,
  mapWithConcurrency,
  saveRegisteredKeywordSuccess,
  saveRegisteredKeywordFailure,
  seedRegisteredKeywordCacheFromHistory,
  type RegisteredKeywordCacheEntry,
} from "@/lib/place-registered-keyword-cache";

function cacheEntry(
  overrides: Partial<RegisteredKeywordCacheEntry> = {}
): RegisteredKeywordCacheEntry {
  return {
    publicPlaceId: "220044",
    keywords: ["한남동데이트", "화덕피자"],
    hasSuccessfulValue: true,
    source: "NAVER_INFORMATION",
    collectedAt: new Date("2026-07-16T00:00:00.000Z"),
    lastAttemptAt: null,
    cooldownUntil: null,
    refreshLeaseUntil: null,
    lastFailureCode: null,
    placeName: "뉴오더클럽 한남",
    category: "양식",
    businessType: "restaurant",
    x: "127.0007",
    y: "37.5359",
    queueStatus: "IDLE",
    queuedAt: null,
    processingStartedAt: null,
    ...overrides,
  };
}

describe("place registered keyword cache helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("runs no more than the configured number of workers and preserves input order", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency(
      [5, 4, 3, 2, 1],
      2,
      async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return value * 10;
      }
    );

    expect(maxActive).toBe(2);
    expect(result).toEqual([50, 40, 30, 20, 10]);
  });

  it("uses a 24h success TTL, 1h failure cooldown, and 6h block cooldown", () => {
    expect(getRegisteredKeywordSuccessTtlMs()).toBe(24 * 60 * 60 * 1000);
    expect(getRegisteredKeywordFailureCooldownMs(false)).toBe(
      60 * 60 * 1000
    );
    expect(getRegisteredKeywordFailureCooldownMs(true)).toBe(
      6 * 60 * 60 * 1000
    );
  });

  it("distinguishes a fresh value, an expired value, and an active cooldown", () => {
    const now = new Date("2026-07-16T06:00:00.000Z");
    const fiveMinutes = 5 * 60 * 1000;

    expect(
      hasFreshRegisteredKeywordCache(
        cacheEntry({ collectedAt: new Date(now.getTime() - fiveMinutes + 1) }),
        now,
        fiveMinutes
      )
    ).toBe(true);
    expect(
      hasFreshRegisteredKeywordCache(
        cacheEntry({ collectedAt: new Date(now.getTime() - fiveMinutes) }),
        now,
        fiveMinutes
      )
    ).toBe(false);
    expect(
      hasFreshRegisteredKeywordCache(
        cacheEntry({ hasSuccessfulValue: false }),
        now,
        fiveMinutes
      )
    ).toBe(false);

    expect(
      isRegisteredKeywordCooldownActive(
        cacheEntry({ cooldownUntil: new Date(now.getTime() + 1) }),
        now
      )
    ).toBe(true);
    expect(
      isRegisteredKeywordCooldownActive(
        cacheEntry({ cooldownUntil: now }),
        now
      )
    ).toBe(false);
  });

  it("recognizes CAPTCHA, cooldown, 403, and 429 as global stop reasons", () => {
    for (const reason of [
      "restaurant:HTML_NCAPTCHA",
      "COOLDOWN_HTTP_429",
      "BLOCKED_HTTP_403",
      "HTTP_429",
    ]) {
      expect(isRegisteredKeywordBlockReason(reason)).toBe(true);
    }
    expect(isRegisteredKeywordBlockReason("HTML_PARSE_FAILED")).toBe(false);
    expect(isRegisteredKeywordBlockReason(null)).toBe(false);
  });

  it("reports a cross-request global block instead of mislabeling it as a held lease", async () => {
    const now = new Date("2026-07-16T06:00:00.000Z");
    const cooldownUntil = new Date("2026-07-16T07:00:00.000Z");
    prismaMocks.createMany.mockResolvedValue({ count: 1 });
    prismaMocks.findFirst.mockResolvedValue({
      cooldownUntil,
      lastFailureCode: "restaurant:HTML_NCAPTCHA",
    });

    await expect(
      claimRegisteredKeywordRefresh("220044", now)
    ).resolves.toEqual({
      status: "GLOBAL_BLOCK",
      reason: "restaurant:HTML_NCAPTCHA",
      until: cooldownUntil,
    });
    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
  });

  it("records a failed attempt without overwriting the last successful keywords", async () => {
    const attemptedAt = new Date("2026-07-16T06:00:00.000Z");
    prismaMocks.upsert.mockResolvedValue(cacheEntry());

    await saveRegisteredKeywordFailure({
      publicPlaceId: "220044",
      failureCode: "restaurant:HTML_NCAPTCHA",
      blocked: true,
      attemptedAt,
    });

    const write = prismaMocks.upsert.mock.calls[0]?.[0];
    expect(write.where).toEqual({ publicPlaceId: "220044" });
    expect(write.update).toMatchObject({
      lastAttemptAt: attemptedAt,
      lastFailureCode: "restaurant:HTML_NCAPTCHA",
      refreshLeaseUntil: null,
      queueStatus: "QUEUED",
      processingStartedAt: null,
    });
    expect(write.update).not.toHaveProperty("keywords");
    expect(write.update).not.toHaveProperty("hasSuccessfulValue");
    expect(write.update.cooldownUntil.getTime()).toBeGreaterThan(
      attemptedAt.getTime()
    );
  });

  it("clears queue and failure state only after a successful server collection", async () => {
    const collectedAt = new Date("2026-07-16T06:30:00.000Z");
    prismaMocks.upsert.mockResolvedValue(cacheEntry());

    await saveRegisteredKeywordSuccess({
      publicPlaceId: "220044",
      keywords: ["블루스퀘어맛집", "화덕피자"],
      collectedAt,
      source: "NAVER_INFORMATION",
    });

    const write = prismaMocks.upsert.mock.calls[0]?.[0];
    expect(write.update).toMatchObject({
      keywords: ["블루스퀘어맛집", "화덕피자"],
      source: "NAVER_INFORMATION",
      collectedAt,
      cooldownUntil: null,
      refreshLeaseUntil: null,
      lastFailureCode: null,
      queueStatus: "IDLE",
      queuedAt: null,
      processingStartedAt: null,
    });
  });

  it("does not let an older place-review history seed overwrite a NAVER success", async () => {
    const latestNaver = cacheEntry({
      keywords: ["블루스퀘어맛집", "화덕피자"],
      collectedAt: new Date("2026-07-16T05:00:00.000Z"),
      source: "NAVER_INFORMATION",
    });
    prismaMocks.createMany.mockResolvedValue({ count: 0 });
    prismaMocks.updateMany.mockResolvedValue({ count: 0 });
    prismaMocks.findUnique.mockResolvedValue(latestNaver);

    const result = await seedRegisteredKeywordCacheFromHistory({
      publicPlaceId: "220044",
      keywords: ["오래된추적키워드"],
      collectedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(prismaMocks.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          publicPlaceId: "220044",
          keywords: ["오래된추적키워드"],
          source: "PLACE_REVIEW_HISTORY",
        }),
      ],
      skipDuplicates: true,
    });
    expect(prismaMocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicPlaceId: "220044",
          hasSuccessfulValue: false,
        },
      })
    );
    expect(result).toEqual(latestNaver);
    expect(result?.keywords).toEqual(["블루스퀘어맛집", "화덕피자"]);
    expect(result?.source).toBe("NAVER_INFORMATION");
  });
});
