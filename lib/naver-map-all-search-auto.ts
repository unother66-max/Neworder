/**
 * allSearch: 환경 토큰 → 메모리 캐시 → 무토큰 순서로 시도.
 * Playwright 기반 토큰 캡처/인페이지 fetch는 사용하지 않는다.
 */

import {
  fetchAllSearchPlacesCheckPlaceRankStyleDetailed,
  fetchAllSearchPlacesWithTokenDetailed,
  type FetchAllSearchCheckPlaceDetailedResult,
} from "@/lib/naver-map-all-search";

const LOG_PREFIX = "[naver-map-all-search-auto]";

const _ttlRaw = parseInt(
  String(process.env.NAVER_MAP_ALL_SEARCH_TOKEN_TTL_MS || "").trim(),
  10
);
const CACHE_TTL_MS =
  Number.isFinite(_ttlRaw) && _ttlRaw >= 60_000 && _ttlRaw <= 24 * 60 * 60_000
    ? _ttlRaw
    : 6 * 60_000;

type TokenEntry = { token: string; at: number };

let memoryToken: TokenEntry | null = null;

export function peekCachedNaverMapAllSearchToken(): string | null {
  if (!memoryToken) return null;
  if (Date.now() - memoryToken.at > CACHE_TTL_MS) {
    memoryToken = null;
    return null;
  }
  return memoryToken.token;
}

function rememberToken(token: string) {
  memoryToken = { token, at: Date.now() };
}

function forgetToken() {
  memoryToken = null;
}

function envToken(): string {
  return String(process.env.NAVER_MAP_ALL_SEARCH_TOKEN || "").trim();
}

/**
 * place-rank-analyze 등에서 사용 — 가능한 한 자동으로 place 목록 확보.
 */
export async function fetchAllSearchPlacesAutoDetailed(
  keyword: string,
  coords?: {
    x?: string;
    y?: string;
  }
)

: Promise<FetchAllSearchCheckPlaceDetailedResult> {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) {
    return fetchAllSearchPlacesCheckPlaceRankStyleDetailed(trimmed);
  }

  const tryWithToken = async (
    label: string,
    token: string
  ): Promise<FetchAllSearchCheckPlaceDetailedResult | null> => {
    const r = await fetchAllSearchPlacesWithTokenDetailed(trimmed, token, coords);
    if (r.ok) {
      console.log(`${LOG_PREFIX} ok`, { label, places: r.places.length });
      return r;
    }
    console.warn(`${LOG_PREFIX} token rejected`, {
      label,
      failureCode: r.failureCode,
    });
    return null;
  };

  const e = envToken();
  if (e) {
    const r = await tryWithToken("env", e);
    if (r) {
      rememberToken(e);
      return r;
    }
  }

  const cached = peekCachedNaverMapAllSearchToken();
  if (cached && cached !== e) {
    const r = await tryWithToken("memory", cached);
    if (r) return r;
    forgetToken();
  }

  const tokenless = await fetchAllSearchPlacesCheckPlaceRankStyleDetailed(
    trimmed,
    coords
  );
  if (tokenless.ok) return tokenless;

  console.warn(`${LOG_PREFIX} tokenless failed`, {
    failureCode: tokenless.failureCode,
  });
  return tokenless;
}
