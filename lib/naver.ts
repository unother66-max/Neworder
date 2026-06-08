import * as cheerio from "cheerio";
import type { Element } from "domhandler";

export type NaverPostKey = {
  blogId: string;
  logNo: string;
};

export type NaverBlogSearchResult = {
  rank: number;
  organicRank: number;
  title: string;
  url: string;
  key: string | null;
  isAd: boolean;
};

export type NaverBlogRankSearchResult = {
  rankMap: Map<string, number>;
  organicRankMap: Map<string, number>;
  entries: () => IterableIterator<[string, number]>;
  results: NaverBlogSearchResult[];
  searchUrls: string[];
  cached: boolean;
  stale: boolean;
  fetchedAt: string;
  source: "naver-blog-tab";
  checkedLimit: number;
};

export type NaverBlogRankTargetSearchResult = NaverBlogRankSearchResult & {
  matched: NaverBlogSearchResult | null;
  matchedReason: "blogId-logNo" | "title" | null;
};

export class NaverSearchBlockedError extends Error {
  code = "NAVER_BLOCKED" as const;
  status: number;

  constructor(status: number) {
    super("네이버 검색 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.");
    this.name = "NaverSearchBlockedError";
    this.status = status;
  }
}

export class NaverSearchParseError extends Error {
  code = "PARSE_FAILED" as const;

  constructor() {
    super("네이버 검색 결과를 해석하지 못했습니다. 잠시 후 다시 시도해주세요.");
    this.name = "NaverSearchParseError";
  }
}

const KEYWORD_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const KEYWORD_SEARCH_STALE_TTL_MS = 3 * 60 * 60 * 1000;
const NAVER_BLOG_BLOCKED_COOLDOWN_MS = 90 * 1000;
const NAVER_BLOG_FETCH_MIN_INTERVAL_MS = 1000;
const NAVER_BLOG_FETCH_JITTER_MS = 500;

type KeywordSearchCacheEntry = {
  results: NaverBlogSearchResult[];
  searchUrls: string[];
  fetchedAt: string;
  expiresAt: number;
  staleExpiresAt: number;
  checkedLimit: number;
};

const keywordSearchCache = new Map<string, KeywordSearchCacheEntry>();
const pendingKeywordSearches = new Map<string, Promise<NaverBlogRankSearchResult>>();
let lastNaverBlogFetchAt = 0;
let naverBlogBlockedUntil = 0;
let naverFetchQueue = Promise.resolve();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNaverBlogFetchInterval() {
  return NAVER_BLOG_FETCH_MIN_INTERVAL_MS + Math.floor(Math.random() * NAVER_BLOG_FETCH_JITTER_MS);
}

function normalizeSearchKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildKeywordSearchCacheKey(keyword: string, maxResults: number) {
  return `${normalizeSearchKeyword(keyword)}::pc-blog-tab::relevance::${maxResults}`;
}

function buildRankSearchResult(
  entry: KeywordSearchCacheEntry,
  cached: boolean,
  stale: boolean
): NaverBlogRankSearchResult {
  const rankMap = new Map<string, number>();
  const organicRankMap = new Map<string, number>();

  entry.results.forEach((item) => {
    if (!item.key) return;
    rankMap.set(item.key, item.rank);
    organicRankMap.set(item.key, item.organicRank);
  });

  return {
    rankMap,
    organicRankMap,
    entries: () => rankMap.entries(),
    results: entry.results,
    searchUrls: entry.searchUrls,
    cached,
    stale,
    fetchedAt: entry.fetchedAt,
    source: "naver-blog-tab",
    checkedLimit: entry.checkedLimit,
  };
}

function getKeywordSearchCacheEntry(cacheKey: string, allowStale: boolean) {
  const entry = keywordSearchCache.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresAt > now) return { entry, stale: false };
  if (allowStale && entry.staleExpiresAt > now) return { entry, stale: true };

  if (entry.staleExpiresAt <= now) keywordSearchCache.delete(cacheKey);
  return null;
}

