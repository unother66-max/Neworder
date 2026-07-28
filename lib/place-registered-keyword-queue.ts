import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getRegisteredKeywordRefreshLeaseMs,
  getRegisteredKeywordSuccessTtlMs,
  hasFreshRegisteredKeywordCache,
  isRegisteredKeywordBlockReason,
  loadRegisteredKeywordCacheState,
  saveRegisteredKeywordFailure,
  saveRegisteredKeywordSuccess,
} from "@/lib/place-registered-keyword-cache";

export type RegisteredKeywordQueueTarget = {
  publicPlaceId: string;
  placeName: string;
  category?: string | null;
  businessType?: string | null;
  x?: string | null;
  y?: string | null;
};

export type RegisteredKeywordQueueRunResult = {
  status:
    | "COMPLETED"
    | "EMPTY"
    | "GLOBAL_COOLDOWN"
    | "WORKER_BUSY"
    | "TIME_BUDGET"
    | "VOLUME_DEFERRED";
  attempted: number;
  succeeded: number;
  failed: number;
  blocked: boolean;
  cooldownUntil: string | null;
  failureCode: string | null;
};

const PUBLIC_PLACE_ID = /^\d{1,32}$/;
const QUEUE_STATUS_IDLE = "IDLE";
const QUEUE_STATUS_QUEUED = "QUEUED";
const QUEUE_STATUS_PROCESSING = "PROCESSING";
const QUEUE_WORKER_LOCK_ID = "__PLACE_ANALYSIS_KEYWORD_QUEUE_LOCK__";
const QUEUE_WORKER_LEASE_MS = 5 * 60 * 1000;
const QUEUE_TIME_BUDGET_RESERVE_MS = 8_000;

