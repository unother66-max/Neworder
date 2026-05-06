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

async function fetchRawBatchOnce(
  keyword: string,
  coordAnchorKeyword?: string,
  opts?: { mapReferer?: boolean; pages?: number }
): Promise<unknown[] | null> {
  const q = String(keyword ?? "").trim();
  if (!q) return null;

  const anchor =
    coordAnchorKeyword == null
      ? undefined
      : String(coordAnchorKeyword).trim() || undefined;

  const coords = resolveBusinessesCoords(q, anchor);
  const pageCount = opts?.mapReferer ? 1 : Math.max(1, opts?.pages ?? 10);
  const headers = opts?.mapReferer
    ? buildGetPlacesListFetchHeaders(q)
    : buildGetPlacesListFetchHeadersForServer(q, coords);

  const finalBatch: unknown[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const start = 1 + pageIndex * 30;
    let successPart: unknown | null = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const batchBody = buildGetPlacesListPagedBatch(q, coords, 1, 30);

      const placesPayload = batchBody[0] as any;
      if (placesPayload?.variables?.placesInput) {
        placesPayload.variables.placesInput.start = start;
      }

      const res = await fetch(NAVER_PCMAP_GRAPHQL_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batchBody),
        cache: "no-store",
      });

      const raw = await res.text();
      const batch = parseBatchedGraphqlBody(raw);
      const part = Array.isArray(batch) ? batch[0] : null;
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

      if (items.length > 0) {
        successPart = part;
        break;
      }

      await new Promise((r) => setTimeout(r, 700 * attempt));
    }

    if (pageIndex === 0 && !successPart) {
      console.warn("[pcmap single page] 첫 페이지 실패 → 전체 폐기", {
        keyword: q,
      });
      return null;
    }

    if (successPart) {
      finalBatch.push(successPart);
    } else {
      console.warn("[pcmap single page] 중간 페이지 실패 → 해당 페이지만 스킵", {
        keyword: q,
        pageIndex,
        start,
      });
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  return finalBatch.length > 0 ? finalBatch : null;
}

/**
 * place-rank-analyze `fetchPlacesListBusinesses`와 동일한 폴백 순서로
 * businesses GraphQL 배치(JSON 배열)를 가져온다.
 */
export async function fetchBestPcmapBusinessesBatchJson(
  originalKeyword: string
): Promise<{ batch: unknown[] | null; mode: string }> {
  const okKeyword = String(originalKeyword ?? "").trim();
  if (!okKeyword) return { batch: null, mode: "empty" };

  const fallback = buildLocationFallbackSearchKeyword(okKeyword);

  if (fallback) {
    const b0 = await fetchRawBatchOnce(okKeyword);
    if (b0 && countBusinessesItemsInBatch(b0) > 0) {
      return { batch: b0, mode: "original" };
    }
    await new Promise((r) => setTimeout(r, 350));
    // 순위추적에서는 원래 키워드를 바꾸면 순위가 달라지므로 fallback+anchor는 사용하지 않음
    await new Promise((r) => setTimeout(r, 420));
    const m0 = await fetchRawBatchOnce(okKeyword, undefined, {
      mapReferer: true,
    });
    if (m0 && countBusinessesItemsInBatch(m0) > 0) {
      return { batch: m0, mode: "original+mapReferer" };
    }
   // 순위추적에서는 원래 키워드를 바꾸면 순위가 달라지므로 fallback+anchor+mapReferer는 사용하지 않음
    return { batch: null, mode: "empty" };
  }

  const b = await fetchRawBatchOnce(okKeyword);
  if (b && countBusinessesItemsInBatch(b) > 0) {
    return { batch: b, mode: "single" };
  }
  await new Promise((r) => setTimeout(r, 420));
  const m = await fetchRawBatchOnce(okKeyword, undefined, {
    mapReferer: true,
  });
  if (m && countBusinessesItemsInBatch(m) > 0) {
    return { batch: m, mode: "single+mapReferer" };
  }
  return { batch: null, mode: "empty" };
}
