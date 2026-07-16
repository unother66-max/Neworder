import { prisma } from "@/lib/prisma";

export type RegisteredKeywordCacheSource =
  | "NAVER_INFORMATION"
  | "PLACE_REVIEW_HISTORY";

export type RegisteredKeywordCacheEntry = {
  publicPlaceId: string;
  keywords: string[];
  hasSuccessfulValue: boolean;
  source: string | null;
  collectedAt: Date | null;
  lastAttemptAt: Date | null;
  cooldownUntil: Date | null;
  refreshLeaseUntil: Date | null;
  lastFailureCode: string | null;
  placeName: string | null;
  category: string | null;
  businessType: string | null;
  x: string | null;
  y: string | null;
  queueStatus: string;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
};

export type RegisteredKeywordCacheState = {
  byPlaceId: Map<string, RegisteredKeywordCacheEntry>;
  globalBlockUntil: Date | null;
  globalBlockReason: string | null;
};

export type RegisteredKeywordRefreshClaim = {
  status: "CLAIMED" | "GLOBAL_BLOCK" | "COOLDOWN" | "LEASE_HELD";
  reason: string | null;
  until: Date | null;
};

function boundedEnvNumber(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function getRegisteredKeywordSuccessTtlMs(): number {
  return boundedEnvNumber(
    "PLACE_ANALYSIS_REGISTERED_KEYWORD_CACHE_TTL_MS",
    24 * 60 * 60 * 1000,
    60 * 1000,
    7 * 24 * 60 * 60 * 1000
  );
}

export function getRegisteredKeywordFailureCooldownMs(blocked: boolean): number {
  return blocked
    ? boundedEnvNumber(
        "PLACE_ANALYSIS_REGISTERED_KEYWORD_BLOCK_COOLDOWN_MS",
        6 * 60 * 60 * 1000,
        5 * 60 * 1000,
        24 * 60 * 60 * 1000
      )
    : boundedEnvNumber(
        "PLACE_ANALYSIS_REGISTERED_KEYWORD_FAILURE_COOLDOWN_MS",
        60 * 60 * 1000,
        60 * 1000,
        6 * 60 * 60 * 1000
      );
}

export function getRegisteredKeywordRefreshLeaseMs(): number {
  return boundedEnvNumber(
    "PLACE_ANALYSIS_REGISTERED_KEYWORD_REFRESH_LEASE_MS",
    60 * 1000,
    10 * 1000,
    5 * 60 * 1000
  );
}

export function isRegisteredKeywordBlockReason(reason: unknown): boolean {
  return /NCAPTCHA|COOLDOWN(?:_HTTP_429)?|BLOCKED_HTTP_403|HTTP_429/i.test(
    String(reason ?? "")
  );
}

export function hasFreshRegisteredKeywordCache(
  entry: RegisteredKeywordCacheEntry | undefined,
  now: Date,
  ttlMs: number = getRegisteredKeywordSuccessTtlMs()
): boolean {
  if (!entry?.hasSuccessfulValue || !entry.collectedAt) return false;
  return now.getTime() - entry.collectedAt.getTime() < ttlMs;
}

export function isRegisteredKeywordCooldownActive(
  entry: RegisteredKeywordCacheEntry | undefined,
  now: Date
): boolean {
  return Boolean(
    entry?.cooldownUntil && entry.cooldownUntil.getTime() > now.getTime()
  );
}

function cacheSelect() {
  return {
    publicPlaceId: true,
    keywords: true,
    hasSuccessfulValue: true,
    source: true,
    collectedAt: true,
    lastAttemptAt: true,
    cooldownUntil: true,
    refreshLeaseUntil: true,
    lastFailureCode: true,
    placeName: true,
    category: true,
    businessType: true,
    x: true,
    y: true,
    queueStatus: true,
    queuedAt: true,
    processingStartedAt: true,
  } as const;
}

const blockReasonWhere = [
  { lastFailureCode: { contains: "NCAPTCHA", mode: "insensitive" as const } },
  { lastFailureCode: { contains: "COOLDOWN", mode: "insensitive" as const } },
  {
    lastFailureCode: {
      contains: "BLOCKED_HTTP_403",
      mode: "insensitive" as const,
    },
  },
  { lastFailureCode: { contains: "HTTP_429", mode: "insensitive" as const } },
];

export async function loadRegisteredKeywordCacheState(
  publicPlaceIds: string[],
  now: Date = new Date()
): Promise<RegisteredKeywordCacheState> {
  const ids = Array.from(
    new Set(publicPlaceIds.map((id) => String(id).trim()).filter(Boolean))
  );
  const [rows, activeBlock] = await Promise.all([
    ids.length > 0
      ? prisma.placeRegisteredKeywordCache.findMany({
          where: { publicPlaceId: { in: ids } },
          select: cacheSelect(),
        })
      : Promise.resolve([]),
    prisma.placeRegisteredKeywordCache.findFirst({
      where: {
        cooldownUntil: { gt: now },
        OR: blockReasonWhere,
      },
      orderBy: { cooldownUntil: "desc" },
      select: { cooldownUntil: true, lastFailureCode: true },
    }),
  ]);

  return {
    byPlaceId: new Map(
      rows.map((row) => [row.publicPlaceId, row as RegisteredKeywordCacheEntry])
    ),
    globalBlockUntil: activeBlock?.cooldownUntil ?? null,
    globalBlockReason: activeBlock?.lastFailureCode ?? null,
  };
}

export async function claimRegisteredKeywordRefresh(
  publicPlaceId: string,
  now: Date = new Date()
): Promise<RegisteredKeywordRefreshClaim> {
  const id = String(publicPlaceId).trim();
  if (!id) {
    return {
      status: "LEASE_HELD",
      reason: "PUBLIC_PLACE_ID_MISSING",
      until: null,
    };
  }

  await prisma.placeRegisteredKeywordCache.createMany({
    data: [{ publicPlaceId: id }],
    skipDuplicates: true,
  });

  const activeGlobalBlock = await prisma.placeRegisteredKeywordCache.findFirst({
    where: {
      cooldownUntil: { gt: now },
      OR: blockReasonWhere,
    },
    select: { cooldownUntil: true, lastFailureCode: true },
  });
  if (activeGlobalBlock) {
    return {
      status: "GLOBAL_BLOCK",
      reason: activeGlobalBlock.lastFailureCode,
      until: activeGlobalBlock.cooldownUntil,
    };
  }

  const claimed = await prisma.placeRegisteredKeywordCache.updateMany({
    where: {
      publicPlaceId: id,
      AND: [
        {
          OR: [
            { cooldownUntil: null },
            { cooldownUntil: { lte: now } },
          ],
        },
        {
          OR: [
            { refreshLeaseUntil: null },
            { refreshLeaseUntil: { lte: now } },
          ],
        },
      ],
    },
    data: {
      lastAttemptAt: now,
      refreshLeaseUntil: new Date(
        now.getTime() + getRegisteredKeywordRefreshLeaseMs()
      ),
    },
  });
  if (claimed.count === 1) {
    return { status: "CLAIMED", reason: null, until: null };
  }

  const current = await prisma.placeRegisteredKeywordCache.findUnique({
    where: { publicPlaceId: id },
    select: { cooldownUntil: true, refreshLeaseUntil: true },
  });
  if (
    current?.cooldownUntil &&
    current.cooldownUntil.getTime() > now.getTime()
  ) {
    return {
      status: "COOLDOWN",
      reason: "REGISTERED_KEYWORD_PLACE_COOLDOWN",
      until: current.cooldownUntil,
    };
  }
  return {
    status: "LEASE_HELD",
    reason: "REGISTERED_KEYWORD_REFRESH_LEASE_HELD",
    until: current?.refreshLeaseUntil ?? null,
  };
}

export async function saveRegisteredKeywordSuccess(params: {
  publicPlaceId: string;
  keywords: string[];
  collectedAt?: Date;
  source?: RegisteredKeywordCacheSource;
}) {
  const collectedAt = params.collectedAt ?? new Date();
  const source = params.source ?? "NAVER_INFORMATION";
  return prisma.placeRegisteredKeywordCache.upsert({
    where: { publicPlaceId: params.publicPlaceId },
    update: {
      keywords: params.keywords,
      hasSuccessfulValue: true,
      source,
      collectedAt,
      lastAttemptAt: collectedAt,
      cooldownUntil: null,
      refreshLeaseUntil: null,
      lastFailureCode: null,
      queueStatus: "IDLE",
      queuedAt: null,
      processingStartedAt: null,
    },
    create: {
      publicPlaceId: params.publicPlaceId,
      keywords: params.keywords,
      hasSuccessfulValue: true,
      source,
      collectedAt,
      lastAttemptAt: collectedAt,
      queueStatus: "IDLE",
    },
    select: cacheSelect(),
  });
}

export async function seedRegisteredKeywordCacheFromHistory(params: {
  publicPlaceId: string;
  keywords: string[];
  collectedAt: Date;
}) {
  const id = String(params.publicPlaceId).trim();
  if (!id) return null;

  await prisma.placeRegisteredKeywordCache.createMany({
    data: [
      {
        publicPlaceId: id,
        keywords: params.keywords,
        hasSuccessfulValue: true,
        source: "PLACE_REVIEW_HISTORY",
        collectedAt: params.collectedAt,
      },
    ],
    skipDuplicates: true,
  });

  // 다른 요청이 방금 저장한 더 최신 NAVER 성공값은 과거 추적 이력으로
  // 덮어쓰지 않는다. 아직 성공값이 없는 실패 메타데이터 행만 seed한다.
  await prisma.placeRegisteredKeywordCache.updateMany({
    where: { publicPlaceId: id, hasSuccessfulValue: false },
    data: {
      keywords: params.keywords,
      hasSuccessfulValue: true,
      source: "PLACE_REVIEW_HISTORY",
      collectedAt: params.collectedAt,
    },
  });

  return prisma.placeRegisteredKeywordCache.findUnique({
    where: { publicPlaceId: id },
    select: cacheSelect(),
  });
}

export async function saveRegisteredKeywordFailure(params: {
  publicPlaceId: string;
  failureCode: string;
  blocked: boolean;
  attemptedAt?: Date;
}) {
  const attemptedAt = params.attemptedAt ?? new Date();
  const failureCode = String(params.failureCode || "UNAVAILABLE").slice(0, 500);
  const cooldownUntil = new Date(
    attemptedAt.getTime() + getRegisteredKeywordFailureCooldownMs(params.blocked)
  );
  return prisma.placeRegisteredKeywordCache.upsert({
    where: { publicPlaceId: params.publicPlaceId },
    update: {
      lastAttemptAt: attemptedAt,
      lastFailureCode: failureCode,
      cooldownUntil,
      refreshLeaseUntil: null,
      queueStatus: "QUEUED",
      processingStartedAt: null,
    },
    create: {
      publicPlaceId: params.publicPlaceId,
      keywords: [],
      hasSuccessfulValue: false,
      lastAttemptAt: attemptedAt,
      lastFailureCode: failureCode,
      cooldownUntil,
      queueStatus: "QUEUED",
      queuedAt: attemptedAt,
    },
    select: cacheSelect(),
  });
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const limit = Math.max(1, Math.min(items.length, Math.floor(concurrency) || 1));

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    })
  );
  return results;
}
