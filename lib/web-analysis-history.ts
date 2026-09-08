import { seoulCalendarDateString } from "@/lib/seoul-calendar";

export const WEB_ANALYSIS_COMPARISON_DAYS = [1, 2, 3, 5, 10, 15] as const;

export type WebAnalysisComparisonDays =
  (typeof WEB_ANALYSIS_COMPARISON_DAYS)[number];

export type WebAnalysisComparisonSnapshot = {
  daysAgo: WebAnalysisComparisonDays;
  snapshotDate: string;
  rankedUrls: string[];
};

export type WebAnalysisRankHistory = {
  currentDate: string;
  snapshots: WebAnalysisComparisonSnapshot[];
};

export type WebAnalysisSnapshotCalendar = {
  currentDate: string;
  comparisons: Array<{
    daysAgo: WebAnalysisComparisonDays;
    snapshotDate: string;
  }>;
};

export type WebAnalysisRankMovement =
  | { kind: "up"; amount: number; previousRank: number }
  | { kind: "down"; amount: number; previousRank: number }
  | { kind: "same"; previousRank: number }
  | { kind: "new"; previousRank: null };

type RankedUrlRow = {
  collectedIndex: number;
  url: string;
};

type StoredSnapshotRow = {
  snapshotDate: string;
  rankedUrls: unknown;
};

type WebAnalysisDisplayRow = {
  domain: string;
  source: string;
};

function shiftIsoCalendarDate(iso: string, dayOffset: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return shifted.toISOString().slice(0, 10);
}

export function buildWebAnalysisSnapshotCalendar(
  reference = new Date()
): WebAnalysisSnapshotCalendar {
  const currentDate = seoulCalendarDateString(reference);

  return {
    currentDate,
    comparisons: WEB_ANALYSIS_COMPARISON_DAYS.map((daysAgo) => ({
      daysAgo,
      snapshotDate: shiftIsoCalendarDate(currentDate, -daysAgo),
    })),
  };
}

export function buildWebAnalysisSnapshotUrls(
  rows: readonly RankedUrlRow[]
): string[] {
  return [...rows]
    .sort((left, right) => left.collectedIndex - right.collectedIndex)
    .map((row) => row.url.trim())
    .filter(Boolean);
}

export function isNaverBlogOrCafeWebAnalysisResult(
  row: WebAnalysisDisplayRow
): boolean {
  const domain = row.domain.trim().toLowerCase();
  return (
    domain === "blog.naver.com" ||
    domain === "m.blog.naver.com" ||
    domain.endsWith(".blog.naver.com") ||
    domain === "cafe.naver.com" ||
    domain === "m.cafe.naver.com" ||
    domain.endsWith(".cafe.naver.com") ||
    row.source.trim() === "네이버 블로그" ||
    row.source.trim() === "네이버 카페"
  );
}

export function filterWebAnalysisDisplayResults<
  Row extends WebAnalysisDisplayRow,
>(rows: readonly Row[], excludeNaverBlogAndCafe: boolean): Row[] {
  return excludeNaverBlogAndCafe
    ? rows.filter((row) => !isNaverBlogOrCafeWebAnalysisResult(row))
    : [...rows];
}

function parseStoredUrls(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;

  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const url = item.trim();
    if (!url) return null;
    urls.push(url);
  }
  return urls;
}

export function buildWebAnalysisRankHistory(
  calendar: WebAnalysisSnapshotCalendar,
  rows: readonly StoredSnapshotRow[]
): WebAnalysisRankHistory {
  const rowsByDate = new Map(rows.map((row) => [row.snapshotDate, row] as const));
  const snapshots: WebAnalysisComparisonSnapshot[] = [];

  for (const comparison of calendar.comparisons) {
    const row = rowsByDate.get(comparison.snapshotDate);
    if (!row) continue;
    const rankedUrls = parseStoredUrls(row.rankedUrls);
    if (!rankedUrls) continue;
    snapshots.push({ ...comparison, rankedUrls });
  }

  return { currentDate: calendar.currentDate, snapshots };
}

export function buildPreviousWebAnalysisRankMap(
  rankedUrls: readonly string[]
): Map<string, number> {
  const ranks = new Map<string, number>();
  rankedUrls.forEach((url, index) => {
    const identity = url.trim();
    if (identity && !ranks.has(identity)) ranks.set(identity, index + 1);
  });
  return ranks;
}

export function getWebAnalysisRankMovement(
  currentRank: number,
  url: string,
  previousRanks: ReadonlyMap<string, number>
): WebAnalysisRankMovement {
  const previousRank = previousRanks.get(url.trim());
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

export function getWebAnalysisRankMovementLabel(
  movement: WebAnalysisRankMovement
): string {
  if (movement.kind === "up") return `▲${movement.amount}`;
  if (movement.kind === "down") return `▼${movement.amount}`;
  if (movement.kind === "new") return "NEW";
  return "=";
}

export function getDefaultWebAnalysisComparisonDays(
  snapshots: readonly WebAnalysisComparisonSnapshot[]
): WebAnalysisComparisonDays | null {
  return snapshots.some((snapshot) => snapshot.daysAgo === 1) ? 1 : null;
}
