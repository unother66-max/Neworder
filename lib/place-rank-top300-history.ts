import { seoulCalendarDateString } from "@/lib/seoul-calendar";

export const TOP300_COMPARISON_DAYS = [1, 2, 3, 5, 10, 15] as const;
export const TOP300_SNAPSHOT_RETENTION_DAYS = 20;

export type Top300ComparisonDays =
  (typeof TOP300_COMPARISON_DAYS)[number];

export type Top300ComparisonSnapshot = {
  daysAgo: Top300ComparisonDays;
  snapshotDate: string;
  rankedPlaceIds: string[];
  rankOverrides?: Top300TrackedRankOverride[];
  metrics?: Top300SnapshotMetrics;
};

export type Top300TrackedRankOverride = [placeId: string, rank: number];

export type Top300TrackedRankRecord = {
  snapshotDate: string;
  placeId: string;
  rank: number;
  collectedAt: Date | string;
};

export type Top300SnapshotMetric = {
  placeId: string;
  rank: number;
  rating: number | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: number | null;
  saveCountIsApproximate: boolean | null;
};

/**
 * JSONB에서 필드명을 300번 반복하지 않도록 쓰는 compact tuple.
 * [placeId, rank, rating, visitorReviewCount, blogReviewCount, saveCount,
 *  saveCountIsApproximate]
 */
export type Top300SnapshotMetricTuple = [
  string,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  boolean | null,
];

export type Top300SnapshotMetrics = {
  version: 1;
  rows: Top300SnapshotMetricTuple[];
};

export type Top300RankHistory = {
  currentDate: string;
  snapshots: Top300ComparisonSnapshot[];
};

export type Top300SnapshotCalendar = {
  currentDate: string;
  comparisons: Array<{
    daysAgo: Top300ComparisonDays;
    snapshotDate: string;
  }>;
  retentionCutoffDate: string;
};

export type Top300RankMovement =
  | { kind: "up"; amount: number; previousRank: number }
  | { kind: "down"; amount: number; previousRank: number }
  | { kind: "same"; previousRank: number }
  | { kind: "new"; previousRank: null };

export type Top300MetricMovement =
  | { kind: "up"; amount: number | null }
  | { kind: "down"; amount: number | null }
  | { kind: "same"; amount: 0 }
  | { kind: "unavailable"; amount: null };

type RankedPlaceRow = {
  rank: number;
  placeId: string;
};

type SnapshotMetricSourceRow = RankedPlaceRow & {
  rating?: string | null;
  visitorReviewCount?: number | null;
  blogReviewCount?: number | null;
  saveCountValue?: number | null;
  saveCountIsApproximate?: boolean | null;
};

type StoredSnapshotRow = {
  snapshotDate: string;
  rankedPlaceIds: unknown;
  metrics?: unknown;
  updatedAt?: Date | string;
};

function shiftIsoCalendarDate(iso: string, dayOffset: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return shifted.toISOString().slice(0, 10);
}

export function buildTop300SnapshotCalendar(
  reference = new Date()
): Top300SnapshotCalendar {
  const currentDate = seoulCalendarDateString(reference);

  return {
    currentDate,
    comparisons: TOP300_COMPARISON_DAYS.map((daysAgo) => ({
      daysAgo,
      snapshotDate: shiftIsoCalendarDate(currentDate, -daysAgo),
    })),
    retentionCutoffDate: shiftIsoCalendarDate(
      currentDate,
      -TOP300_SNAPSHOT_RETENTION_DAYS
    ),
  };
}

export function buildTop300SnapshotPlaceIds(
  rows: readonly RankedPlaceRow[]
): string[] {
  return [...rows]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 300)
    .map((row) => row.placeId.trim())
    .filter(Boolean);
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function nullableCount(value: unknown): number | null | undefined {
  const parsed = nullableFiniteNumber(value);
  if (parsed === null) return null;
  if (parsed === undefined || parsed < 0 || !Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

export function buildTop300SnapshotMetrics(
  sourceRows: readonly SnapshotMetricSourceRow[]
): Top300SnapshotMetrics {
  const rows: Top300SnapshotMetricTuple[] = [...sourceRows]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 300)
    .flatMap((row) => {
      const placeId = row.placeId.trim();
      if (!placeId) return [];
      const parsedRating = Number(row.rating);
      const rating =
        row.rating !== null &&
        Number.isFinite(parsedRating) &&
        parsedRating > 0 &&
        parsedRating <= 5
          ? Math.round(parsedRating * 100) / 100
          : null;
      const visitorReviewCount = nullableCount(row.visitorReviewCount) ?? null;
      const blogReviewCount = nullableCount(row.blogReviewCount) ?? null;
      const saveCount = nullableCount(row.saveCountValue) ?? null;

      return [[
        placeId,
        row.rank,
        rating,
        visitorReviewCount,
        blogReviewCount,
        saveCount,
        saveCount === null ? null : row.saveCountIsApproximate === true,
      ]];
    });

  return { version: 1, rows };
}

function parseStoredPlaceIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 300) return null;

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const placeId = item.trim();
    if (!placeId) return null;
    ids.push(placeId);
  }
  return ids;
}

