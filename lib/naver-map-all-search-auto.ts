/**
 * allSearch: 환경 토큰 → 메모리 캐시 → 무토큰 →(실패 시) Playwright 토큰 갱신 후 재시도.
 * 수동 DevTools 복사 없이 place-rank-analyze 서버에서 목록을 채우기 위함.
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
  keyword: string
): Promise<FetchAllSearchCheckPlaceDetailedResult> {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) {
    return fetchAllSearchPlacesCheckPlaceRankStyleDetailed(trimmed);
  }

  const tryWithToken = async (
    label: string,
    token: string
  ): Promise<FetchAllSearchCheckPlaceDetailedResult | null> => {
    const r = await fetchAllSearchPlacesWithTokenDetailed(trimmed, token);
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

  const tokenless = await fetchAllSearchPlacesCheckPlaceRankStyleDetailed(trimmed);
  if (tokenless.ok) return tokenless;

  const needPlaywright =
    tokenless.failureCode === "CE_EMPTY_TOKEN" ||
    tokenless.failureCode === "NCAPTCHA" ||
    tokenless.failureCode === "FETCH_TIMEOUT" ||
    tokenless.failureCode === "EMPTY_LIST" ||
    tokenless.failureCode === "UNEXPECTED_REJECT" ||
    tokenless.failureCode === "PLACE_BLOCK_MISSING";

  if (!needPlaywright) {
    return tokenless;
  }

  const {
    isNaverMapPlaywrightDisabled,
    captureNaverMapAllSearchToken,
    fetchAllSearchPlaywrightInPageDetailed,
  } = await import("@/lib/naver-map-playwright-token");

  if (isNaverMapPlaywrightDisabled()) {
    console.warn(`${LOG_PREFIX} playwright disabled (NAVER_MAP_PLAYWRIGHT_DISABLE=1)`);
    return tokenless;
  }

  try {
    const inPage = await fetchAllSearchPlaywrightInPageDetailed(trimmed, {
      timeoutMs: 48_000,
    });
    if (inPage.ok) {
      console.log(`${LOG_PREFIX} playwright in-page ok`, {
        places: inPage.places.length,
      });
      return inPage;
    }
    console.warn(`${LOG_PREFIX} playwright in-page miss`, {
      failureCode: inPage.failureCode,
    });

    const cap = await captureNaverMapAllSearchToken(trimmed, {
      timeoutMs: 42_000,
    });
    if (!cap.token) {
      console.warn(`${LOG_PREFIX} playwright no token`, cap.error);
      return tokenless;
    }

    rememberToken(cap.token);
    const again = await tryWithToken("playwright", cap.token);
    if (again) return again;
    forgetToken();
  } catch (e) {
    console.error(`${LOG_PREFIX} playwright error`, e);
  }

  return tokenless;
}
