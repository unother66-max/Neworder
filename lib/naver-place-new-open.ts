export type NaverPlaceNewOpen = {
  isNewOpen: boolean | null;
  newOpenLabel: "새로오픈" | null;
};

/** 새로오픈 필드를 포함하는 place-analysis pcmap batch 계약 버전. */
export const PLACE_ANALYSIS_BATCH_SCHEMA_VERSION = 2;

function organicItemsFromBatchPart(part: unknown): unknown[] {
  if (!part || typeof part !== "object") return [];
  const data = (part as { data?: Record<string, unknown> }).data;
  if (!data || typeof data !== "object") return [];

  const places = data.places as
    | {
        items?: unknown[];
        businesses?: { items?: unknown[] };
      }
    | undefined;
  const placeList = data.placeList as
    | { businesses?: { items?: unknown[] } }
    | undefined;
  const restaurants = data.restaurants as
    | { businesses?: { items?: unknown[] } }
    | undefined;
  const businesses = data.businesses as { items?: unknown[] } | undefined;

  const items =
    places?.businesses?.items ??
    placeList?.businesses?.items ??
    restaurants?.businesses?.items ??
    places?.items ??
    businesses?.items;
  return Array.isArray(items) ? items : [];
}

/** 필드가 null이어도 selection이 적용된 최신 batch로 본다. */
export function pcmapBatchHasNewOpeningField(batch: unknown): boolean {
  if (!Array.isArray(batch)) return false;
  return batch.some((part) =>
    organicItemsFromBatchPart(part).some(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        Object.prototype.hasOwnProperty.call(item, "newOpening")
    )
  );
}

/**
 * pcmap `PlaceListBusinessesItem.newOpening`을 화면/API용 3상태로 변환한다.
 * 필드가 없거나 null인 응답(구버전 캐시·미지원 source)은 추정하지 않는다.
 */
export function parseNaverPlaceNewOpen(value: unknown): NaverPlaceNewOpen {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { isNewOpen: null, newOpenLabel: null };
  }

  const item = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(item, "newOpening")) {
    return { isNewOpen: null, newOpenLabel: null };
  }

  if (item.newOpening === true) {
    return { isNewOpen: true, newOpenLabel: "새로오픈" };
  }
  if (item.newOpening === false) {
    return { isNewOpen: false, newOpenLabel: null };
  }

  return { isNewOpen: null, newOpenLabel: null };
}

export function filterNewOpenPlaces<
  T extends { isNewOpen?: boolean | null },
>(items: readonly T[], onlyNewOpen: boolean): T[] {
  return onlyNewOpen
    ? items.filter((item) => item.isNewOpen === true)
    : [...items];
}

export function getNewOpenBadgeLabel(item: {
  isNewOpen?: boolean | null;
  newOpenLabel?: string | null;
}): string | null {
  if (item.isNewOpen !== true) return null;
  return String(item.newOpenLabel ?? "").trim() || "새로오픈";
}
