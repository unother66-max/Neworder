import crypto from "crypto";

import type { KeywordSearchVolumeCache as KeywordSearchVolumeCacheRow } from "@prisma/client";

import { MONTHLY_VOLUME_VALID_THRESHOLD } from "@/lib/blog-keyword-blogtalk";
import { prisma } from "@/lib/prisma";

export type KeywordToolItem = {
  relKeyword?: string;
  monthlyPcQcCnt?: number | string;
  monthlyMobileQcCnt?: number | string;
};

export type KeywordVolumeResult = {
  mobile: number;
  pc: number;
  total: number;
  ok: boolean;
  reason?:
    | "empty"
    | "missing-env"
    | "rate-limited"
    | "api-error"
    | "not-found"
    | "exception"
    | "skipped-budget";
  matchedKeyword?: string;
  /** 같은 keywordstool 응답에서 나온 연관 검색어 행 (블로그 분석 후보 확장용, 없을 수 있음) */
  keywordList?: KeywordToolItem[];
  /** DB 캐시에서 total≤0·저검색량으로 확정된 값 — confirmedMonthlyVolumes 가 0건으로 승인 */
  persistentlyConfirmedZero?: boolean;
};

export type KeywordVolumeLookupTelemetry = {
  volumeCacheHitCount: number;
  volumeCacheMissCount: number;
  volumeCacheStaleCount: number;
  searchAdAttemptedCount: number;
  searchAdSuccessCount: number;
  searchAd429Stopped: boolean;
  volumeAboveThresholdFromCacheCount: number;
  volumeAboveThresholdFromSearchAdCount: number;
  volumeDeferredDueToBudgetCount: number;
};

export function createKeywordVolumeLookupTelemetry(): KeywordVolumeLookupTelemetry {
  return {
    volumeCacheHitCount: 0,
    volumeCacheMissCount: 0,
    volumeCacheStaleCount: 0,
    searchAdAttemptedCount: 0,
    searchAdSuccessCount: 0,
    searchAd429Stopped: false,
    volumeAboveThresholdFromCacheCount: 0,
    volumeAboveThresholdFromSearchAdCount: 0,
    volumeDeferredDueToBudgetCount: 0,
  };
}