function parseStoredMetrics(value: unknown): Top300SnapshotMetrics | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== 1 ||
    !Array.isArray((value as { rows?: unknown }).rows)
  ) {
    return null;
  }

  const rawRows = (value as { rows: unknown[] }).rows;
  if (rawRows.length > 300) return null;
  const rows: Top300SnapshotMetricTuple[] = [];
  const placeIds = new Set<string>();

  for (const rawRow of rawRows) {
    if (!Array.isArray(rawRow) || rawRow.length !== 7) return null;
    const [rawPlaceId, rawRank, rawRating, rawVisitor, rawBlog, rawSave, rawApproximate] =
      rawRow;
    const placeId = typeof rawPlaceId === "string" ? rawPlaceId.trim() : "";
    const rank = nullableCount(rawRank);
    const rating = nullableFiniteNumber(rawRating);
    const visitorReviewCount = nullableCount(rawVisitor);
    const blogReviewCount = nullableCount(rawBlog);
    const saveCount = nullableCount(rawSave);

    if (
      !placeId ||
      placeIds.has(placeId) ||
      rank === null ||
      rank === undefined ||
      rank < 1 ||
      rank > 300 ||
      rating === undefined ||
      (rating !== null && (rating <= 0 || rating > 5)) ||
      visitorReviewCount === undefined ||
      blogReviewCount === undefined ||
      saveCount === undefined ||
      (rawApproximate !== null && typeof rawApproximate !== "boolean") ||
      (saveCount === null && rawApproximate !== null)
    ) {
      return null;
    }

    placeIds.add(placeId);
    rows.push([
      placeId,
      rank,
      rating,
      visitorReviewCount,
      blogReviewCount,
      saveCount,
      rawApproximate,
    ]);
  }

  return { version: 1, rows };
}

