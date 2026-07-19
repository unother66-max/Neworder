import { parseNaverPlaceNewOpen } from "./naver-place-new-open";

const PCMAP_RESTAURANT_LIST_URL =
  "https://pcmap.place.naver.com/restaurant/list";

type JsonRecord = Record<string, unknown>;

export type PcmapRestaurantListHtmlDiagnosticParams = {
  keyword: string;
  x?: string;
  y?: string;
  targetName?: string;
  start?: number;
  display?: number;
  maxPages?: number;
};

export type PcmapRestaurantListHtmlPlace = {
  rank: number;
  id: string;
  name: string;
  isNewOpen: boolean | null;
  newOpenLabel: "새로오픈" | null;
};

export type PcmapRestaurantListHtmlResultStatus =
  | "FOUND"
  | "OUT_OF_RANGE_70"
  | "OUT_OF_RANGE_280"
  | "PARTIAL_FAILED"
  | "BLOCKED"
  | "HTML_PARSE_FAILED";

export type PcmapRestaurantListHtmlPageDiagnostic = {
  start: number;
  status: number;
  contentType: string;
  htmlLength: number;
  parsedCount: number;
  detectedStatePattern: string | null;
  failureCode: string | null;
};

export type PcmapRestaurantListHtmlDiagnosticResult = {
  ok: boolean;
  status: number;
  contentType: string;
  htmlLength: number;
  hasNcaptcha: boolean;
  hasPlaceListBusinessesItem: boolean;
  hasApolloState: boolean;
  detectedStatePattern: string | null;
  parsedCount: number;
  top10: PcmapRestaurantListHtmlPlace[];
  targetRank: number | null;
  debugReason: string | null;
  resultStatus: PcmapRestaurantListHtmlResultStatus;
  failureCode: string | null;
  pageStarts: number[];
  fetchedPages: number;
  checkedCount: number;
  pages: PcmapRestaurantListHtmlPageDiagnostic[];
  places: PcmapRestaurantListHtmlPlace[];
};

type ParsedHtmlPage = {
  ok: boolean;
  hasNcaptcha: boolean;
  hasPlaceListBusinessesItem: boolean;
  hasApolloState: boolean;
  detectedStatePattern: string | null;
  parsedCount: number;
  places: PcmapRestaurantListHtmlPlace[];
  top10: PcmapRestaurantListHtmlPlace[];
  targetRank: number | null;
  debugReason: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "");
}

function scriptContents(html: string): string[] {
  return Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function balancedObjectAt(source: string, start: number): string | null {
  if (start < 0 || source[start] !== "{") return null;
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractStateCandidates(html: string): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    const parsed = parseJsonCandidate(trimmed);
    if (parsed !== null) out.push(parsed);
  };

  for (const script of scriptContents(html)) {
    add(script);
    for (const marker of [
      "__APOLLO_STATE__",
      "initialApolloState",
      "apolloState",
      "ROOT_QUERY",
    ]) {
      let markerAt = script.indexOf(marker);
      while (markerAt >= 0) {
        const objectAt = script.indexOf("{", markerAt + marker.length);
        const objectText = balancedObjectAt(script, objectAt);
        if (objectText) add(objectText);
        markerAt = script.indexOf(marker, markerAt + marker.length);
      }
    }
  }
  return out;
}

function collectApolloMaps(
  value: unknown,
  maps: JsonRecord[],
  visited = new Set<object>(),
  depth = 0
): void {
  if (!isRecord(value) || visited.has(value) || depth > 12) return;
  visited.add(value);
  if (
    "ROOT_QUERY" in value ||
    Object.keys(value).some((key) => key.startsWith("PlaceListBusinessesItem:"))
  ) {
    maps.push(value);
  }
  for (const child of Object.values(value)) {
    collectApolloMaps(child, maps, visited, depth + 1);
  }
}

function buildEntityIndex(states: unknown[]): Map<string, JsonRecord> {
  const index = new Map<string, JsonRecord>();
  const visited = new Set<object>();
  const walk = (value: unknown, depth: number) => {
    if (!isRecord(value) || visited.has(value) || depth > 14) return;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (isRecord(child)) {
        index.set(key, child);
        walk(child, depth + 1);
      } else if (Array.isArray(child)) {
        for (const item of child) walk(item, depth + 1);
      }
    }
  };
  for (const state of states) walk(state, 0);
  return index;
}

function resolveRef(value: unknown, index: Map<string, JsonRecord>): unknown {
  if (!isRecord(value) || typeof value.__ref !== "string") return value;
  return index.get(value.__ref) ?? value;
}

