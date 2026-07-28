import { NextResponse } from "next/server";

import {
  hasFreshRegisteredKeywordCache,
  isRegisteredKeywordCooldownActive,
  loadRegisteredKeywordCacheState,
} from "@/lib/place-registered-keyword-cache";
import {
  enqueueRegisteredKeywordCollectionTargets,
  enqueueRegisteredKeywordVolumeBackfillTargets,
  processRegisteredKeywordQueue,
  type RegisteredKeywordQueueTarget,
} from "@/lib/place-registered-keyword-queue";
import {
  buildRegisteredKeywordsWithVolumes,
  loadRegisteredKeywordVolumeCache,
  missingRegisteredKeywordVolumes,
} from "@/lib/place-registered-keyword-volumes";
import { requireAuthApi } from "@/lib/require-auth-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PUBLIC_PLACE_ID = /^\d{1,32}$/;
const MAX_TARGETS = 70;
const MAX_ITEMS_PER_RUN = 10;
const COLLECTION_JITTER_MS = 1_000;

function cleanText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? "").normalize("NFKC").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeTarget(value: unknown): RegisteredKeywordQueueTarget | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const publicPlaceId = String(
    row.publicPlaceId ?? row.placeId ?? ""
  ).trim();
  const placeName = cleanText(row.placeName ?? row.name, 300);
  if (!PUBLIC_PLACE_ID.test(publicPlaceId) || !placeName) return null;
  return {
    publicPlaceId,
    placeName,
    category: cleanText(row.category, 300),
    businessType: cleanText(row.businessType, 100),
    x: cleanText(row.x, 50),
    y: cleanText(row.y, 50),
  };
}

