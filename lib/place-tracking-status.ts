import { utcRangeSeoulCalendarDay } from "@/lib/seoul-calendar";

type TrackingKeyword = {
  keyword: string;
  isTracking: boolean;
};

type RankHistoryLike = {
  keyword: string;
  createdAt: string | Date;
};

export type PlaceTrackingUpdateStatus =
  | "OFF"
  | "PENDING"
  | "PARTIAL"
  | "COMPLETE";

export type PlaceTrackingMode = "OFF" | "MIXED" | "ON";

export function summarizePlaceRankTracking(params: {
  keywords: readonly TrackingKeyword[];
  histories: readonly RankHistoryLike[];
  reference?: Date;
}): {
  trackingKeywordCount: number;
  todayTrackingSuccessCount: number;
  trackingUpdateStatus: PlaceTrackingUpdateStatus;
  trackingMode: PlaceTrackingMode;
  latestSuccessAt: Date | null;
} {
  const trackedKeywords = new Set(
    params.keywords
      .filter((keyword) => keyword.isTracking)
      .map((keyword) => keyword.keyword)
  );
  const { start, endExclusive } = utcRangeSeoulCalendarDay(
    params.reference ?? new Date()
  );
  const todaySuccessfulKeywords = new Set<string>();
  let latestSuccessAt: Date | null = null;

  for (const history of params.histories) {
    const createdAt = new Date(history.createdAt);
    const createdAtMs = createdAt.getTime();
    if (Number.isNaN(createdAtMs)) continue;

    if (!latestSuccessAt || createdAtMs > latestSuccessAt.getTime()) {
      latestSuccessAt = createdAt;
    }

    if (
      trackedKeywords.has(history.keyword) &&
      createdAtMs >= start.getTime() &&
      createdAtMs < endExclusive.getTime()
    ) {
      todaySuccessfulKeywords.add(history.keyword);
    }
  }

  const trackingKeywordCount = trackedKeywords.size;
  const trackingMode: PlaceTrackingMode =
    trackingKeywordCount === 0
      ? "OFF"
      : trackingKeywordCount >= params.keywords.length
        ? "ON"
        : "MIXED";
  const todayTrackingSuccessCount = todaySuccessfulKeywords.size;
  const trackingUpdateStatus: PlaceTrackingUpdateStatus =
    trackingKeywordCount === 0
      ? "OFF"
      : todayTrackingSuccessCount === 0
        ? "PENDING"
        : todayTrackingSuccessCount >= trackingKeywordCount
          ? "COMPLETE"
          : "PARTIAL";

  return {
    trackingKeywordCount,
    todayTrackingSuccessCount,
    trackingUpdateStatus,
    trackingMode,
    latestSuccessAt,
  };
}
