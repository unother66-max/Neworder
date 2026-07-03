import {
  NAVER_PCMAP_GRAPHQL_URL,
  buildGetPlacesListFetchHeaders,
  buildGetPlacesListFetchHeadersForServer,
  buildGetPlacesListPagedBatch,
  resolveBusinessesCoords,
} from "@/lib/naver-map-businesses-shared";
import {
  buildLocationFallbackSearchKeyword,
  countBusinessesItemsInBatch,
} from "@/lib/place-keyword-fallback";
import { isIntentMixedKeyword } from "@/lib/check-place-rank-intent";

const PCMAP_REQUEST_GAP_MS = 900;

declare global {
  var __pcmapRankFetchTail: Promise<void> | undefined;
  var __pcmapRankLastFinishedAt: number | undefined;
}

export class PcmapBusinessesBlockedError extends Error {
  readonly code = "PCMAP_HTTP_405" as const;

  constructor() {
    super("네이버 pcmap이 HTTP 405로 요청을 거부했습니다.");
    this.name = "PcmapBusinessesBlockedError";
  }
}

class PcmapHttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`pcmap HTTP ${status}`);
  }
}

async function runSerializedPcmapFetch<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalThis.__pcmapRankFetchTail ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  globalThis.__pcmapRankFetchTail = tail;

  await previous;
  try {
    const elapsed = Date.now() - (globalThis.__pcmapRankLastFinishedAt ?? 0);
    if (elapsed < PCMAP_REQUEST_GAP_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, PCMAP_REQUEST_GAP_MS - elapsed)
      );
    }
    return await task();
  } finally {
    globalThis.__pcmapRankLastFinishedAt = Date.now();
    release();
    void tail.finally(() => {
      if (globalThis.__pcmapRankFetchTail === tail) {
        globalThis.__pcmapRankFetchTail = undefined;
      }
    });
  }
}

