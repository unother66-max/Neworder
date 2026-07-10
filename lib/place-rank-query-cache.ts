export type PlaceRankQueryCacheStatus =
  | "MISS"
  | "HIT"
  | "IN_FLIGHT_DEDUPE";

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

declare global {
  var __placeRankQueryCache: Map<string, CacheEntry> | undefined;
  var __placeRankQueryInFlight: Map<string, Promise<unknown>> | undefined;
}

const cache = globalThis.__placeRankQueryCache ?? new Map<string, CacheEntry>();
const inFlight =
  globalThis.__placeRankQueryInFlight ?? new Map<string, Promise<unknown>>();
globalThis.__placeRankQueryCache = cache;
globalThis.__placeRankQueryInFlight = inFlight;

export function resolvePlaceRankCacheTtlMs(
  raw = process.env.PLACE_RANK_CACHE_TTL_MS
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 15_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(parsed)));
}

export async function runPlaceRankQueryCached<T>(params: {
  key: string;
  loader: () => Promise<T>;
  shouldCache: (value: T) => boolean;
  ttlMs?: number;
  nowMs?: number;
}): Promise<{ value: T; cacheStatus: PlaceRankQueryCacheStatus }> {
  const now = params.nowMs ?? Date.now();
  const cached = cache.get(params.key);
  if (cached && cached.expiresAt > now) {
    return { value: cached.value as T, cacheStatus: "HIT" };
  }
  if (cached) cache.delete(params.key);

  const pending = inFlight.get(params.key) as Promise<T> | undefined;
  if (pending) {
    return { value: await pending, cacheStatus: "IN_FLIGHT_DEDUPE" };
  }

  const created = params.loader();
  inFlight.set(params.key, created);
  try {
    const value = await created;
    if (params.shouldCache(value)) {
      cache.set(params.key, {
        expiresAt: now + (params.ttlMs ?? resolvePlaceRankCacheTtlMs()),
        value,
      });
    }
    return { value, cacheStatus: "MISS" };
  } finally {
    if (inFlight.get(params.key) === created) inFlight.delete(params.key);
  }
}

export function clearPlaceRankQueryCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
