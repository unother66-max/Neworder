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

async function fetchRawBatchOnce(
  keyword: string,
  coordAnchorKeyword?: string,
  opts?: { mapReferer?: boolean; pages?: number }
): Promise<unknown[] | null> {
  const coords = resolveBusinessesCoords(keyword, coordAnchorKeyword);
  // place 순위조회: 최대 280위까지 확보 (display=30 기준 10페이지=300)
  const pages = opts?.mapReferer ? 1 : Math.max(1, opts?.pages ?? 10);
  const batchBody = buildGetPlacesListPagedBatch(keyword, coords, pages);
  const headers = opts?.mapReferer
    ? buildGetPlacesListFetchHeaders(keyword)
    : buildGetPlacesListFetchHeadersForServer(keyword, coords);
  const res = await fetch(NAVER_PCMAP_GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(batchBody),
    cache: "no-store",
  });
  const raw = await res.text();
  return parseBatchedGraphqlBody(raw);
}

/**
 * place-rank-analyze `fetchPlacesListBusinesses`와 동일한 폴백 순서로
 * businesses GraphQL 배치(JSON 배열)를 가져온다.
 */
export async function fetchBestPcmapBusinessesBatchJson(
  originalKeyword: string
): Promise<{ batch: unknown[] | null; mode: string }> {
  const fallback = buildLocationFallbackSearchKeyword(originalKeyword);

  if (fallback) {
    const b0 = await fetchRawBatchOnce(originalKeyword);
    if (b0 && countBusinessesItemsInBatch(b0) > 0) {
      return { batch: b0, mode: "original" };
    }
    await new Promise((r) => setTimeout(r, 350));
    const b1 = await fetchRawBatchOnce(fallback, originalKeyword);
    if (b1 && countBusinessesItemsInBatch(b1) > 0) {
      return { batch: b1, mode: "fallback+anchor" };
    }
    await new Promise((r) => setTimeout(r, 420));
    const m0 = await fetchRawBatchOnce(originalKeyword, undefined, {
      mapReferer: true,
    });
    if (m0 && countBusinessesItemsInBatch(m0) > 0) {
      return { batch: m0, mode: "original+mapReferer" };
    }
    const m1 = await fetchRawBatchOnce(fallback, originalKeyword, {
      mapReferer: true,
    });
    if (m1 && countBusinessesItemsInBatch(m1) > 0) {
      return { batch: m1, mode: "fallback+anchor+mapReferer" };
    }
    return { batch: null, mode: "empty" };
  }

  const b = await fetchRawBatchOnce(originalKeyword);
  if (b && countBusinessesItemsInBatch(b) > 0) {
    return { batch: b, mode: "single" };
  }
  await new Promise((r) => setTimeout(r, 420));
  const m = await fetchRawBatchOnce(originalKeyword, undefined, {
    mapReferer: true,
  });
  if (m && countBusinessesItemsInBatch(m) > 0) {
    return { batch: m, mode: "single+mapReferer" };
  }
  return { batch: null, mode: "empty" };
}