function keywordCacheStatus(params: {
  hasSuccessfulValue: boolean;
  fresh: boolean;
  delayed: boolean;
  queueStatus: string;
}) {
  if (params.hasSuccessfulValue) {
    if (params.fresh) return "HIT_FRESH";
    if (params.delayed) return "HIT_STALE_DELAYED";
    if (params.queueStatus === "PROCESSING") return "HIT_STALE_PROCESSING";
    if (params.queueStatus === "QUEUED") return "HIT_STALE_QUEUED";
    return "HIT_STALE";
  }
  if (params.delayed) return "COLLECTION_DELAYED";
  if (params.queueStatus === "PROCESSING") return "PROCESSING";
  if (params.queueStatus === "QUEUED") return "QUEUED";
  return "QUEUE_PENDING";
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const rawTargets = Array.isArray(body?.targets) ? body.targets : [];
    const targetsById = new Map<string, RegisteredKeywordQueueTarget>();
    for (const rawTarget of rawTargets) {
      const target = normalizeTarget(rawTarget);
      if (!target) continue;
      targetsById.set(target.publicPlaceId, target);
      if (targetsById.size >= MAX_TARGETS) break;
    }
    const targets = Array.from(targetsById.values());
    if (targets.length === 0) {
      return NextResponse.json(
        { ok: false, message: "수집할 매장 정보가 없습니다." },
        { status: 400 }
      );
    }

    const publicPlaceIds = targets.map((target) => target.publicPlaceId);
    const initialState = await loadRegisteredKeywordCacheState(
      publicPlaceIds
    );
    const initialNow = new Date();
    const deferSearchVolumeRefresh = targets.some((target) => {
      const entry = initialState.byPlaceId.get(target.publicPlaceId);
      return Boolean(
        entry?.lastFailureCode ===
          "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED" &&
          isRegisteredKeywordCooldownActive(entry, initialNow)
      );
    });
    const initialRegisteredKeywordVolumeCache =
      await loadRegisteredKeywordVolumeCache(
        publicPlaceIds.flatMap(
          (publicPlaceId) =>
            initialState.byPlaceId.get(publicPlaceId)?.keywords ?? []
        )
      );
    const volumeTargets =
      initialRegisteredKeywordVolumeCache.loadStatus === "AVAILABLE"
        ? targets.filter((target) => {
            const entry = initialState.byPlaceId.get(target.publicPlaceId);
            if (!entry?.hasSuccessfulValue) return false;
            return (
              missingRegisteredKeywordVolumes(
                buildRegisteredKeywordsWithVolumes(
                  entry.keywords,
                  initialRegisteredKeywordVolumeCache
                )
              ).length > 0
            );
          })
        : [];
    const [collectionEnqueue, volumeEnqueue] = await Promise.all([
      enqueueRegisteredKeywordCollectionTargets(targets),
      enqueueRegisteredKeywordVolumeBackfillTargets(volumeTargets),
    ]);
    const queueRun = await processRegisteredKeywordQueue({
      maxItems: Math.min(MAX_ITEMS_PER_RUN, targets.length),
      timeBudgetMs: 45_000,
      jitterMs: COLLECTION_JITTER_MS,
      publicPlaceIds,
      ...(deferSearchVolumeRefresh
        ? { deferSearchVolumeRefresh: true }
        : {}),
    });

    const now = new Date();
    const state = await loadRegisteredKeywordCacheState(publicPlaceIds, now);
    const registeredKeywordVolumeCache =
      await loadRegisteredKeywordVolumeCache(
        publicPlaceIds.flatMap(
          (publicPlaceId) =>
            state.byPlaceId.get(publicPlaceId)?.keywords ?? []
        )
      );
    const globalDelayed = Boolean(
      state.globalBlockUntil &&
        state.globalBlockUntil.getTime() > now.getTime()
    );
    const volumeRefreshDeferred =
      deferSearchVolumeRefresh ||
      targets.some((target) => {
        const entry = state.byPlaceId.get(target.publicPlaceId);
        return Boolean(
          entry?.lastFailureCode ===
            "REGISTERED_KEYWORD_VOLUME_RATE_LIMITED" &&
            isRegisteredKeywordCooldownActive(entry, now)
        );
      });

    const rows = targets.map((target) => {
      const entry = state.byPlaceId.get(target.publicPlaceId);
      const hasSuccessfulValue = Boolean(entry?.hasSuccessfulValue);
      const fresh = hasFreshRegisteredKeywordCache(entry, now);
      const cooldownActive = isRegisteredKeywordCooldownActive(entry, now);
      const delayed = globalDelayed || cooldownActive;
      const queueStatus = entry?.queueStatus ?? "IDLE";
      const registeredKeywords = hasSuccessfulValue
        ? buildRegisteredKeywordsWithVolumes(
            entry?.keywords ?? [],
            registeredKeywordVolumeCache
          )
        : null;
      return {
        placeId: target.publicPlaceId,
        registeredKeywords,
        registeredKeywordsStatus: hasSuccessfulValue
          ? ("AVAILABLE" as const)
          : ("UNAVAILABLE" as const),
        registeredKeywordsSource: hasSuccessfulValue
          ? "REGISTERED_KEYWORD_CACHE"
          : null,
        registeredKeywordsCollectedAt:
          entry?.collectedAt?.toISOString() ?? null,
        registeredKeywordsCacheSource: entry?.source ?? null,
        registeredKeywordsCacheStatus: keywordCacheStatus({
          hasSuccessfulValue,
          fresh,
          delayed,
          queueStatus,
        }),
        registeredKeywordsLastAttemptAt:
          entry?.lastAttemptAt?.toISOString() ?? null,
        registeredKeywordsCooldownUntil:
          (globalDelayed
            ? state.globalBlockUntil
            : entry?.cooldownUntil
          )?.toISOString() ?? null,
        registeredKeywordsLastFailureCode:
          entry?.lastFailureCode ?? null,
        registeredKeywordsLiveAttempted: queueRun.attempted > 0,
        registeredKeywordsDebugReason:
          (globalDelayed
            ? state.globalBlockReason
            : entry?.lastFailureCode) ?? null,
        keywords: hasSuccessfulValue ? entry?.keywords ?? [] : null,
      };
    });
    const remainingPlaceIds = rows
      .filter((row) => row.registeredKeywordsStatus !== "AVAILABLE")
      .map((row) => row.placeId);
    const volumePendingPlaceIds = rows
      .filter((row) =>
        row.registeredKeywords?.some(
          (keyword) =>
            keyword.volumeStatus === "PENDING" ||
            keyword.volumeStatus === "UNAVAILABLE"
        )
      )
      .map((row) => row.placeId);
    const pendingPlaceIdSet = new Set([
      ...remainingPlaceIds,
      ...volumePendingPlaceIds,
    ]);
    const pendingPlaceIds = publicPlaceIds.filter((publicPlaceId) =>
      pendingPlaceIdSet.has(publicPlaceId)
    );
    const retryableCollectionPlaceIds = remainingPlaceIds.filter(
      (publicPlaceId) => {
        if (globalDelayed) return false;
        const entry = state.byPlaceId.get(publicPlaceId);
        return !isRegisteredKeywordCooldownActive(entry, now);
      }
    );
    const retryableVolumePlaceIds = volumeRefreshDeferred
      ? []
      : volumePendingPlaceIds.filter((publicPlaceId) => {
          if (globalDelayed) return false;
          const entry = state.byPlaceId.get(publicPlaceId);
          return !isRegisteredKeywordCooldownActive(entry, now);
        });
    const retryableNowPlaceIdSet = new Set([
      ...retryableCollectionPlaceIds,
      ...retryableVolumePlaceIds,
    ]);
    const retryableNowPlaceIds = publicPlaceIds.filter((publicPlaceId) => {
      return retryableNowPlaceIdSet.has(publicPlaceId);
    });

    return NextResponse.json(
      {
        ok: true,
        rows,
        complete: pendingPlaceIds.length === 0,
        collectionComplete: remainingPlaceIds.length === 0,
        volumeComplete: volumePendingPlaceIds.length === 0,
        volumeDeferred: volumeRefreshDeferred,
        pendingPlaceIds,
        remainingPlaceIds,
        volumePendingPlaceIds,
        retryableNowPlaceIds,
        retryableCollectionPlaceIds,
        retryableVolumePlaceIds,
        queue: queueRun,
        enqueued: {
          collection: collectionEnqueue,
          volume: volumeEnqueue,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[place-analysis registered keywords]", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "대표키워드 수집 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
