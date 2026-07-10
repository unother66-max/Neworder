type PlaceRankServerWaiter = {
  limit: number;
  resolve: () => void;
};

declare global {
  var __placeRankServerActive: number | undefined;
  var __placeRankServerQueue: PlaceRankServerWaiter[] | undefined;
}

function clampConcurrency(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(3, Math.max(1, Math.floor(parsed)));
}

export function resolvePlaceRankServerConcurrency(
  serverRaw = process.env.PLACE_RANK_CONCURRENCY,
  publicFallbackRaw = process.env.NEXT_PUBLIC_PLACE_RANK_CONCURRENCY
): number {
  return clampConcurrency(serverRaw ?? publicFallbackRaw);
}

function queue(): PlaceRankServerWaiter[] {
  globalThis.__placeRankServerQueue ??= [];
  return globalThis.__placeRankServerQueue;
}

async function acquire(limit: number): Promise<void> {
  const active = globalThis.__placeRankServerActive ?? 0;
  if (active < limit) {
    globalThis.__placeRankServerActive = active + 1;
    return;
  }
  await new Promise<void>((resolve) => {
    queue().push({ limit, resolve });
  });
}

function release(): void {
  globalThis.__placeRankServerActive = Math.max(
    0,
    (globalThis.__placeRankServerActive ?? 1) - 1
  );
  const waiters = queue();
  for (let index = 0; index < waiters.length; index += 1) {
    const waiter = waiters[index]!;
    const active: number = globalThis.__placeRankServerActive ?? 0;
    if (active >= waiter.limit) continue;
    waiters.splice(index, 1);
    globalThis.__placeRankServerActive = active + 1;
    waiter.resolve();
    index -= 1;
  }
}

export async function runWithPlaceRankServerConcurrency<T>(
  task: () => Promise<T>,
  limit = resolvePlaceRankServerConcurrency()
): Promise<T> {
  await acquire(limit);
  try {
    return await task();
  } finally {
    release();
  }
}

export function getPlaceRankServerConcurrencyState(): {
  active: number;
  queued: number;
} {
  return {
    active: globalThis.__placeRankServerActive ?? 0,
    queued: queue().length,
  };
}

export function clearPlaceRankServerConcurrencyForTests(): void {
  globalThis.__placeRankServerActive = 0;
  globalThis.__placeRankServerQueue = [];
}