function parseBatchedGraphqlBody(raw: string): unknown[] | null {
  const t = String(raw || "").trimStart();
  if (!t || t.startsWith("<")) return null;
  try {
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

function getPlacesItemsFromBatchPart(part: unknown): unknown[] {
  const data = (part as { data?: { places?: { items?: unknown[] } } })?.data;
  const items = data?.places?.items;
  return Array.isArray(items) ? items : [];
}

function logPcmapBatchPages(keyword: string, batch: unknown[] | null) {
  if (!Array.isArray(batch)) {
    console.warn("[pcmap batch pages] batch 없음", { keyword });
    return;
  }

  batch.forEach((part, index) => {
    const items = getPlacesItemsFromBatchPart(part);
    const first = items[0] as { name?: unknown } | undefined;

    console.log("[pcmap page result]", {
      keyword,
      pageIndex: index,
      expectedStart: 1 + index * 30,
      count: items.length,
      first: first?.name ? String(first.name) : null,
    });
  });
}

function hasValidFirstPage(batch: unknown[] | null): boolean {
  if (!Array.isArray(batch) || batch.length === 0) return false;
  const firstPageItems = getPlacesItemsFromBatchPart(batch[0]);
  return firstPageItems.length > 0;
}

type FetchSinglePageResult =
  | { kind: "success"; part: unknown; count: number }
  | { kind: "end"; count: 0 }
  | { kind: "failed" };

function normalizeForPcmapTarget(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

function hasExactTargetInItems(
  items: unknown[],
  normalizedTargetName: string
): boolean {
  if (!normalizedTargetName) return false;
  return items.some((item) => {
    const name =
      item && typeof item === "object" && "name" in item
        ? (item as { name?: unknown }).name
        : "";
    return normalizeForPcmapTarget(name) === normalizedTargetName;
  });
}

async function fetchRawBatchOnce(
  keyword: string,
  coordAnchorKeyword?: string,
  opts?: { mapReferer?: boolean; pages?: number; targetName?: string }
): Promise<unknown[] | null> {
  const q = String(keyword ?? "").trim();
  if (!q) return null;
  const normalizedTargetName = normalizeForPcmapTarget(opts?.targetName);

  const anchor =
    coordAnchorKeyword == null
      ? undefined
      : String(coordAnchorKeyword).trim() || undefined;

  const coords = resolveBusinessesCoords(q, anchor);

  if (isIntentMixedKeyword(q)) {
    console.log("[pcmap batch] 추천형 좌표(resolve 그대로)", {
      keyword: q,
      x: coords.x,
      y: coords.y,
    });
  }

  const pageCount = opts?.mapReferer ? 1 : Math.max(1, opts?.pages ?? 10);
  const headers = opts?.mapReferer
  ? buildGetPlacesListFetchHeaders(q)
  : buildGetPlacesListFetchHeadersForServer(q, coords);

  const finalBatch: unknown[] = [];
  const maxRetryForRetryableErrors = 5;

  const fetchSinglePage = async (
    pageIndex: number,
    start: number
  ): Promise<FetchSinglePageResult> => {
    for (let attempt = 1; attempt <= maxRetryForRetryableErrors; attempt++) {
      try {
        const batchBody = buildGetPlacesListPagedBatch(q, coords, 1, 30);
        const placesPayload = batchBody[0] as {
          variables?: { placesInput?: { start?: number } };
        };
        if (placesPayload?.variables?.placesInput) {
          placesPayload.variables.placesInput.start = start;
        }

        const res = await fetch(NAVER_PCMAP_GRAPHQL_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(batchBody),
          cache: "no-store",
        });

        const isRetryableHttpError =
          res.status === 429 || (res.status >= 500 && res.status <= 599);

        if (isRetryableHttpError) {
          console.warn("[pcmap single page retryable status]", {
            keyword: q,
            pageIndex,
            start,
            attempt,
            status: res.status,
          });
          if (attempt < maxRetryForRetryableErrors) {
            await new Promise((r) => setTimeout(r, 700 * attempt));
            continue;
          }
          return { kind: "failed" };
        }

        if (!res.ok) {
          console.warn("[pcmap single page non-retryable status]", {
            keyword: q,
            pageIndex,
            start,
            attempt,
            status: res.status,
          });
          if (res.status === 405) throw new PcmapHttpStatusError(405);
          return { kind: "failed" };
        }

        const raw = await res.text();
        const batch = parseBatchedGraphqlBody(raw);
        const part = Array.isArray(batch) ? batch[0] : null;
        if (!part) {
          console.warn("[pcmap single page invalid payload]", {
            keyword: q,
            pageIndex,
            start,
            attempt,
          });
          return { kind: "failed" };
        }
        const items = getPlacesItemsFromBatchPart(part);
        const first = items[0] as { name?: unknown } | undefined;

        console.log("[pcmap single page result]", {
          keyword: q,
          pageIndex,
          start,
          attempt,
          count: items.length,
          first: first?.name ? String(first.name) : null,
        });

        if (items.length === 0) {
          // 정상 응답에서 0건이면 마지막 페이지로 간주하고 즉시 종료한다.
          return { kind: "end", count: 0 };
        }

        return { kind: "success", part, count: items.length };
      } catch (error) {
        if (error instanceof PcmapHttpStatusError) throw error;
        console.warn("[pcmap single page network error]", {
          keyword: q,
          pageIndex,
          start,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < maxRetryForRetryableErrors) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
          continue;
        }
        return { kind: "failed" };
      }
    }

    return { kind: "failed" };
  };

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const start = 1 + pageIndex * 30;
    const pageResult = await fetchSinglePage(pageIndex, start);

    if (pageResult.kind === "success") {
      finalBatch.push(pageResult.part);

      const items = getPlacesItemsFromBatchPart(pageResult.part);
      if (hasExactTargetInItems(items, normalizedTargetName)) {
        console.log(
          "[pcmap single page] target found → remaining pages skipped",
          {
            keyword: q,
            targetName: opts?.targetName ?? null,
            pageIndex,
            start,
            fetchedPages: finalBatch.length,
            skippedPages: Math.max(0, pageCount - (pageIndex + 1)),
          }
        );
        break;
      }

      await new Promise((r) => setTimeout(r, 250));
      continue;
    }

    if (pageResult.kind === "end") {
      console.log("[pcmap single page] 마지막 페이지 도달 → 이후 페이지 중단", {
        keyword: q,
        pageIndex,
        start,
      });
      break;
    }

    if (pageIndex === 0) {
      console.warn("[pcmap single page] 첫 페이지 실패 → 전체 폐기", {
        keyword: q,
      });
      return null;
    }

    console.warn("[pcmap single page] 페이지 실패 → 이후 페이지 중단", {
      keyword: q,
      pageIndex,
      start,
    });
    break;
  }

  return finalBatch.length > 0 ? finalBatch : null;
}

/**
 * place-rank-analyze `fetchPlacesListBusinesses`와 동일한 폴백 순서로
 * businesses GraphQL 배치(JSON 배열)를 가져온다.
 */
async function fetchBestPcmapBusinessesBatchJsonUnserialized(
  originalKeyword: string,
  targetName?: string
): Promise<{ batch: unknown[] | null; mode: string }> {
  const okKeyword = String(originalKeyword ?? "").trim();
  if (!okKeyword) return { batch: null, mode: "empty" };

  const fallback = buildLocationFallbackSearchKeyword(okKeyword);

  let http405Count = 0;
  const attempt = async (
    opts: Parameters<typeof fetchRawBatchOnce>[2]
  ): Promise<unknown[] | null> => {
    try {
      return await fetchRawBatchOnce(okKeyword, undefined, opts);
    } catch (error) {
      if (error instanceof PcmapHttpStatusError && error.status === 405) {
        http405Count += 1;
        return null;
      }
      throw error;
    }
  };

  if (fallback) {
    const b0 = await attempt({ targetName });
    if (b0 && countBusinessesItemsInBatch(b0) > 0) {
      return { batch: b0, mode: "original" };
    }
    await new Promise((r) => setTimeout(r, 350));
    // 순위추적에서는 원래 키워드를 바꾸면 순위가 달라지므로 fallback+anchor는 사용하지 않음
    await new Promise((r) => setTimeout(r, 420));
    const m0 = await attempt({
      mapReferer: true,
      targetName,
    });
    if (m0 && countBusinessesItemsInBatch(m0) > 0) {
      return { batch: m0, mode: "original+mapReferer" };
    }
   // 순위추적에서는 원래 키워드를 바꾸면 순위가 달라지므로 fallback+anchor+mapReferer는 사용하지 않음
    if (http405Count > 0) throw new PcmapBusinessesBlockedError();
    return { batch: null, mode: "empty" };
  }

  const b = await attempt({ targetName });
  if (b && countBusinessesItemsInBatch(b) > 0) {
    return { batch: b, mode: "single" };
  }
  await new Promise((r) => setTimeout(r, 420));
  const m = await attempt({
    mapReferer: true,
    targetName,
  });
  if (m && countBusinessesItemsInBatch(m) > 0) {
    return { batch: m, mode: "single+mapReferer" };
  }
  if (http405Count > 0) throw new PcmapBusinessesBlockedError();
  return { batch: null, mode: "empty" };
}

export async function fetchBestPcmapBusinessesBatchJson(
  originalKeyword: string,
  targetName?: string
): Promise<{ batch: unknown[] | null; mode: string }> {
  return runSerializedPcmapFetch(() =>
    fetchBestPcmapBusinessesBatchJsonUnserialized(originalKeyword, targetName)
  );
}