function getKeywordSearchCache(cacheKey: string, allowStale: boolean, minCheckedLimit: number) {
  const cached = getKeywordSearchCacheEntry(cacheKey, allowStale);
  if (!cached || cached.entry.checkedLimit < minCheckedLimit) return null;
  return buildRankSearchResult(cached.entry, true, cached.stale);
}

function setKeywordSearchCache(
  cacheKey: string,
  results: NaverBlogSearchResult[],
  searchUrls: string[],
  checkedLimit: number
) {
  const entry: KeywordSearchCacheEntry = {
    results,
    searchUrls,
    fetchedAt: new Date().toISOString(),
    expiresAt: Date.now() + KEYWORD_SEARCH_CACHE_TTL_MS,
    staleExpiresAt: Date.now() + KEYWORD_SEARCH_STALE_TTL_MS,
    checkedLimit,
  };
  keywordSearchCache.set(cacheKey, entry);
  return entry;
}

function findTargetInResults(
  results: NaverBlogSearchResult[],
  targetKey: string | null,
  targetTitle: string
) {
  if (targetKey) {
    const matched = results.find((item) => item.key === targetKey);
    if (matched) return { matched, matchedReason: "blogId-logNo" as const };
  }

  if (targetTitle.trim()) {
    const matched = results.find((item) => isLikelySameNaverBlogTitle(item.title, targetTitle));
    if (matched) return { matched, matchedReason: "title" as const };
  }

  return { matched: null, matchedReason: null };
}

function setNaverBlogBlocked(status: number) {
  naverBlogBlockedUntil = Math.max(
    naverBlogBlockedUntil,
    Date.now() + NAVER_BLOG_BLOCKED_COOLDOWN_MS
  );
  return new NaverSearchBlockedError(status);
}