export type GetKeywordSearchVolumeOptions = {
  telemetry?: KeywordVolumeLookupTelemetry;
  /** keyword-refresh 등에서 선조회한 행 — 같은 실행 내 upsert 반영 */
  persistentCachePrefetch?: Map<string, KeywordSearchVolumeCacheRow>;
  /** 남은 횟수만큼만 SearchAD 호출(캐시 미스·stale 시). 없으면 무제한 */
  searchAdBudgetRemaining?: { remaining: number };
  /**
   * true면 KeywordSearchVolumeCache 행이 있으면 TTL과 무관하게 재사용하고 SearchAD를 호출하지 않음.
   * keyword-refresh 점진 조회 전용. 기본 분석 경로에서는 false.
   */
  skipSearchAdWhenPersistentCacheRowExists?: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
/** SearchAD 결과 영속 캐시 TTL — 블톡·keyword-refresh 공통 */
export const KEYWORD_VOLUME_DB_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const volumeCache = new Map<string, { value: KeywordVolumeResult; timestamp: number }>();

/** SearchAD keywordstool 동시 호출 상한(429 완화). 조정 시 2~3 권장. */
const KEYWORD_SEARCH_VOLUME_API_CONCURRENCY = 2;

let volumeSearchAdPermits = KEYWORD_SEARCH_VOLUME_API_CONCURRENCY;
const volumeSearchAdWaiters: Array<() => void> = [];

async function acquireVolumeSearchAdSlot(): Promise<void> {
  if (volumeSearchAdPermits > 0) {
    volumeSearchAdPermits -= 1;
    return;
  }
  await new Promise<void>((resolve) => volumeSearchAdWaiters.push(resolve));
}

function releaseVolumeSearchAdSlot(): void {
  const next = volumeSearchAdWaiters.shift();
  if (next) next();
  else volumeSearchAdPermits += 1;
}

const isDevLogs = process.env.NODE_ENV !== "production";

export function isKeywordVolumeDbCacheFresh(checkedAt: Date): boolean {
  return Date.now() - checkedAt.getTime() < KEYWORD_VOLUME_DB_CACHE_TTL_MS;
}

/** 입력 문자열 통일용 (NFKC, 제로폭 제거, trim) */
export function normalizeVolumeKeywordInput(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

/**
 * 검색량(SearchAD keywordstool) 힌트·행 매칭용: 공백 제거 ("한남동 피자" → "한남동피자").
 * 캐시 키용 keywordVolumeCacheKey 와 역할 분리.
 */
export function compactKeywordForVolumeHint(keyword: string): string {
  return normalizeVolumeKeywordInput(keyword).replace(/\s+/g, "");
}

function makeSignature(timestamp: string, method: string, uri: string, secretKey: string) {
  const message = `${timestamp}.${method}.${uri}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

/** SearchAD 월간 검색량 필드 파싱. "< 10" 등은 실측 존재로 간주해 최소 검색량으로 승격 가능하도록 플래그로 반환 */
function parseQcCount(value: unknown): { num: number; isLt10Marker: boolean } {
  if (typeof value === "number") {
    const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    return { num: n, isLt10Marker: false };
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (/^<\s*10$/i.test(cleaned)) {
      return { num: 0, isLt10Marker: true };
    }
    const num = Number(cleaned);
    return {
      num: Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0,
      isLt10Marker: false,
    };
  }
  return { num: 0, isLt10Marker: false };
}

export function keywordToolRowMonthlyTotal(item: KeywordToolItem): number {
  const pcP = parseQcCount(item.monthlyPcQcCnt);
  const mobP = parseQcCount(item.monthlyMobileQcCnt);
  let total = pcP.num + mobP.num;
  const anyLt10 = pcP.isLt10Marker || mobP.isLt10Marker;
  if (total <= 0 && anyLt10) total = 1;
  return total;
}

/** relKeyword·영속 캐시 키 공통: 공백 제거·앤→and·소문자 */
function volumeCacheNormalizeKey(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .replace(/앤/g, "and")
    .toLowerCase();
}

/** SearchAD·KeywordSearchVolumeCache 공통 조회 키 */
export function keywordVolumeCacheKey(raw: string): string {
  const kwInput = normalizeVolumeKeywordInput(String(raw ?? ""));
  if (!kwInput.replace(/\s/g, "")) return "";
  return volumeCacheNormalizeKey(kwInput);
}

const COMMON_SUFFIX =
  "피자|맛집|치킨|카페|데이트|회식|술집|브런치|파스타|떡볶이|순대|족발|한식|중식|일식|양식";

/** SearchAD keywordstool: hintKeywords는 공백 구분이 아니라 콤마 구분 토큰이어야 함 */
function hintKeywordsToApiParam(hint: string): string {
  const s = String(hint ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(",");
  return s;
}

function hintCandidates(keyword: string): string[] {
  const trimmed = normalizeVolumeKeywordInput(keyword);
  if (!trimmed) return [];

  const spaced = trimmed.replace(/\s+/g, " ").trim();
  const compact = compactKeywordForVolumeHint(trimmed);

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (hint: string) => {
    const h = hint.trim();
    if (!h || seen.has(h)) return;
    seen.add(h);
    out.push(h);
  };

  if (compact !== spaced) add(compact);
  add(spaced);
  if (/ 추천$/.test(spaced)) {
    add(spaced.replace(/ 추천$/, "").trim());
  }
  if (/ 근처$/.test(spaced)) {
    add(spaced.replace(/ 근처$/, "").trim());
  }
  if (!trimmed.includes(" ")) {
    const re = new RegExp(`^(.+)(${COMMON_SUFFIX})$`, "u");
    const m = trimmed.match(re);
    if (m?.[1] && m?.[2]) {
      add(`${m[1]} ${m[2]}`);
    }
  }

  return out.slice(0, 2);
}

function pickKeywordVolumeRow(list: KeywordToolItem[], kwRaw: string): KeywordToolItem | null {
  const pickForTarget = (target: string): KeywordToolItem | null => {
    const trimmed = normalizeVolumeKeywordInput(target);
    const key = volumeCacheNormalizeKey(trimmed);
    const compact = compactKeywordForVolumeHint(trimmed);
    if (!list.length || !key) return null;

    const byNorm = list.find((item) => volumeCacheNormalizeKey(item.relKeyword ?? "") === key);
    if (byNorm) return byNorm;

    const byTrim = list.find((item) => (item.relKeyword ?? "").trim() === trimmed);
    if (byTrim) return byTrim;

    const byCompact = list.find(
      (item) => compactKeywordForVolumeHint(item.relKeyword ?? "") === compact
    );
    if (byCompact) return byCompact;

    return null;
  };

  const direct = pickForTarget(kwRaw);
  if (direct) return direct;

  const t = kwRaw.trim();
  if (/ 추천$/.test(t)) {
    const base = t.replace(/ 추천$/, "").trim();
    if (base) {
      const row = pickForTarget(base);
      if (row) return row;
    }
  }
  if (/ 근처$/.test(t)) {
    const base = t.replace(/ 근처$/, "").trim();
    if (base) {
      const row = pickForTarget(base);
      if (row) return row;
    }
  }

  return null;
}

function pruneExpiredVolumeCache(now: number) {
  for (const [k, v] of volumeCache) {
    if (now - v.timestamp > CACHE_TTL_MS) {
      volumeCache.delete(k);
    }
  }
}

function bumpCacheHitTelemetry(
  telemetry: KeywordVolumeLookupTelemetry | undefined,
  total: number
): void {
  if (!telemetry) return;
  telemetry.volumeCacheHitCount += 1;
  if (total >= MONTHLY_VOLUME_VALID_THRESHOLD) {
    telemetry.volumeAboveThresholdFromCacheCount += 1;
  }
}

/** 영속 캐시 행 → KeywordVolumeResult (블로그 분석 병합·prefetch 하이드레이션용) */
export function keywordVolumeResultFromPersistentCacheRow(row: KeywordSearchVolumeCacheRow): KeywordVolumeResult {
  return rowToKeywordVolumeResult(row);
}

function rowToKeywordVolumeResult(row: KeywordSearchVolumeCacheRow): KeywordVolumeResult {
  const raw = row.raw as { keywordList?: KeywordToolItem[]; matchedKeyword?: string } | null | undefined;
  const keywordList = Array.isArray(raw?.keywordList)
    ? raw.keywordList!.slice(0, 120)
    : undefined;
  const total = Math.max(0, Math.floor(Number(row.totalVolume)));
  const persistentlyConfirmedZero = total <= 0 && row.belowThreshold;
  const matchedRaw =
    typeof raw?.matchedKeyword === "string" && raw.matchedKeyword.trim()
      ? raw.matchedKeyword.trim()
      : row.keyword;
  return {
    mobile: row.monthlyMobileQcCnt ?? 0,
    pc: row.monthlyPcQcCnt ?? 0,
    total,
    ok: true,
    matchedKeyword: matchedRaw,
    keywordList,
    persistentlyConfirmedZero,
  };
}

/**
 * SearchAD 외 소스(노출 스냅샷 등)에서 알려진 검색량을 KeywordSearchVolumeCache에 반영한다.
 * `/api/check-rank` 경로는 기존처럼 SearchAD 성공 시 persistKeywordVolumeCache 로 저장된다.
 */
export async function upsertKeywordVolumeCacheRow(params: {
  displayKeyword: string;
  normalizedKeyword: string;
  monthlyPcQcCnt: number | null;
  monthlyMobileQcCnt: number | null;
  totalVolume: number;
  belowThreshold: boolean;
  source?: string;
  checkedAt?: Date;
  raw?: object | null;
  prefetch?: Map<string, KeywordSearchVolumeCacheRow>;
}): Promise<KeywordSearchVolumeCacheRow | null> {
  const totalVol = Math.max(0, Math.floor(params.totalVolume));
  const checkedAt = params.checkedAt ?? new Date();
  const source = params.source ?? "naver-searchad";

  const saved = await prisma.keywordSearchVolumeCache.upsert({
    where: { normalizedKeyword: params.normalizedKeyword.slice(0, 512) },
    create: {
      keyword: params.displayKeyword.slice(0, 512),
      normalizedKeyword: params.normalizedKeyword.slice(0, 512),
      monthlyPcQcCnt: params.monthlyPcQcCnt,
      monthlyMobileQcCnt: params.monthlyMobileQcCnt,
      totalVolume: totalVol,
      belowThreshold: params.belowThreshold,
      source: source.slice(0, 128),
      checkedAt,
      raw: params.raw ?? undefined,
    },
    update: {
      keyword: params.displayKeyword.slice(0, 512),
      monthlyPcQcCnt: params.monthlyPcQcCnt,
      monthlyMobileQcCnt: params.monthlyMobileQcCnt,
      totalVolume: totalVol,
      belowThreshold: params.belowThreshold,
      source: source.slice(0, 128),
      checkedAt,
      raw: params.raw ?? undefined,
    },
  });

  params.prefetch?.set(params.normalizedKeyword.slice(0, 512), saved);
  return saved;
}

async function persistKeywordVolumeCache(params: {
  displayKeyword: string;
  normalizedKeyword: string;
  mobile: number;
  pc: number;
  total: number;
  ok: boolean;
  reason?: KeywordVolumeResult["reason"];
  keywordList?: KeywordToolItem[] | null;
  matchedKeyword?: string | null;
  prefetch?: Map<string, KeywordSearchVolumeCacheRow>;
}): Promise<KeywordSearchVolumeCacheRow | null> {
  const totalVol = Math.max(0, Math.floor(params.total));
  const belowThreshold =
    params.reason === "not-found" || !params.ok
      ? true
      : totalVol < MONTHLY_VOLUME_VALID_THRESHOLD;

  const rawPayload =
    params.keywordList && params.keywordList.length > 0
      ? ({
          keywordList: params.keywordList.slice(0, 120),
          matchedKeyword: params.matchedKeyword ?? undefined,
        } as object)
      : params.matchedKeyword
        ? ({ matchedKeyword: params.matchedKeyword } as object)
        : undefined;

  return upsertKeywordVolumeCacheRow({
    displayKeyword: params.displayKeyword,
    normalizedKeyword: params.normalizedKeyword,
    monthlyPcQcCnt: params.pc,
    monthlyMobileQcCnt: params.mobile,
    totalVolume: totalVol,
    belowThreshold,
    source: "naver-searchad",
    checkedAt: new Date(),
    raw: rawPayload ?? undefined,
    prefetch: params.prefetch,
  });
}

async function fetchKeywordSearchVolumeUncached(
  keyword: string,
  accessKey: string,
  secretKey: string,
  customerId: string
): Promise<KeywordVolumeResult> {
  const method = "GET";
  const uri = "/keywordstool";
  const kwRaw = normalizeVolumeKeywordInput(String(keyword ?? ""));
  if (!kwRaw || !kwRaw.replace(/\s/g, "")) {
    console.warn(`[getKeywordSearchVolume] 비정상/빈 키워드: "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const hints = hintCandidates(kwRaw);

  if (!hints.length) {
    console.warn(`[getKeywordSearchVolume] 빈 키워드: "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const attemptFetch = (hintKeywords: string) => {
    const qs = new URLSearchParams({ hintKeywords, showDetail: "1" });
    const url = `https://api.searchad.naver.com${uri}?${qs.toString()}`;
    const ts = Date.now().toString();
    const sig = makeSignature(ts, method, uri, secretKey);
    return fetch(url, {
      method,
      headers: {
        "X-Timestamp": ts,
        "X-API-KEY": accessKey,
        "X-Signature": sig,
        "X-Customer": customerId,
        "Content-Type": "application/json; charset=UTF-8",
      },
      cache: "no-store",
    });
  };

  let chosen: KeywordToolItem | null = null;
  let chosenKeywordList: KeywordToolItem[] | null = null;

  try {
    for (const hint of hints) {
      const hintKeywords = hintKeywordsToApiParam(hint);
      if (!hintKeywords) continue;

      const res = await attemptFetch(hintKeywords);

      if (res.status === 429) {
        console.warn(`[getKeywordSearchVolume] 429 keyword="${kwRaw}"`);
        return { mobile: 0, pc: 0, total: 0, ok: false, reason: "rate-limited" };
      }

      if (!res.ok) {
        console.warn(`[getKeywordSearchVolume] 실패 keyword="${kwRaw}" status=${res.status}`);
        continue;
      }

      const data = (await res.json()) as { keywordList?: KeywordToolItem[] };
      const next = (data.keywordList || []) as KeywordToolItem[];
      if (isDevLogs) {
        console.log("[getKeywordSearchVolume raw]", {
          keyword: kwRaw,
          hintKeywords,
          count: next.length,
          sample: next.slice(0, 5).map((item) => ({
            relKeyword: item.relKeyword,
            monthlyPcQcCnt: item.monthlyPcQcCnt,
            monthlyMobileQcCnt: item.monthlyMobileQcCnt,
          })),
        });
      }
      if (!next.length) continue;

      const row = pickKeywordVolumeRow(next, kwRaw);
      if (row) {
        chosen = row;
        chosenKeywordList = next;
        break;
      }
    }

    if (!chosen) {
      return { mobile: 0, pc: 0, total: 0, ok: false, reason: "not-found" };
    }

    const pcP = parseQcCount(chosen.monthlyPcQcCnt);
    const mobP = parseQcCount(chosen.monthlyMobileQcCnt);
    let total = pcP.num + mobP.num;
    const anyLt10 = pcP.isLt10Marker || mobP.isLt10Marker;
    if (total <= 0 && anyLt10) {
      total = 1;
    }
    return {
      mobile: mobP.num,
      pc: pcP.num,
      total,
      ok: total > 0,
      matchedKeyword: chosen.relKeyword,
      keywordList: (chosenKeywordList ?? []).slice(0, 120),
    };
  } catch (error) {
    console.error(`[getKeywordSearchVolume] 예외 keyword="${kwRaw}"`, error);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "exception" };
  }
}

export async function getKeywordSearchVolume(
  keyword: string,
  options?: GetKeywordSearchVolumeOptions
): Promise<KeywordVolumeResult> {
  const telemetry = options?.telemetry;
  const prefetch = options?.persistentCachePrefetch;
  const budget = options?.searchAdBudgetRemaining;

  const kwInput = normalizeVolumeKeywordInput(String(keyword ?? ""));
  if (!kwInput || !kwInput.replace(/\s/g, "")) {
    console.warn(`[getKeywordSearchVolume] 빈 키워드: "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const cacheKey = keywordVolumeCacheKey(kwInput);
  if (!cacheKey) {
    console.warn(`[getKeywordSearchVolume] 빈 키워드(정규화 후): "${keyword}"`);
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "empty" };
  }

  const now = Date.now();
  pruneExpiredVolumeCache(now);

  const memHit = volumeCache.get(cacheKey);
  if (memHit && now - memHit.timestamp < CACHE_TTL_MS) {
    bumpCacheHitTelemetry(telemetry, memHit.value.total);
    return { ...memHit.value };
  }

  let dbRow: KeywordSearchVolumeCacheRow | null = prefetch?.get(cacheKey) ?? null;
  if (!dbRow) {
    try {
      dbRow = await prisma.keywordSearchVolumeCache.findUnique({
        where: { normalizedKeyword: cacheKey },
      });
      if (dbRow) prefetch?.set(cacheKey, dbRow);
    } catch (e) {
      console.warn("[getKeywordSearchVolume] 영속 캐시 조회 실패", e);
      dbRow = null;
    }
  }

  const reusePersistentRowRegardlessOfTtl = options?.skipSearchAdWhenPersistentCacheRowExists === true;

  if (dbRow && (reusePersistentRowRegardlessOfTtl || isKeywordVolumeDbCacheFresh(dbRow.checkedAt))) {
    const value = rowToKeywordVolumeResult(dbRow);
    bumpCacheHitTelemetry(telemetry, value.total);
    volumeCache.set(cacheKey, { value: { ...value }, timestamp: Date.now() });
    return { ...value };
  }

  if (!dbRow) {
    if (telemetry) telemetry.volumeCacheMissCount += 1;
  } else {
    if (telemetry) telemetry.volumeCacheStaleCount += 1;
  }

  if (budget !== undefined && budget.remaining <= 0) {
    if (telemetry) telemetry.volumeDeferredDueToBudgetCount += 1;
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "skipped-budget" };
  }

  const accessKey = process.env.NAVER_SEARCHAD_ACCESS_KEY;
  const secretKey = process.env.NAVER_SEARCHAD_SECRET_KEY;
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID;

  if (!accessKey || !secretKey || !customerId) {
    console.warn(
      "[getKeywordSearchVolume] NAVER_SEARCHAD_ACCESS_KEY / SECRET_KEY / CUSTOMER_ID 중 일부가 비어 있습니다."
    );
    return { mobile: 0, pc: 0, total: 0, ok: false, reason: "missing-env" };
  }

  if (telemetry) telemetry.searchAdAttemptedCount += 1;

  await acquireVolumeSearchAdSlot();
  try {
    if (budget !== undefined) budget.remaining -= 1;

    const value = await fetchKeywordSearchVolumeUncached(kwInput, accessKey, secretKey, customerId);

    if (value.reason === "rate-limited") {
      if (telemetry) telemetry.searchAd429Stopped = true;
      return value;
    }

    const shouldPersist =
      value.reason !== "exception" &&
      value.reason !== "empty" &&
      value.reason !== "skipped-budget";

    if (shouldPersist) {
      try {
        const savedRow = await persistKeywordVolumeCache({
          displayKeyword: kwInput,
          normalizedKeyword: cacheKey,
          mobile: value.mobile,
          pc: value.pc,
          total: value.total,
          ok: value.ok,
          reason: value.reason,
          keywordList: value.keywordList ?? null,
          matchedKeyword: value.matchedKeyword ?? null,
          prefetch,
        });
        if (savedRow) {
          if (telemetry) telemetry.searchAdSuccessCount += 1;

          if (
            telemetry &&
            savedRow.totalVolume >= MONTHLY_VOLUME_VALID_THRESHOLD
          ) {
            telemetry.volumeAboveThresholdFromSearchAdCount += 1;
          }

          const out = rowToKeywordVolumeResult(savedRow);
          volumeCache.set(cacheKey, { value: { ...out }, timestamp: Date.now() });
          return { ...out };
        }
      } catch (e) {
        console.warn("[getKeywordSearchVolume] 영속 캐시 저장 실패", e);
      }
    }

    if (value.ok && value.total > 0) {
      volumeCache.set(cacheKey, { value: { ...value }, timestamp: Date.now() });
    }
    return { ...value };
  } finally {
    releaseVolumeSearchAdSlot();
  }
}