export function buildTop300RankHistory(
  calendar: Top300SnapshotCalendar,
  rows: readonly StoredSnapshotRow[],
  trackedRankRecords: readonly Top300TrackedRankRecord[] = []
): Top300RankHistory {
  const rowsByDate = new Map(rows.map((row) => [row.snapshotDate, row] as const));
  const trackedRanksByDate = new Map<
    string,
    Map<string, Top300TrackedRankRecord>
  >();

  for (const record of trackedRankRecords) {
    const placeId = record.placeId.trim();
    const collectedAt = new Date(record.collectedAt).getTime();
    if (
      !placeId ||
      !Number.isSafeInteger(record.rank) ||
      record.rank <= 0 ||
      !Number.isFinite(collectedAt)
    ) {
      continue;
    }

    const ranksForDate =
      trackedRanksByDate.get(record.snapshotDate) ??
      new Map<string, Top300TrackedRankRecord>();
    const previous = ranksForDate.get(placeId);
    if (
      !previous ||
      collectedAt > new Date(previous.collectedAt).getTime()
    ) {
      ranksForDate.set(placeId, { ...record, placeId });
    }
    trackedRanksByDate.set(record.snapshotDate, ranksForDate);
  }

  const snapshots: Top300ComparisonSnapshot[] = [];

  for (const comparison of calendar.comparisons) {
    const storedRow = rowsByDate.get(comparison.snapshotDate);
    const rankedPlaceIds = storedRow
      ? parseStoredPlaceIds(storedRow.rankedPlaceIds)
      : null;
    const top300CollectedAt = storedRow?.updatedAt
      ? new Date(storedRow.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    const rankOverrides: Top300TrackedRankOverride[] = [];

    for (const record of
      trackedRanksByDate.get(comparison.snapshotDate)?.values() ?? []) {
      if (new Date(record.collectedAt).getTime() > top300CollectedAt) {
        rankOverrides.push([record.placeId, record.rank]);
      }
    }

    rankOverrides.sort(([left], [right]) => left.localeCompare(right));
    if (!rankedPlaceIds && rankOverrides.length === 0) continue;
    const metrics = parseStoredMetrics(storedRow?.metrics);
    snapshots.push({
      ...comparison,
      rankedPlaceIds: rankedPlaceIds ?? [],
      ...(rankOverrides.length > 0 ? { rankOverrides } : null),
      ...(metrics ? { metrics } : null),
    });
  }

  return { currentDate: calendar.currentDate, snapshots };
}

export function buildPreviousTop300MetricMap(
  metrics: Top300SnapshotMetrics | undefined
): Map<string, Top300SnapshotMetric> {
  const result = new Map<string, Top300SnapshotMetric>();
  for (const [
    placeId,
    rank,
    rating,
    visitorReviewCount,
    blogReviewCount,
    saveCount,
    saveCountIsApproximate,
  ] of metrics?.rows ?? []) {
    result.set(placeId, {
      placeId,
      rank,
      rating,
      visitorReviewCount,
      blogReviewCount,
      saveCount,
      saveCountIsApproximate,
    });
  }
  return result;
}

export function buildPreviousTop300RankMap(
  rankedPlaceIds: readonly string[],
  rankOverrides: readonly Top300TrackedRankOverride[] = []
): Map<string, number> {
  // 모든 snapshot placeId를 기본값으로 유지하고, 실제 추적 기록이 있는
  // placeId만 더 늦게 수집된 PC 순위로 개별 덮어쓴다.
  const ranks = new Map<string, number>();
  rankedPlaceIds.forEach((placeId, index) => {
    if (placeId && !ranks.has(placeId)) ranks.set(placeId, index + 1);
  });
  for (const [placeId, rank] of rankOverrides) {
    if (placeId && Number.isSafeInteger(rank) && rank > 0) {
      ranks.set(placeId, rank);
    }
  }
  return ranks;
}

export function getTop300RankMovement(
  currentRank: number,
  placeId: string,
  previousRanks: ReadonlyMap<string, number>
): Top300RankMovement {
  const previousRank = previousRanks.get(placeId);
  if (previousRank === undefined) {
    return { kind: "new", previousRank: null };
  }

  const amount = previousRank - currentRank;
  if (amount > 0) return { kind: "up", amount, previousRank };
  if (amount < 0) {
    return { kind: "down", amount: Math.abs(amount), previousRank };
  }
  return { kind: "same", previousRank };
}

export function getTop300RankMovementLabel(
  movement: Top300RankMovement
): string {
  if (movement.kind === "up") return `▲${movement.amount}`;
  if (movement.kind === "down") return `▼${movement.amount}`;
  if (movement.kind === "new") return "NEW";
  return "=";
}

function roundedDelta(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function getTop300MetricMovement(
  previousValue: number | null | undefined,
  currentValue: number | null | undefined,
  fractionDigits = 0
): Top300MetricMovement {
  if (
    typeof previousValue !== "number" ||
    !Number.isFinite(previousValue) ||
    typeof currentValue !== "number" ||
    !Number.isFinite(currentValue)
  ) {
    return { kind: "unavailable", amount: null };
  }

  const difference = roundedDelta(
    currentValue - previousValue,
    fractionDigits
  );
  if (difference > 0) return { kind: "up", amount: difference };
  if (difference < 0) {
    return { kind: "down", amount: Math.abs(difference) };
  }
  return { kind: "same", amount: 0 };
}

export function getTop300SaveCountMovement(
  previousValue: number | null | undefined,
  currentValue: number | null | undefined,
  previousIsApproximate: boolean | null | undefined,
  currentIsApproximate: boolean | null | undefined
): Top300MetricMovement {
  const movement = getTop300MetricMovement(previousValue, currentValue);
  if (movement.kind === "unavailable" || movement.kind === "same") {
    return movement;
  }

  if (previousIsApproximate === true && currentIsApproximate === true) {
    return { ...movement, amount: null };
  }
  if (previousIsApproximate === true || currentIsApproximate === true) {
    return { kind: "unavailable", amount: null };
  }
  return movement;
}

export function getTop300MetricMovementLabel(
  movement: Top300MetricMovement,
  fractionDigits = 0
): string {
  if (movement.kind === "same" || movement.kind === "unavailable") return "-";
  const arrow = movement.kind === "up" ? "▲" : "▼";
  if (movement.amount === null) return arrow;
  return `${arrow}${movement.amount.toLocaleString("ko-KR", {
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function getDefaultTop300ComparisonDays(
  snapshots: readonly Top300ComparisonSnapshot[]
): Top300ComparisonDays | null {
  return snapshots.some((snapshot) => snapshot.daysAgo === 1) ? 1 : null;
}
