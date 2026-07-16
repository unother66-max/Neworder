import { getNaverPlaceReviewSnapshot } from "@/lib/getNaverPlaceReviewSnapshot";
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
  status: "COMPLETED" | "EMPTY" | "GLOBAL_COOLDOWN" | "WORKER_BUSY";
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

function queueCandidateWhere(
  now: Date
): Prisma.PlaceRegisteredKeywordCacheWhereInput {
  return {
    NOT: { publicPlaceId: QUEUE_WORKER_LOCK_ID },
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

async function claimNextQueueItem(now: Date) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await prisma.placeRegisteredKeywordCache.findFirst({
      where: queueCandidateWhere(now),
      orderBy: [{ queuedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicPlaceId: true,
        placeName: true,
        category: true,
        businessType: true,
        x: true,
        y: true,
      },
    });
    if (!candidate) return null;

    const claimed = await prisma.placeRegisteredKeywordCache.updateMany({
      where: { id: candidate.id, ...queueCandidateWhere(now) },
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

/**
 * DB에서 한 건씩 claim하여 순차 처리한다. 함수 내부에는 병렬 실행이 없으므로
 * 네이버 키워드 수집 동시성은 항상 1이다.
 */
async function processRegisteredKeywordQueueWithLease(options?: {
  maxItems?: number;
  jitterMs?: number;
}): Promise<RegisteredKeywordQueueRunResult> {
  const maxItems = Math.max(1, Math.min(10, Math.floor(options?.maxItems ?? 1)));
  const jitterMs = Math.max(0, Math.min(5_000, options?.jitterMs ?? 0));
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let failureCode: string | null = null;
  let cooldownUntil: Date | null = null;

  for (let index = 0; index < maxItems; index += 1) {
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

    const target = await claimNextQueueItem(now);
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
        force: true,
      });

      if (snapshot.registeredKeywordsStatus === "AVAILABLE") {
        const saved = await saveRegisteredKeywordSuccess({
          publicPlaceId: target.publicPlaceId,
          keywords: snapshot.registeredKeywords ?? [],
          collectedAt: now,
          source: "NAVER_INFORMATION",
        });
        succeeded += 1;
        console.log("[place-analysis registered keyword queue] success", {
          queueStatus: saved.queueStatus,
          publicPlaceId: target.publicPlaceId,
          lastSuccessAt: saved.collectedAt?.toISOString() ?? null,
          keywordCount: saved.keywords.length,
          failureCode: null,
          cooldownUntil: null,
        });
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
      await delay(jitterMs + Math.floor(Math.random() * 251));
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
