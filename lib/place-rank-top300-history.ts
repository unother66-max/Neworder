import { recentSeoulDateStrings } from "@/lib/seoul-calendar";

export const TOP300_COMPARISON_DAYS = [1, 2, 3, 5, 10, 15] as const;
export const TOP300_SNAPSHOT_RETENTION_DAYS = 20;

export type Top300ComparisonDays =
  (typeof TOP300_COMPARISON_DAYS)[number];

export type Top300ComparisonSnapshot = {
  daysAgo: Top300ComparisonDays;
  snapshotDate: string;
  rankedPlaceIds: string[];
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

type RankedPlaceRow = {
  rank: number;
  placeId: string;
};

type StoredSnapshotRow = {
  snapshotDate: string;
  rankedPlaceIds: unknown;
};

export function buildTop300SnapshotCalendar(
  reference = new Date()
): Top300SnapshotCalendar {
  const recentDates = recentSeoulDateStrings(
    TOP300_SNAPSHOT_RETENTION_DAYS + 1,
    reference
  );
  const todayIndex = recentDates.length - 1;
  const currentDate = recentDates[todayIndex];
  const retentionCutoffDate = recentDates[0];

  if (!currentDate || !retentionCutoffDate) {
    throw new Error("TOP300_SNAPSHOT_CALENDAR_UNAVAILABLE");
  }

  return {
    currentDate,
    comparisons: TOP300_COMPARISON_DAYS.map((daysAgo) => {
      const snapshotDate = recentDates[todayIndex - daysAgo];
      if (!snapshotDate) {
        throw new Error("TOP300_COMPARISON_DATE_UNAVAILABLE");
      }
      return { daysAgo, snapshotDate };
    }),
    retentionCutoffDate,
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

export function buildTop300RankHistory(
  calendar: Top300SnapshotCalendar,
  rows: readonly StoredSnapshotRow[]
): Top300RankHistory {
  const rowsByDate = new Map(
    rows.map((row) => [row.snapshotDate, row.rankedPlaceIds] as const)
  );
  const snapshots: Top300ComparisonSnapshot[] = [];

  for (const comparison of calendar.comparisons) {
    if (!rowsByDate.has(comparison.snapshotDate)) continue;
    const rankedPlaceIds = parseStoredPlaceIds(
      rowsByDate.get(comparison.snapshotDate)
    );
    if (!rankedPlaceIds) continue;
    snapshots.push({ ...comparison, rankedPlaceIds });
  }

  return { currentDate: calendar.currentDate, snapshots };
}

export function buildPreviousTop300RankMap(
  rankedPlaceIds: readonly string[]
): Map<string, number> {
  const ranks = new Map<string, number>();
  rankedPlaceIds.forEach((placeId, index) => {
    if (placeId && !ranks.has(placeId)) ranks.set(placeId, index + 1);
  });
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

export function getDefaultTop300ComparisonDays(
  snapshots: readonly Top300ComparisonSnapshot[]
): Top300ComparisonDays | null {
  return snapshots.some((snapshot) => snapshot.daysAgo === 1) ? 1 : null;
}