function boundedEnvNumber(
  name: string,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function getRegisteredKeywordCronQueueOptions() {
  return {
    maxItems: boundedEnvNumber(
      "PLACE_ANALYSIS_REGISTERED_KEYWORD_QUEUE_MAX_ITEMS",
      8,
      1,
      10
    ),
    timeBudgetMs: boundedEnvNumber(
      "PLACE_ANALYSIS_REGISTERED_KEYWORD_QUEUE_TIME_BUDGET_MS",
      45_000,
      10_000,
      50_000
    ),
    jitterMs: boundedEnvNumber(
      "PLACE_ANALYSIS_REGISTERED_KEYWORD_QUEUE_JITTER_MS",
      1_000,
      500,
      5_000
    ),
  };
}

function cleanText(value: unknown, maxLength = 500): string | null {
  const text = String(value ?? "").normalize("NFKC").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeTarget(
  target: RegisteredKeywordQueueTarget
): RegisteredKeywordQueueTarget | null {
  const publicPlaceId = String(target.publicPlaceId ?? "").trim();
  const placeName = cleanText(target.placeName, 300);
  if (!PUBLIC_PLACE_ID.test(publicPlaceId) || !placeName) return null;
  return {
    publicPlaceId,
    placeName,
    category: cleanText(target.category, 300),
    businessType: cleanText(target.businessType, 100),
    x: cleanText(target.x, 50),
    y: cleanText(target.y, 50),
  };
}

function targetData(target: RegisteredKeywordQueueTarget) {
  return {
    placeName: target.placeName,
    category: target.category ?? null,
    businessType: target.businessType ?? null,
    x: target.x ?? null,
    y: target.y ?? null,
  };
}

/**
 * publicPlaceId별 durable queue 등록. 정식 Place/추적 매장은 만들지 않는다.
 * 이미 QUEUED/PROCESSING이면 상태를 다시 만들지 않고, 24시간 이내 성공값도 건너뛴다.
 */
export async function enqueueRegisteredKeywordCollectionTargets(
  targets: readonly RegisteredKeywordQueueTarget[],
  now: Date = new Date()
) {
  const deduped = new Map<string, RegisteredKeywordQueueTarget>();
  for (const rawTarget of targets) {
    const target = normalizeTarget(rawTarget);
    if (target) deduped.set(target.publicPlaceId, target);
  }
  const uniqueTargets = Array.from(deduped.values());
  if (uniqueTargets.length === 0) {
    return { requested: 0, queued: 0, deduped: 0, freshSkipped: 0 };
  }

  const state = await loadRegisteredKeywordCacheState(
    uniqueTargets.map((target) => target.publicPlaceId),
    now
  );
  const staleBefore = new Date(
    now.getTime() - getRegisteredKeywordSuccessTtlMs()
  );
  let queued = 0;
  let alreadyQueued = 0;
  let freshSkipped = 0;

  for (const target of uniqueTargets) {
    const current = state.byPlaceId.get(target.publicPlaceId);
    if (hasFreshRegisteredKeywordCache(current, now)) {
      freshSkipped += 1;
      continue;
    }
    if (
      current?.queueStatus === QUEUE_STATUS_QUEUED ||
      current?.queueStatus === QUEUE_STATUS_PROCESSING
    ) {
      alreadyQueued += 1;
      continue;
    }

    const created = await prisma.placeRegisteredKeywordCache.createMany({
      data: [
        {
          publicPlaceId: target.publicPlaceId,
          ...targetData(target),
          queueStatus: QUEUE_STATUS_QUEUED,
          queuedAt: now,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 1) {
      queued += 1;
      continue;
    }

    const updated = await prisma.placeRegisteredKeywordCache.updateMany({
      where: {
        publicPlaceId: target.publicPlaceId,
        queueStatus: QUEUE_STATUS_IDLE,
        OR: [
          { hasSuccessfulValue: false },
          { collectedAt: null },
          { collectedAt: { lte: staleBefore } },
        ],
      },
      data: {
        ...targetData(target),
        queueStatus: QUEUE_STATUS_QUEUED,
        queuedAt: now,
      },
    });
    if (updated.count === 1) queued += 1;
    else alreadyQueued += 1;
  }

  const result = {
    requested: uniqueTargets.length,
    queued,
    deduped: alreadyQueued,
    freshSkipped,
  };
  console.log("[place-analysis registered keyword queue] enqueue", result);
  return result;
}

/**
 * 대표키워드는 이미 최신이지만 검색량 캐시가 비어 있는 업체를 같은 durable
 * queue에 등록한다. 키워드 성공값과 collectedAt은 건드리지 않는다.
 */
export async function enqueueRegisteredKeywordVolumeBackfillTargets(
  targets: readonly RegisteredKeywordQueueTarget[],
  now: Date = new Date()
) {
  const deduped = new Map<string, RegisteredKeywordQueueTarget>();
  for (const rawTarget of targets) {
    const target = normalizeTarget(rawTarget);
    if (target) deduped.set(target.publicPlaceId, target);
  }
  const uniqueTargets = Array.from(deduped.values());
  if (uniqueTargets.length === 0) {
    return { requested: 0, queued: 0, deduped: 0, skipped: 0 };
  }

  const state = await loadRegisteredKeywordCacheState(
    uniqueTargets.map((target) => target.publicPlaceId),
    now
  );
  let queued = 0;
  let alreadyQueued = 0;
  let skipped = 0;

  for (const target of uniqueTargets) {
    const current = state.byPlaceId.get(target.publicPlaceId);
    if (
      !current?.hasSuccessfulValue ||
      current.keywords.length === 0 ||
      (current.cooldownUntil && current.cooldownUntil.getTime() > now.getTime())
    ) {
      skipped += 1;
      continue;
    }
    if (
      current.queueStatus === QUEUE_STATUS_QUEUED ||
      current.queueStatus === QUEUE_STATUS_PROCESSING
    ) {
      alreadyQueued += 1;
      continue;
    }

    const updated = await prisma.placeRegisteredKeywordCache.updateMany({
      where: {
        publicPlaceId: target.publicPlaceId,
        hasSuccessfulValue: true,
        queueStatus: QUEUE_STATUS_IDLE,
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
      },
      data: {
        ...targetData(target),
        queueStatus: QUEUE_STATUS_QUEUED,
        queuedAt: now,
      },
    });
    if (updated.count === 1) queued += 1;
    else alreadyQueued += 1;
  }

  const result = {
    requested: uniqueTargets.length,
    queued,
    deduped: alreadyQueued,
    skipped,
  };
  console.log(
    "[place-analysis registered keyword volume queue] enqueue",
    result
  );
  return result;
}

function queueCandidateWhere(
  now: Date,
  publicPlaceIds?: readonly string[]
): Prisma.PlaceRegisteredKeywordCacheWhereInput {
  const hasExplicitScope = publicPlaceIds !== undefined;
  const scopedPlaceIds = Array.from(
    new Set(
      (publicPlaceIds ?? [])
        .map((publicPlaceId) => String(publicPlaceId ?? "").trim())
        .filter((publicPlaceId) => PUBLIC_PLACE_ID.test(publicPlaceId))
    )
  );
  return {
    NOT: { publicPlaceId: QUEUE_WORKER_LOCK_ID },
    ...(hasExplicitScope
      ? { publicPlaceId: { in: scopedPlaceIds } }
      : {}),
    AND: [
      {
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
      },
      {
        OR: [
          { queueStatus: QUEUE_STATUS_QUEUED },
          {
            queueStatus: QUEUE_STATUS_PROCESSING,
            refreshLeaseUntil: { lte: now },
          },
        ],
      },
    ],
  };
}

async function claimNextQueueItem(
  now: Date,
  publicPlaceIds?: readonly string[]
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await prisma.placeRegisteredKeywordCache.findFirst({
      where: queueCandidateWhere(now, publicPlaceIds),
      // 최초 수집이 없는 경쟁업체를 stale 성공값/검색량 보강보다 먼저 채운다.
      orderBy: [
        { hasSuccessfulValue: "asc" },
        { queuedAt: "asc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        publicPlaceId: true,
        keywords: true,
        hasSuccessfulValue: true,
        collectedAt: true,
        placeName: true,
        category: true,
        businessType: true,
        x: true,
        y: true,
      },
    });
    if (!candidate) return null;

    const claimed = await prisma.placeRegisteredKeywordCache.updateMany({
      where: {
        id: candidate.id,
        ...queueCandidateWhere(now, publicPlaceIds),
      },
      data: {
        queueStatus: QUEUE_STATUS_PROCESSING,
        processingStartedAt: now,
        lastAttemptAt: now,
        refreshLeaseUntil: new Date(
          now.getTime() + getRegisteredKeywordRefreshLeaseMs()
        ),
      },
    });
    if (claimed.count === 1) return candidate;
  }
  return null;
}

function isRestaurantTarget(target: {
  category: string | null;
  businessType: string | null;
}) {
  return /restaurant|food|cafe|음식점|한식|양식|일식|중식|카페|커피|베이커리|술집|주점|피자/i.test(
    `${target.businessType ?? ""} ${target.category ?? ""}`
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RegisteredKeywordVolumeRefreshResult = {
  ok: boolean;
  failureCode: string | null;
  rateLimited: boolean;
};

/** SearchAD 호출은 queue worker 안에서만, 키워드별 직렬로 수행한다. */
export async function refreshRegisteredKeywordSearchVolumes(
  keywords: readonly string[]
): Promise<RegisteredKeywordVolumeRefreshResult> {
  const uniqueKeywords = Array.from(
    new Set(
      keywords
        .map((keyword) => String(keyword ?? "").normalize("NFKC").trim())
        .filter(Boolean)
    )
  ).slice(0, 5);
  // 업체 대표키워드는 최대 5개이므로 캐시 미스도 한 번에 모두 확인한다.
  // 영속/메모리 캐시 hit는 이 예산을 소비하지 않는다.
  const searchAdBudgetRemaining = { remaining: 5 };

  for (const keyword of uniqueKeywords) {
    try {
      const volume = await getKeywordSearchVolume(keyword, {
        searchAdBudgetRemaining,
      });
      if (volume.ok || volume.persistentlyConfirmedZero) continue;
      const reason = String(volume.reason ?? "UNAVAILABLE")
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, "_");
      return {
        ok: false,
        failureCode: `REGISTERED_KEYWORD_VOLUME_${reason}`,
        rateLimited: volume.reason === "rate-limited",
      };
    } catch (error) {
      return {
        ok: false,
        failureCode: `REGISTERED_KEYWORD_VOLUME_ERROR:${
          error instanceof Error ? error.name : "UNKNOWN"
        }`,
        rateLimited: false,
      };
    }
  }

  return { ok: true, failureCode: null, rateLimited: false };
}

async function completeRegisteredKeywordVolumeBackfill(
  publicPlaceId: string,
  attemptedAt: Date
) {
  return prisma.placeRegisteredKeywordCache.updateMany({
    where: { publicPlaceId },
    data: {
      lastAttemptAt: attemptedAt,
      cooldownUntil: null,
      refreshLeaseUntil: null,
      lastFailureCode: null,
      queueStatus: QUEUE_STATUS_IDLE,
      queuedAt: null,
      processingStartedAt: null,
    },
  });
}

/**
 * DB에서 한 건씩 claim하여 순차 처리한다. 함수 내부에는 병렬 실행이 없으므로
 * 네이버 키워드 수집 동시성은 항상 1이다.
 */
async function processRegisteredKeywordQueueWithLease(options?: {
  maxItems?: number;
  jitterMs?: number;
  timeBudgetMs?: number;
  publicPlaceIds?: readonly string[];
  deferSearchVolumeRefresh?: boolean;
}): Promise<RegisteredKeywordQueueRunResult> {
  const maxItems = Math.max(1, Math.min(10, Math.floor(options?.maxItems ?? 1)));
  const jitterMs = Math.max(0, Math.min(5_000, options?.jitterMs ?? 0));
  const startedAt = Date.now();
  const timeBudgetMs = options?.timeBudgetMs
    ? Math.max(1_000, Math.min(50_000, Math.floor(options.timeBudgetMs)))
    : null;
  const deadlineAt = timeBudgetMs ? startedAt + timeBudgetMs : null;
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let failureCode: string | null = null;
  let cooldownUntil: Date | null = null;
  let searchVolumeRateLimited = options?.deferSearchVolumeRefresh === true;

  for (let index = 0; index < maxItems; index += 1) {
    if (
      index > 0 &&
      deadlineAt !== null &&
      Date.now() + QUEUE_TIME_BUDGET_RESERVE_MS >= deadlineAt
    ) {
      return {
        status: "TIME_BUDGET",
        attempted,
        succeeded,
        failed,
        blocked: false,
        cooldownUntil: cooldownUntil?.toISOString() ?? null,
        failureCode,
      };
    }
    const now = new Date();
    const globalState = await loadRegisteredKeywordCacheState([], now);
    if (
      globalState.globalBlockUntil &&
      globalState.globalBlockUntil.getTime() > now.getTime()
    ) {
      return {
        status: "GLOBAL_COOLDOWN",
        attempted,
        succeeded,
        failed,
        blocked: true,
        cooldownUntil: globalState.globalBlockUntil.toISOString(),
        failureCode: globalState.globalBlockReason,
      };
    }

    const target = await claimNextQueueItem(now, options?.publicPlaceIds);
    if (!target) {
      return {
        status: attempted === 0 ? "EMPTY" : "COMPLETED",
        attempted,
        succeeded,
        failed,
        blocked: false,
        cooldownUntil: null,
        failureCode,
      };
    }

    attempted += 1;
    const type = isRestaurantTarget(target) ? "restaurant" : "place";
    const placeName = cleanText(target.placeName, 300);
    try {
      const hasFreshKeywordValue = Boolean(
        target.hasSuccessfulValue &&
          target.collectedAt &&
          now.getTime() - target.collectedAt.getTime() <
            getRegisteredKeywordSuccessTtlMs()
      );
      if (hasFreshKeywordValue) {
        if (searchVolumeRateLimited) {
          // 대표키워드 이름은 이미 저장되어 있다. SearchAD 전역 제한을 각
          // 매장 실패로 복제하지 않고 현재 volume 작업만 안전하게 반납한다.
          await completeRegisteredKeywordVolumeBackfill(
            target.publicPlaceId,
            now
          );
          return {
            status: "VOLUME_DEFERRED",
            attempted,
            succeeded,
            failed,
            blocked: false,
            cooldownUntil: cooldownUntil?.toISOString() ?? null,
            failureCode:
              failureCode ?? "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED",
          };
        }
        const volumeRefresh =
          await refreshRegisteredKeywordSearchVolumes(target.keywords);
        if (volumeRefresh.ok) {
          await completeRegisteredKeywordVolumeBackfill(
            target.publicPlaceId,
            now
          );
          succeeded += 1;
          console.log(
            "[place-analysis registered keyword volume queue] success",
            {
              publicPlaceId: target.publicPlaceId,
              keywordCount: target.keywords.length,
            }
          );
        } else {
          failureCode =
            volumeRefresh.failureCode ??
            "REGISTERED_KEYWORD_VOLUME_UNAVAILABLE";
          const saved = await saveRegisteredKeywordFailure({
            publicPlaceId: target.publicPlaceId,
            failureCode,
            blocked: false,
            attemptedAt: now,
          });
          failed += 1;
          cooldownUntil = saved.cooldownUntil;
          console.warn(
            "[place-analysis registered keyword volume queue] failed",
            {
              publicPlaceId: target.publicPlaceId,
              failureCode,
              cooldownUntil: saved.cooldownUntil?.toISOString() ?? null,
            }
          );
          if (volumeRefresh.rateLimited) {
            // SearchAD 제한은 검색량에만 적용한다. 이 실행의 남은 업체는
            // 대표키워드 이름 수집을 계속하되 추가 SearchAD 호출은 하지 않는다.
            searchVolumeRateLimited = true;
          }
        }
        if (index + 1 < maxItems && jitterMs > 0) {
          const delayMs = jitterMs + Math.floor(Math.random() * 251);
          if (
            deadlineAt !== null &&
            Date.now() + delayMs + QUEUE_TIME_BUDGET_RESERVE_MS >= deadlineAt
          ) {
            return {
              status: "TIME_BUDGET",
              attempted,
              succeeded,
              failed,
              blocked: false,
              cooldownUntil: cooldownUntil?.toISOString() ?? null,
              failureCode,
            };
          }
          await delay(delayMs);
        }
        continue;
      }

      if (!placeName) throw new Error("QUEUE_TARGET_MISSING_NAME");
      const snapshot = await getNaverPlaceReviewSnapshot({
        placeUrl: `https://m.place.naver.com/${type}/${target.publicPlaceId}/home`,
        placeName,
        placeId: target.publicPlaceId,
        category: target.category,
        businessType: target.businessType,
        pcmapUrl: `https://pcmap.place.naver.com/${type}/${target.publicPlaceId}/home`,
        x: target.x,
        y: target.y,
        collectRegisteredKeywords: true,
        registeredKeywordsOnly: true,
        force: true,
      });

      if (snapshot.registeredKeywordsStatus === "AVAILABLE") {
        const saved = await saveRegisteredKeywordSuccess({
          publicPlaceId: target.publicPlaceId,
          keywords: snapshot.registeredKeywords ?? [],
          collectedAt: now,
          source: "NAVER_INFORMATION",
        });
        if (searchVolumeRateLimited) {
          // SearchAD 제한은 검색량만 미룬다. 방금 성공한 대표키워드 이름과
          // queue 완료 상태는 그대로 유지해 다른 매장의 수집을 계속한다.
          succeeded += 1;
          console.log("[place-analysis registered keyword queue] success", {
            queueStatus: saved.queueStatus,
            publicPlaceId: target.publicPlaceId,
            lastSuccessAt: saved.collectedAt?.toISOString() ?? null,
            keywordCount: saved.keywords.length,
            volumeStatus: "DEFERRED",
            failureCode: null,
            cooldownUntil: null,
          });
        } else {
          const volumeRefresh =
            await refreshRegisteredKeywordSearchVolumes(saved.keywords);
          if (volumeRefresh.ok) {
            succeeded += 1;
            console.log("[place-analysis registered keyword queue] success", {
              queueStatus: saved.queueStatus,
              publicPlaceId: target.publicPlaceId,
              lastSuccessAt: saved.collectedAt?.toISOString() ?? null,
              keywordCount: saved.keywords.length,
              volumeStatus: "AVAILABLE",
              failureCode: null,
              cooldownUntil: null,
            });
          } else {
            failureCode =
              volumeRefresh.failureCode ??
              "REGISTERED_KEYWORD_VOLUME_UNAVAILABLE";
            const failedSave = await saveRegisteredKeywordFailure({
              publicPlaceId: target.publicPlaceId,
              failureCode,
              blocked: false,
              attemptedAt: now,
            });
            failed += 1;
            cooldownUntil = failedSave.cooldownUntil;
            console.warn(
              "[place-analysis registered keyword queue] volume unavailable",
              {
                publicPlaceId: target.publicPlaceId,
                lastSuccessAt: saved.collectedAt?.toISOString() ?? null,
                keywordCount: saved.keywords.length,
                failureCode,
                cooldownUntil:
                  failedSave.cooldownUntil?.toISOString() ?? null,
              }
            );
            if (volumeRefresh.rateLimited) {
              searchVolumeRateLimited = true;
            }
          }
        }
      } else {
        failureCode =
          snapshot.debugReason ??
          snapshot.reason ??
          "REGISTERED_KEYWORDS_UNAVAILABLE";
        const blocked = isRegisteredKeywordBlockReason(failureCode);
        const saved = await saveRegisteredKeywordFailure({
          publicPlaceId: target.publicPlaceId,
          failureCode,
          blocked,
          attemptedAt: now,
        });
        failed += 1;
        cooldownUntil = saved.cooldownUntil;
        console.warn("[place-analysis registered keyword queue] failed", {
          queueStatus: saved.queueStatus,
          publicPlaceId: target.publicPlaceId,
          lastSuccessAt: saved.collectedAt?.toISOString() ?? null,
          failureCode,
          cooldownUntil: saved.cooldownUntil?.toISOString() ?? null,
        });
        if (blocked) {
          return {
            status: "GLOBAL_COOLDOWN",
            attempted,
            succeeded,
            failed,
            blocked: true,
            cooldownUntil: saved.cooldownUntil?.toISOString() ?? null,
            failureCode,
          };
        }
      }
    } catch (error) {
      failureCode =
        error instanceof Error
          ? `REGISTERED_KEYWORD_QUEUE_ERROR:${error.name}`
          : "REGISTERED_KEYWORD_QUEUE_ERROR";
      const saved = await saveRegisteredKeywordFailure({
        publicPlaceId: target.publicPlaceId,
        failureCode,
        blocked: false,
        attemptedAt: now,
      });
      failed += 1;
      cooldownUntil = saved.cooldownUntil;
      console.warn("[place-analysis registered keyword queue] error", {
        queueStatus: saved.queueStatus,
        publicPlaceId: target.publicPlaceId,
        lastSuccessAt: saved.collectedAt?.toISOString() ?? null,
        failureCode,
        cooldownUntil: saved.cooldownUntil?.toISOString() ?? null,
      });
    }

    if (index + 1 < maxItems && jitterMs > 0) {
      const delayMs = jitterMs + Math.floor(Math.random() * 251);
      if (
        deadlineAt !== null &&
        Date.now() + delayMs + QUEUE_TIME_BUDGET_RESERVE_MS >= deadlineAt
      ) {
        return {
          status: "TIME_BUDGET",
          attempted,
          succeeded,
          failed,
          blocked: false,
          cooldownUntil: cooldownUntil?.toISOString() ?? null,
          failureCode,
        };
      }
      await delay(delayMs);
    }
  }

  return {
    status: "COMPLETED",
    attempted,
    succeeded,
    failed,
    blocked: false,
    cooldownUntil: cooldownUntil?.toISOString() ?? null,
    failureCode,
  };
}

export const REGISTERED_KEYWORD_QUEUE_CONCURRENCY = 1;

async function acquireQueueWorkerLease(now: Date): Promise<boolean> {
  await prisma.placeRegisteredKeywordCache.createMany({
    data: [
      {
        publicPlaceId: QUEUE_WORKER_LOCK_ID,
        placeName: "place-analysis registered keyword queue lock",
        queueStatus: QUEUE_STATUS_IDLE,
      },
    ],
    skipDuplicates: true,
  });
  const claimed = await prisma.placeRegisteredKeywordCache.updateMany({
    where: {
      publicPlaceId: QUEUE_WORKER_LOCK_ID,
      OR: [
        { refreshLeaseUntil: null },
        { refreshLeaseUntil: { lte: now } },
      ],
    },
    data: {
      refreshLeaseUntil: new Date(now.getTime() + QUEUE_WORKER_LEASE_MS),
      lastAttemptAt: now,
    },
  });
  return claimed.count === 1;
}

async function releaseQueueWorkerLease() {
  await prisma.placeRegisteredKeywordCache.updateMany({
    where: { publicPlaceId: QUEUE_WORKER_LOCK_ID },
    data: { refreshLeaseUntil: null },
  });
}

/** DB 전역 lease로 서버리스 인스턴스가 여러 개여도 실제 수집 동시성을 1로 제한한다. */
export async function processRegisteredKeywordQueue(options?: {
  maxItems?: number;
  jitterMs?: number;
  timeBudgetMs?: number;
  publicPlaceIds?: readonly string[];
  deferSearchVolumeRefresh?: boolean;
}): Promise<RegisteredKeywordQueueRunResult> {
  const acquired = await acquireQueueWorkerLease(new Date());
  if (!acquired) {
    return {
      status: "WORKER_BUSY",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      blocked: false,
      cooldownUntil: null,
      failureCode: null,
    };
  }
  try {
    return await processRegisteredKeywordQueueWithLease(options);
  } finally {
    try {
      await releaseQueueWorkerLease();
    } catch (error) {
      console.warn("[place-analysis registered keyword queue] lease release", {
        reason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
    }
  }
}
