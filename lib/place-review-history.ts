export type PlaceReviewHistorySnapshot = {
  trackedDate: string;
  totalReviewCount: number;
  visitorReviewCount: number;
  blogReviewCount: number;
  saveCount: string | null;
};

export type PlaceReviewDailyDiff = {
  comparedTrackedDate: string | null;
  totalReviewDiff: number | null;
  visitorReviewDiff: number | null;
  blogReviewDiff: number | null;
  saveCountDiff: number | null;
};

export function parsePlaceReviewCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!normalized || normalized === "-") return null;

  const matched = normalized.match(/^(-?\d+(?:\.\d+)?)(만|천)?\+?$/);
  if (!matched) return null;

  const numeric = Number(matched[1]);
  if (!Number.isFinite(numeric)) return null;
  const multiplier =
    matched[2] === "만" ? 10_000 : matched[2] === "천" ? 1_000 : 1;
  return Math.round(numeric * multiplier);
}

export function getPreviousTrackedDate(
  trackedDate: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trackedDate)) return null;
  const [year, month, day] = trackedDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function buildPlaceReviewDailyHistory<
  T extends PlaceReviewHistorySnapshot,
>(rows: readonly T[], limit = 30): Array<T & PlaceReviewDailyDiff> {
  const sorted = [...rows].sort((a, b) =>
    b.trackedDate.localeCompare(a.trackedDate)
  );
  const byTrackedDate = new Map(
    sorted.map((row) => [row.trackedDate, row] as const)
  );

  return sorted.slice(0, Math.max(0, limit)).map((row) => {
    const previousTrackedDate = getPreviousTrackedDate(row.trackedDate);
    const previous = previousTrackedDate
      ? byTrackedDate.get(previousTrackedDate)
      : undefined;
    const currentSaveCount = parsePlaceReviewCount(row.saveCount);
    const previousSaveCount = previous
      ? parsePlaceReviewCount(previous.saveCount)
      : null;

    return {
      ...row,
      comparedTrackedDate: previous ? previousTrackedDate : null,
      totalReviewDiff: previous
        ? row.totalReviewCount - previous.totalReviewCount
        : null,
      visitorReviewDiff: previous
        ? row.visitorReviewCount - previous.visitorReviewCount
        : null,
      blogReviewDiff: previous
        ? row.blogReviewCount - previous.blogReviewCount
        : null,
      saveCountDiff:
        currentSaveCount !== null && previousSaveCount !== null
          ? currentSaveCount - previousSaveCount
          : null,
    };
  });
}
