/** 브라우저 전용 — Client Component에서만 import */

export type UserQuotaPayload = {
  ok: true;
  totalItems: number;
  maxLimit: number;
  tier: string;
  isAdmin: boolean;
};

type CacheEntry = { key: string; expiresAt: number; data: UserQuotaPayload };

const TTL_MS = 45_000;

let cache: CacheEntry | null = null;
const inflightByUser = new Map<string, Promise<UserQuotaPayload | null>>();

function cacheKeyForSession(session: { user?: { id?: string | null; email?: string | null } } | null): string | null {
  const id = session?.user?.id?.trim();
  if (id) return `id:${id}`;
  const email = session?.user?.email?.trim();
  if (email) return `email:${email.toLowerCase()}`;
  return null;
}

export function getUserQuotaSessionKey(session: { user?: { id?: string | null; email?: string | null } } | null): string | null {
  return cacheKeyForSession(session);
}

/**
 * /api/user-quota 중복 호출 완화: TTL 내 같은 세션 키는 캐시, 동일 키 동시 요청은 1회 fetch로 합침.
 */
export async function fetchUserQuotaCached(sessionKey: string): Promise<UserQuotaPayload | null> {
  const now = Date.now();
  if (cache && cache.key === sessionKey && now < cache.expiresAt) {
    return cache.data;
  }

  const existing = inflightByUser.get(sessionKey);
  if (existing) return existing;

  const p = (async (): Promise<UserQuotaPayload | null> => {
    try {
      const res = await fetch("/api/user-quota", { credentials: "include" });
      if (!res.ok) return null;
      const data = (await res.json()) as UserQuotaPayload & { ok?: boolean };
      if (!data?.ok) return null;
      const payload: UserQuotaPayload = {
        ok: true,
        totalItems: data.totalItems,
        maxLimit: data.maxLimit,
        tier: data.tier,
        isAdmin: Boolean(data.isAdmin),
      };
      cache = { key: sessionKey, expiresAt: Date.now() + TTL_MS, data: payload };
      return payload;
    } catch {
      return null;
    } finally {
      inflightByUser.delete(sessionKey);
    }
  })();

  inflightByUser.set(sessionKey, p);
  return p;
}

export function invalidateUserQuotaCache(sessionKey?: string): void {
  if (!sessionKey) {
    cache = null;
    return;
  }
  if (cache?.key === sessionKey) cache = null;
}
