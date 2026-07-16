/**
 * map.naver.com → pcmap-api.place.naver.com GraphQL 배치 응답 병합.
 * @see DevTools Network graphql — businesses(오가닉) + adBusinesses(광고)
 */

export function parseNaverReviewCountField(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v))
    return Math.max(0, Math.floor(v));
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function parseNullableNaverReviewCountField(
  value: unknown
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;

  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

/** GraphQL errors[].message — string일 때만 trim 등 문자열 연산 (내부 charAt 등 안전) */
function toTrimmedGraphqlErrorMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function collectBatchErrors(batch: unknown[]): string[] {
  const out: string[] = [];
  for (const item of batch) {
    if (item == null || typeof item !== "object") continue;

    const rawErrors = (item as { errors?: unknown }).errors;
    if (rawErrors === undefined || rawErrors === null) continue;

    if (!Array.isArray(rawErrors)) {
      console.log("[mergePcmapGraphqlBatch] invalid error item", item);
      continue;
    }

    for (const err of rawErrors) {
      if (err == null || typeof err !== "object") {
        console.log("[mergePcmapGraphqlBatch] invalid error item", item);
        continue;
      }

      const msgRaw = (err as { message?: unknown }).message;
      if (typeof msgRaw !== "string") {
        console.log("[mergePcmapGraphqlBatch] invalid error item", item);
        continue;
      }

      const msg = toTrimmedGraphqlErrorMessage(msgRaw);
      if (!msg) continue;
      out.push(msg);
    }
  }
  return out;
}

/** map.naver 왼쪽 목록은 DevTools 기준 `places` 우선 — 없을 때만 `businesses` */
function pickOrganicRoot(data: Record<string, unknown>): {
  total?: number;
  items?: unknown[];
} | null {
  const placesContainer = data.places as
    | {
        total?: number;
        items?: unknown[];
        businesses?: { total?: number; items?: unknown[] };
      }
    | undefined;
  const placeListContainer = data.placeList as
    | { businesses?: { total?: number; items?: unknown[] } }
    | undefined;
  const restaurantsContainer = data.restaurants as
    | { businesses?: { total?: number; items?: unknown[] } }
    | undefined;
  const places =
    placesContainer?.businesses ??
    placeListContainer?.businesses ??
    restaurantsContainer?.businesses ??
    placesContainer;
  const businesses = data.businesses as
    | { total?: number; items?: unknown[] }
    | undefined;
  const placesCount = Array.isArray(places?.items) ? places.items.length : 0;
  const businessesCount = Array.isArray(businesses?.items)
    ? businesses.items.length
    : 0;

  if (placesCount > 0) return places!;
  if (businessesCount > 0) return businesses!;
  if (places && Array.isArray(places.items)) return places;
  if (businesses && Array.isArray(businesses.items)) return businesses;
  return null;
}

export type MergePcmapBatchResult = {
  items: unknown[];
  total: number;
  graphqlErrors: string[];
};

/**
 * 광고(adBusinesses)를 모은 뒤 오가닉(places·businesses)을 이어 붙임.
 * 동일 place id가 양쪽에 있으면 광고 행만 유지(오가닉에서 제거).
 */
export function mergePcmapGraphqlBatch(batch: unknown): MergePcmapBatchResult {
  if (!Array.isArray(batch) || batch.length === 0) {
    return { items: [], total: 0, graphqlErrors: [] };
  }

  const gqlErrors = collectBatchErrors(batch);
  const adItems: unknown[] = [];
  const organicChunks: unknown[] = [];
  let organicTotal = 0;
  let adTotal = 0;
  const adSeenIds = new Set<string>();

  for (const part of batch) {
    const data = (part as { data?: Record<string, unknown> })?.data;
    if (!data || typeof data !== "object") continue;

    const adRoot = data.adBusinesses as
      | { total?: number; items?: unknown[] }
      | undefined;
    if (adRoot && typeof adRoot === "object" && Array.isArray(adRoot.items)) {
      adTotal = Math.max(adTotal, Number(adRoot.total || 0));
      for (const it of adRoot.items) {
        const row = it as { id?: string; adId?: string };
        const id = String(row?.id ?? "").trim();
        if (!id || adSeenIds.has(id)) continue;
        adSeenIds.add(id);
        adItems.push({
          ...(it as Record<string, unknown>),
          isPromotedAd: true,
          adId: String(row?.adId ?? "").trim() || undefined,
        });
      }
    }

    const organicRoot = pickOrganicRoot(data);
    if (organicRoot && Array.isArray(organicRoot.items)) {
      organicTotal = Math.max(organicTotal, Number(organicRoot.total || 0));
      for (const it of organicRoot.items) {
        organicChunks.push(it);
      }
    }
  }

  const organicSeen = new Set<string>();
  const organicDeduped: unknown[] = [];
  for (const it of organicChunks) {
    const row = it as { id?: string };
    const id = String(row?.id ?? "").trim();
    if (id) {
      if (organicSeen.has(id)) continue;
      organicSeen.add(id);
    }
    organicDeduped.push(it);
  }

  const organicFiltered = organicDeduped.filter((it) => {
    const row = it as { id?: string };
    const id = String(row?.id ?? "").trim();
    return !id || !adSeenIds.has(id);
  });

  const items = [...adItems, ...organicFiltered];
  // 광고 total은 검색 전체 건수가 아니라 광고 인벤토리/전국 값일 수 있다.
  // 오가닉 목록이 있으면 해당 쿼리의 오가닉 total만 신뢰한다.
  const total =
    organicTotal > 0
      ? Math.max(organicTotal, organicFiltered.length)
      : Math.max(adTotal, items.length);

  const graphqlErrors = gqlErrors.filter(
    (m) => typeof m === "string" && toTrimmedGraphqlErrorMessage(m).length > 0
  );

  return { items, total, graphqlErrors };
}