async function runNaverBlogFetchWithThrottle<T>(fn: () => Promise<T>) {
  const run = async () => {
    const interval = getNaverBlogFetchInterval();
    const waitMs = Math.max(0, lastNaverBlogFetchAt + interval - Date.now());
    if (waitMs > 0) await wait(waitMs);

    try {
      return await fn();
    } finally {
      lastNaverBlogFetchAt = Date.now();
    }
  };

  const queued = naverFetchQueue.then(run, run);
  naverFetchQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

function normalizeUrl(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractBlogPostKeyFromText(text: string): NaverPostKey | null {
  const variants = new Set<string>();
  let current = text;

  for (let i = 0; i < 3; i += 1) {
    variants.add(current);
    const decoded = safeDecodeURIComponent(current)
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
    if (decoded === current) break;
    current = decoded;
  }

  for (const value of variants) {
    const pathMatch = value.match(
      /https?:\/\/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]{2,})\/(\d{6,})/i
    );
    if (pathMatch) {
      return { blogId: pathMatch[1].toLowerCase(), logNo: pathMatch[2] };
    }

    const postViewMatch = value.match(
      /https?:\/\/(?:m\.)?blog\.naver\.com\/PostView\.naver\?[^"'<> \t\r\n]{0,600}/i
    );
    if (postViewMatch) {
      try {
        const u = new URL(postViewMatch[0]);
        const blogId = u.searchParams.get("blogId");
        const logNo = u.searchParams.get("logNo");
        if (blogId && logNo) return { blogId: blogId.toLowerCase(), logNo };
      } catch {
        const blogId = postViewMatch[0].match(/[?&]blogId=([^&]+)/)?.[1];
        const logNo = postViewMatch[0].match(/[?&]logNo=(\d{6,})/)?.[1];
        if (blogId && logNo) return { blogId: blogId.toLowerCase(), logNo };
      }
    }
  }

  return null;
}

export function extractBlogPostKey(url: string): NaverPostKey | null {
  const normalized = normalizeUrl(url);

  try {
    const u = new URL(normalized);

    // 1) m.blog.naver.com/kikolog/223123456789
    // 2) blog.naver.com/kikolog/223123456789
    const pathParts = u.pathname.split("/").filter(Boolean);

    if (
      (u.hostname === "m.blog.naver.com" || u.hostname === "blog.naver.com") &&
      pathParts.length >= 2
    ) {
      const blogId = pathParts[0];
      const logNo = pathParts[1];

      if (blogId && /^\d+$/.test(logNo)) {
        return { blogId: blogId.toLowerCase(), logNo };
      }
    }

    // 3) blog.naver.com/PostView.naver?blogId=kikolog&logNo=223123456789
    const blogId = u.searchParams.get("blogId");
    const logNo = u.searchParams.get("logNo");

    if (blogId && logNo) {
      return { blogId: blogId.toLowerCase(), logNo };
    }

    for (const value of u.searchParams.values()) {
      const key = extractBlogPostKeyFromText(value);
      if (key) return key;
    }
  } catch {
    return extractBlogPostKeyFromText(normalized);
  }

  return extractBlogPostKeyFromText(normalized);
}

export function normalizeNaverBlogTitle(title: string) {
  return decodeHtmlEntities(title)
    .replace(/<[^>]+>/g, " ")
    .replace(/[“”‘’]/g, "'")
    .replace(/[|ㅣ｜·ㆍ・…]/g, " ")
    .replace(/[.,，、。]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function getTitleBigrams(value: string) {
  const bigrams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) {
    bigrams.push(value.slice(i, i + 2));
  }
  return bigrams;
}

function getDiceSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const counts = new Map<string, number>();
  for (const bigram of getTitleBigrams(a)) {
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (const bigram of getTitleBigrams(b)) {
    const count = counts.get(bigram) ?? 0;
    if (count <= 0) continue;
    counts.set(bigram, count - 1);
    intersection += 1;
  }

  return (2 * intersection) / (a.length + b.length - 2);
}

export function isLikelySameNaverBlogTitle(a: string, b: string) {
  const na = normalizeNaverBlogTitle(a);
  const nb = normalizeNaverBlogTitle(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  if (getDiceSimilarity(na, nb) >= 0.72) return true;

  const compactA = new Set(na.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const compactB = new Set(nb.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  if (!compactA.size || !compactB.size) return false;

  const smaller = compactA.size <= compactB.size ? compactA : compactB;
  const larger = compactA.size <= compactB.size ? compactB : compactA;
  let matched = 0;
  for (const token of smaller) {
    if (larger.has(token)) matched += 1;
  }
  return matched / smaller.size >= 0.75;
}

function buildPcBlogTabSearchUrl(keyword: string, start: number) {
  const params = new URLSearchParams({
    ssc: "tab.blog.all",
    sm: "tab_jum",
    query: keyword,
  });
  if (start > 1) params.set("start", String(start));
  return `https://search.naver.com/search.naver?${params.toString()}`;
}

async function fetchPcBlogTabHtml(url: string) {
  if (naverBlogBlockedUntil > Date.now()) {
    throw new NaverSearchBlockedError(403);
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://search.naver.com/",
  };

  return runNaverBlogFetchWithThrottle(async () => {
    if (naverBlogBlockedUntil > Date.now()) {
      throw new NaverSearchBlockedError(403);
    }

    const res = await fetch(url, {
      headers,
      cache: "no-store",
    });

    if (res.ok) return res.text();

    if (res.status === 403 || res.status === 429) {
      throw setNaverBlogBlocked(res.status);
    }

    throw new Error(`네이버 블로그 탭 검색 호출 실패: ${res.status}`);
  });
}

function isAdResultElement($: cheerio.CheerioAPI, el: Element) {
  const text = $(el).closest("li, div").text();
  return /광고/.test(text.slice(0, 120));
}

function parsePcBlogTabResults(html: string, rankOffset: number, organicOffset: number) {
  const $ = cheerio.load(html);
  const results: NaverBlogSearchResult[] = [];
  const seen = new Set<string>();
  let organicRank = organicOffset;

  $('a[href*="blog.naver.com"]').each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;

    const keyObj = extractBlogPostKey(href);
    const key = keyObj ? `${keyObj.blogId}:${keyObj.logNo}` : null;
    if (!key) return;

    const dedupeKey = key ?? normalizeUrl(href);
    if (seen.has(dedupeKey)) return;

    const rawTitle = $(el).find("span").first().text() || $(el).text();
    const title = decodeHtmlEntities(rawTitle).replace(/\s+/g, " ").trim();
    if (!title || title.length < 5) return;

    seen.add(dedupeKey);
    const isAd = isAdResultElement($, el);
    if (!isAd) organicRank += 1;

    results.push({
      rank: rankOffset + results.length + 1,
      organicRank,
      title,
      url: href,
      key,
      isAd,
    });
  });

  return results;
}

async function fetchNaverBlogRankResults(keyword: string, maxResults: number) {
  const results: NaverBlogSearchResult[] = [];
  const seenKeys = new Set<string>();
  const searchUrls: string[] = [];
  let start = 1;
  let organicOffset = 0;

  while (results.length < maxResults) {
    const url = buildPcBlogTabSearchUrl(keyword, start);
    searchUrls.push(url);
    const html = await fetchPcBlogTabHtml(url);
    const parsed = parsePcBlogTabResults(html, results.length, organicOffset);
    if (start === 1 && !parsed.length && html.includes("blog.naver.com")) {
      throw new NaverSearchParseError();
    }
    if (!parsed.length) break;

    let added = 0;
    for (const item of parsed) {
      const dedupeKey = item.key ?? normalizeUrl(item.url);
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      results.push({ ...item, rank: results.length + 1 });
      if (!item.isAd) organicOffset += 1;
      added += 1;
      if (results.length >= maxResults) break;
    }

    if (added === 0) break;
    start += 30;

    if (parsed.length < 10) break;
  }

  return { results, searchUrls };
}

async function fetchNaverBlogRankResultsForTarget(
  keyword: string,
  targetKey: string | null,
  targetTitle: string,
  maxResults: number,
  initialResults: NaverBlogSearchResult[] = [],
  initialSearchUrls: string[] = []
) {
  const results = [...initialResults];
  const seenKeys = new Set(results.map((item) => item.key ?? normalizeUrl(item.url)));
  const searchUrls = [...initialSearchUrls];
  let start = Math.floor(results.length / 30) * 30 + 1;
  let organicOffset = results.filter((item) => !item.isAd).length;

  while (results.length < maxResults) {
    const url = buildPcBlogTabSearchUrl(keyword, start);
    searchUrls.push(url);
    const html = await fetchPcBlogTabHtml(url);
    const parsed = parsePcBlogTabResults(html, results.length, organicOffset);
    if (start === 1 && !parsed.length && html.includes("blog.naver.com")) {
      throw new NaverSearchParseError();
    }
    if (!parsed.length) break;

    let added = 0;
    for (const item of parsed) {
      const dedupeKey = item.key ?? normalizeUrl(item.url);
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);
      results.push({ ...item, rank: results.length + 1 });
      if (!item.isAd) organicOffset += 1;
      added += 1;
      if (results.length >= maxResults) break;
    }

    const found = findTargetInResults(results, targetKey, targetTitle);
    const checkedLimit = Math.min(maxResults, Math.max(results.length, start + 29));
    if (found.matched || added === 0 || parsed.length < 10 || results.length >= maxResults) {
      return {
        results,
        searchUrls,
        checkedLimit,
        matched: found.matched,
        matchedReason: found.matchedReason,
      };
    }

    start += 30;
  }

  const found = findTargetInResults(results, targetKey, targetTitle);
  return {
    results,
    searchUrls,
    checkedLimit: Math.min(maxResults, Math.max(results.length, maxResults)),
    matched: found.matched,
    matchedReason: found.matchedReason,
  };
}

export async function searchNaverBlogRanks(keyword: string, maxResults = 300) {
  const cacheKey = buildKeywordSearchCacheKey(keyword, maxResults);
  const freshCache = getKeywordSearchCache(cacheKey, false, maxResults);
  if (freshCache) return freshCache;

  if (naverBlogBlockedUntil > Date.now()) {
    const staleCache = getKeywordSearchCache(cacheKey, true, maxResults);
    if (staleCache) return staleCache;
    throw new NaverSearchBlockedError(403);
  }

  const pending = pendingKeywordSearches.get(cacheKey);
  if (pending) {
    const result = await pending;
    return {
      ...result,
      cached: true,
    };
  }

  const task = (async () => {
    try {
      const { results, searchUrls } = await fetchNaverBlogRankResults(keyword, maxResults);
      const entry = setKeywordSearchCache(cacheKey, results, searchUrls, maxResults);
      return buildRankSearchResult(entry, false, false);
    } catch (error) {
      if (error instanceof NaverSearchBlockedError) {
        const staleCache = getKeywordSearchCache(cacheKey, true, maxResults);
        if (staleCache) return staleCache;
      }
      throw error;
    }
  })();

  pendingKeywordSearches.set(cacheKey, task);

  try {
    return await task;
  } finally {
    pendingKeywordSearches.delete(cacheKey);
  }
}

export async function searchNaverBlogRankForTarget(
  keyword: string,
  targetKey: string | null,
  targetTitle: string,
  maxResults = 100
): Promise<NaverBlogRankTargetSearchResult> {
  const cacheKey = buildKeywordSearchCacheKey(keyword, maxResults);
  const cached = getKeywordSearchCacheEntry(cacheKey, false);
  if (cached) {
    const found = findTargetInResults(cached.entry.results, targetKey, targetTitle);
    if (found.matched || cached.entry.checkedLimit >= maxResults) {
      return {
        ...buildRankSearchResult(cached.entry, true, cached.stale),
        matched: found.matched,
        matchedReason: found.matchedReason,
      };
    }
  }

  if (naverBlogBlockedUntil > Date.now()) {
    const staleCached = getKeywordSearchCacheEntry(cacheKey, true);
    if (staleCached) {
      const found = findTargetInResults(staleCached.entry.results, targetKey, targetTitle);
      if (found.matched || staleCached.entry.checkedLimit >= maxResults) {
        return {
          ...buildRankSearchResult(staleCached.entry, true, true),
          matched: found.matched,
          matchedReason: found.matchedReason,
        };
      }
    }
    throw new NaverSearchBlockedError(403);
  }

  const pending = pendingKeywordSearches.get(cacheKey);
  if (pending) {
    const result = await pending;
    const found = findTargetInResults(result.results, targetKey, targetTitle);
    return {
      ...result,
      cached: true,
      matched: found.matched,
      matchedReason: found.matchedReason,
    };
  }

  const task = (async () => {
    try {
      const initial = cached?.entry;
      const fetched = await fetchNaverBlogRankResultsForTarget(
        keyword,
        targetKey,
        targetTitle,
        maxResults,
        initial?.results,
        initial?.searchUrls
      );
      const checkedLimit = fetched.matched
        ? Math.min(maxResults, Math.ceil(fetched.matched.rank / 30) * 30)
        : Math.min(maxResults, Math.max(fetched.checkedLimit, fetched.results.length));
      const entry = setKeywordSearchCache(
        cacheKey,
        fetched.results,
        fetched.searchUrls,
        checkedLimit
      );
      return {
        ...buildRankSearchResult(entry, false, false),
        matched: fetched.matched,
        matchedReason: fetched.matchedReason,
      };
    } catch (error) {
      if (error instanceof NaverSearchBlockedError) {
        const staleCached = getKeywordSearchCacheEntry(cacheKey, true);
        if (staleCached) {
          const found = findTargetInResults(staleCached.entry.results, targetKey, targetTitle);
          if (found.matched || staleCached.entry.checkedLimit >= maxResults) {
            return {
              ...buildRankSearchResult(staleCached.entry, true, true),
              matched: found.matched,
              matchedReason: found.matchedReason,
            };
          }
        }
      }
      throw error;
    }
  })();

  pendingKeywordSearches.set(cacheKey, task);

  try {
    return await task;
  } finally {
    pendingKeywordSearches.delete(cacheKey);
  }
}

export function makePostMatchKey(url: string) {
  const key = extractBlogPostKey(url);
  if (!key) return null;

  return `${key.blogId}:${key.logNo}`;
}