function placeFromValue(
  value: unknown,
  index: Map<string, JsonRecord>
): Omit<PcmapRestaurantListHtmlPlace, "rank"> | null {
  const resolved = resolveRef(value, index);
  if (!isRecord(resolved)) return null;
  const nested = isRecord(resolved.business) ? resolved.business : resolved;
  const name = String(nested.name ?? resolved.name ?? "").trim();
  if (!name) return null;
  const ref = isRecord(value) ? String(value.__ref ?? "") : "";
  const id = String(nested.id ?? resolved.id ?? ref.split(":").at(-1) ?? "").trim();
  return { id, name, ...parseNaverPlaceNewOpen(nested) };
}

function findOrderedArray(
  value: unknown,
  index: Map<string, JsonRecord>,
  path: string,
  depth = 0,
  visited = new Set<object>()
): { values: unknown[]; pattern: string } | null {
  const resolved = resolveRef(value, index);
  if (Array.isArray(resolved)) {
    const parsed = resolved.map((item) => placeFromValue(item, index));
    if (parsed.some(Boolean)) {
      const refBased = resolved.some(
        (item) => isRecord(item) && typeof item.__ref === "string"
      );
      return {
        values: resolved,
        pattern: `${path}${refBased ? ".__ref[]" : ".items[]"}`,
      };
    }
    for (let i = 0; i < resolved.length; i += 1) {
      const found = findOrderedArray(
        resolved[i],
        index,
        `${path}[${i}]`,
        depth + 1,
        visited
      );
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(resolved) || visited.has(resolved) || depth > 8) return null;
  visited.add(resolved);

  const entries = Object.entries(resolved).sort(([a], [b]) => {
    const priority = (key: string) =>
      /^(items|list|businesses|places|restaurants)$/i.test(key) ? 0 : 1;
    return priority(a) - priority(b);
  });
  for (const [key, child] of entries) {
    const found = findOrderedArray(
      child,
      index,
      `${path}.${key}`,
      depth + 1,
      visited
    );
    if (found) return found;
  }
  return null;
}

function orderedPlacesFromStates(states: unknown[], expectedStart = 1): {
  places: Array<Omit<PcmapRestaurantListHtmlPlace, "rank">>;
  pattern: string | null;
} {
  const index = buildEntityIndex(states);
  const maps: JsonRecord[] = [];
  for (const state of states) collectApolloMaps(state, maps);

  const roots: Array<{ value: unknown; path: string }> = [];
  for (const map of maps) {
    const root = resolveRef(map.ROOT_QUERY, index);
    if (!isRecord(root)) continue;
    for (const [key, value] of Object.entries(root)) {
      if (/restaurantList/i.test(key))
        roots.push({ value, path: `ROOT_QUERY.${key}` });
    }
    for (const [key, value] of Object.entries(root)) {
      if (!/restaurantList/i.test(key) && /businesses|places/i.test(key))
        roots.push({ value, path: `ROOT_QUERY.${key}` });
    }
  }

  const namedVisited = new Set<object>();
  const collectNamedRoots = (value: unknown, path: string, depth: number) => {
    if (!isRecord(value) || namedVisited.has(value) || depth > 12) return;
    namedVisited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (/restaurantList|restaurants|businesses|places/i.test(key)) {
        roots.push({ value: child, path: `${path}.${key}` });
      }
      collectNamedRoots(child, `${path}.${key}`, depth + 1);
    }
  };
  for (const state of states) collectNamedRoots(state, "STATE", 0);

  const candidates: Array<{
    places: Array<Omit<PcmapRestaurantListHtmlPlace, "rank">>;
    pattern: string;
    score: number;
  }> = [];
  for (const root of roots) {
    const found = findOrderedArray(root.value, index, root.path);
    if (!found) continue;
    const seen = new Set<string>();
    const places: Array<Omit<PcmapRestaurantListHtmlPlace, "rank">> = [];
    for (const value of found.values) {
      const place = placeFromValue(value, index);
      if (!place) continue;
      const key = place.id || normalizeName(place.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      places.push(place);
    }
    if (places.length > 0) {
      const score = /restaurantList|restaurants/i.test(found.pattern)
        ? 1000 + places.length
        : /adBusinesses/i.test(found.pattern)
          ? 10 + places.length
          : 500 + places.length;
      const startBoost = found.pattern.includes(`\"start\":${expectedStart}`)
        ? 5_000
        : 0;
      candidates.push({
        places,
        pattern: found.pattern,
        score: score + startBoost,
      });
    }
  }

  // ROOT_QUERY 필드명이 바뀐 경우에도 실제 Apollo __ref 배열 순서는 보존한다.
  // PlaceListBusinessesItem을 가리키는 배열 중 가장 긴 것을 유기적 목록 후보로 본다.
  const refVisited = new Set<object>();
  const collectPlaceRefArrays = (value: unknown, path: string, depth: number) => {
    if (Array.isArray(value)) {
      const matching = value.filter(
        (item) =>
          isRecord(item) &&
          typeof item.__ref === "string" &&
          item.__ref.startsWith("PlaceListBusinessesItem:")
      );
      if (matching.length > 0 && matching.length === value.length) {
        const places = matching
          .map((item) => placeFromValue(item, index))
          .filter(
            (
              place
            ): place is Omit<PcmapRestaurantListHtmlPlace, "rank"> =>
              Boolean(place)
          );
        if (places.length > 0) {
          candidates.push({
            places,
            pattern: `${path}.__ref[PlaceListBusinessesItem][]`,
            score: 200 + places.length,
          });
        }
      }
      for (let i = 0; i < value.length; i += 1) {
        collectPlaceRefArrays(value[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }
    if (!isRecord(value) || refVisited.has(value) || depth > 14) return;
    refVisited.add(value);
    for (const [key, child] of Object.entries(value)) {
      collectPlaceRefArrays(child, `${path}.${key}`, depth + 1);
    }
  };
  for (const state of states) collectPlaceRefArrays(state, "STATE", 0);

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best
    ? { places: best.places, pattern: best.pattern }
    : { places: [], pattern: null };
}

export function parsePcmapRestaurantListHtmlDiagnostic(
  html: string,
  targetName?: string,
  expectedStart = 1
): ParsedHtmlPage {
  const hasNcaptcha =
    /["']pageId["']\s*:\s*["'][^"']*ncaptcha/i.test(html) ||
    /["']confirmRules["']\s*:/i.test(html) ||
    /<title[^>]*>[^<]*(?:captcha|자동입력)/i.test(html);
  const hasPlaceListBusinessesItem = html.includes("PlaceListBusinessesItem");
  const hasApolloState =
    html.includes("__APOLLO_STATE__") ||
    html.includes("initialApolloState") ||
    html.includes("ROOT_QUERY");
  const states = extractStateCandidates(html);
  const ordered = orderedPlacesFromStates(states, expectedStart);
  const ranked = ordered.places.map((place, index) => ({
    rank: index + 1,
    ...place,
  }));
  const normalizedTarget = normalizeName(targetName);
  const target = normalizedTarget
    ? ranked.find((place) => normalizeName(place.name) === normalizedTarget)
    : undefined;

  let debugReason: string | null = null;
  if (hasNcaptcha) debugReason = "NCAPTCHA_HTML";
  else if (!hasPlaceListBusinessesItem)
    debugReason = "PLACE_LIST_BUSINESSES_ITEM_NOT_FOUND";
  else if (states.length === 0) debugReason = "STATE_JSON_NOT_FOUND";
  else if (ranked.length === 0) debugReason = "ORDERED_PLACE_LIST_NOT_FOUND";

  return {
    ok: debugReason === null && ranked.length > 0,
    hasNcaptcha,
    hasPlaceListBusinessesItem,
    hasApolloState,
    detectedStatePattern: ordered.pattern,
    parsedCount: ranked.length,
    places: ranked,
    top10: ranked.slice(0, 10),
    targetRank: target?.rank ?? null,
    debugReason,
  };
}

export async function fetchPcmapRestaurantListHtmlDiagnostic(
  params: PcmapRestaurantListHtmlDiagnosticParams
): Promise<PcmapRestaurantListHtmlDiagnosticResult> {
  const keyword = String(params.keyword ?? "").trim();
  if (!keyword) throw new Error("keyword가 필요합니다.");
  const x = String(params.x ?? "126.969233").trim();
  const y = String(params.y ?? "37.528107").trim();
  const display = Math.min(70, Math.max(1, Math.floor(params.display ?? 70)));
  const firstStart = Math.max(1, Math.floor(params.start ?? 1));
  const maxPages = Math.min(4, Math.max(1, Math.floor(params.maxPages ?? 4)));
  const pageStarts = Array.from(
    { length: maxPages },
    (_, index) => firstStart + index * display
  );
  const pages: PcmapRestaurantListHtmlPageDiagnostic[] = [];
  const accumulated: PcmapRestaurantListHtmlPlace[] = [];
  const seen = new Set<string>();
  const normalizedTarget = normalizeName(params.targetName);
  let targetRank: number | null = null;
  let lastPage: ParsedHtmlPage | null = null;
  let lastStatus = 0;
  let lastContentType = "";
  let totalHtmlLength = 0;
  let failureCode: string | null = null;

  for (let pageIndex = 0; pageIndex < pageStarts.length; pageIndex += 1) {
    const start = pageStarts[pageIndex]!;
    const page = await fetchPcmapRestaurantListHtmlPage({
      keyword,
      x,
      y,
      targetName: params.targetName,
      start,
      display,
    });
    lastPage = page.parsed;
    lastStatus = page.status;
    lastContentType = page.contentType;
    totalHtmlLength += page.htmlLength;
    pages.push({
      start,
      status: page.status,
      contentType: page.contentType,
      htmlLength: page.htmlLength,
      parsedCount: page.parsed.parsedCount,
      detectedStatePattern: page.parsed.detectedStatePattern,
      failureCode: page.failureCode,
    });
    if (page.failureCode) {
      failureCode = page.failureCode;
      break;
    }

    for (const place of page.parsed.places) {
      const key = place.id || normalizeName(place.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      accumulated.push({ ...place, rank: accumulated.length + 1 });
    }
    if (normalizedTarget) {
      const foundAt = accumulated.findIndex(
        (place) => normalizeName(place.name) === normalizedTarget
      );
      if (foundAt >= 0) {
        targetRank = foundAt + 1;
        break;
      }
    }
    if (pageIndex < pageStarts.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1_000 + Math.floor(Math.random() * 1_001))
      );
    }
  }

  const fetchedPages = pages.length;
  const resultStatus: PcmapRestaurantListHtmlResultStatus = targetRank
    ? "FOUND"
    : failureCode && fetchedPages === 1
      ? failureCode === "NCAPTCHA_HTML" || failureCode.startsWith("HTTP_")
        ? "BLOCKED"
        : "HTML_PARSE_FAILED"
      : failureCode
        ? "PARTIAL_FAILED"
        : fetchedPages === pageStarts.length
          ? maxPages === 1
            ? "OUT_OF_RANGE_70"
            : "OUT_OF_RANGE_280"
          : "PARTIAL_FAILED";
  const result: PcmapRestaurantListHtmlDiagnosticResult = {
    ok:
      resultStatus === "FOUND" ||
      resultStatus === "OUT_OF_RANGE_70" ||
      resultStatus === "OUT_OF_RANGE_280",
    status: lastStatus,
    contentType: lastContentType,
    htmlLength: totalHtmlLength,
    hasNcaptcha: lastPage?.hasNcaptcha ?? false,
    hasPlaceListBusinessesItem:
      lastPage?.hasPlaceListBusinessesItem ?? false,
    hasApolloState: lastPage?.hasApolloState ?? false,
    detectedStatePattern: lastPage?.detectedStatePattern ?? null,
    parsedCount: accumulated.length,
    places: accumulated,
    top10: accumulated.slice(0, 10),
    targetRank,
    debugReason: failureCode,
    resultStatus,
    failureCode,
    pageStarts,
    fetchedPages,
    checkedCount: accumulated.length,
    pages,
  };

  console.log("[pcmap restaurant/list HTML diagnostic]", {
    source: "pcmap-restaurant-html",
    pageStarts: result.pageStarts,
    fetchedPages: result.fetchedPages,
    parsedCount: result.parsedCount,
    checkedCount: result.checkedCount,
    top10: result.top10.map((place) => `${place.rank}위:${place.name}`),
    targetRank: result.targetRank,
    resultStatus: result.resultStatus,
    failureCode: result.failureCode,
  });
  return result;
}

async function fetchPcmapRestaurantListHtmlPage(params: {
  keyword: string;
  x: string;
  y: string;
  targetName?: string;
  start: number;
  display: number;
}): Promise<{
  status: number;
  contentType: string;
  htmlLength: number;
  parsed: ParsedHtmlPage;
  failureCode: string | null;
}> {
  const mapUrl = `https://map.naver.com/p/search/${encodeURIComponent(params.keyword)}`;
  const url = new URL(PCMAP_RESTAURANT_LIST_URL);
  url.search = new URLSearchParams({
    query: params.keyword,
    x: params.x,
    y: params.y,
    clientX: params.x,
    clientY: params.y,
    start: String(params.start),
    page: String(Math.floor((params.start - 1) / params.display) + 1),
    display: String(params.display),
    ts: String(Date.now()),
    additionalHeight: "76",
    locale: "ko",
    mapUrl,
  }).toString();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      referer: mapUrl,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const html = await response.text();
  const parsed = parsePcmapRestaurantListHtmlDiagnostic(
    html,
    params.targetName,
    params.start
  );
  const requestedStartApplied =
    params.start === 1 ||
    Boolean(
      parsed.detectedStatePattern?.includes(`\"start\":${params.start}`)
    );
  const failureCode =
    response.status !== 200
      ? `HTTP_${response.status}`
      : !contentType.toLowerCase().includes("text/html")
        ? "CONTENT_TYPE_NOT_HTML"
        : parsed.debugReason ??
          (requestedStartApplied ? null : "HTML_START_NOT_APPLIED");
  return {
    status: response.status,
    contentType,
    htmlLength: html.length,
    parsed,
    failureCode,
  };
}
