import { prisma } from "@/lib/prisma";
import {
  buildTop300RankHistory,
  buildTop300SnapshotCalendar,
  buildTop300SnapshotMetrics,
  buildTop300SnapshotPlaceIds,
  type Top300RankHistory,
  type Top300SnapshotMetrics,
  type Top300TrackedRankRecord,
} from "@/lib/place-rank-top300-history";
import type { PlaceRankTop300Row } from "@/lib/place-rank-top300";
import {
  seoulCalendarDateString,
  utcRangeForSeoulDateString,
} from "@/lib/seoul-calendar";

export const TOP300_SNAPSHOT_SAVE_FAILED_MESSAGE =
  "순위 기록 저장에 실패했습니다.";
export const TOP300_PARTIAL_SNAPSHOT_MESSAGE =
  "일부 결과만 수집되어 순위 기록은 저장하지 않았습니다.";

type SnapshotUpsertArgs = {
  where: {
    keyword_snapshotDate: { keyword: string; snapshotDate: string };
  };
  create: {
    keyword: string;
    snapshotDate: string;
    rankedPlaceIds: string[];
    metrics: Top300SnapshotMetrics;
  };
  update: { rankedPlaceIds: string[]; metrics: Top300SnapshotMetrics };
  select: { id: true };
};

type SnapshotFindManyArgs = {
  where: {
    keyword: string;
    snapshotDate: { in: string[] };
  };
  select: {
    snapshotDate: true;
    rankedPlaceIds: true;
    metrics: true;
    updatedAt: true;
  };
  take: number;
};

type TrackedRankFindManyArgs = {
  where: {
    keyword: string;
    rank: { gt: number };
    place: { type: "rank" };
    OR: Array<{
      createdAt: { gte: Date; lt: Date };
    }>;
  };
  orderBy: { createdAt: "desc" };
  select: {
    rank: true;
    createdAt: true;
    place: { select: { placeUrl: true } };
  };
};

type SnapshotDeleteManyArgs = {
  where: {
    keyword: string;
    snapshotDate: { lt: string };
  };
};

export type Top300SnapshotDelegate = {
  upsert(args: SnapshotUpsertArgs): Promise<unknown>;
  findMany(args: SnapshotFindManyArgs): Promise<
    Array<{
      snapshotDate: string;
      rankedPlaceIds: unknown;
      metrics?: unknown;
      updatedAt?: Date | string;
    }>
  >;
  deleteMany(args: SnapshotDeleteManyArgs): Promise<{ count: number }>;
};

export type Top300TrackedRankDelegate = {
  findMany(args: TrackedRankFindManyArgs): Promise<
    Array<{
      rank: number;
      createdAt: Date;
      place: { placeUrl: string | null };
    }>
  >;
};

type SaveTop300SnapshotOptions = {
  reference?: Date;
  delegate?: Top300SnapshotDelegate;
  trackedRankDelegate?: Top300TrackedRankDelegate;
};

function extractNaverPublicPlaceId(placeUrl: string | null): string {
  if (!placeUrl) return "";
  const match =
    placeUrl.match(/restaurant\/(\d+)/) ||
    placeUrl.match(/place\/(\d+)/) ||
    placeUrl.match(/placeId=(\d+)/) ||
    placeUrl.match(/entry\/place\/(\d+)/);
  return match?.[1] ?? "";
}

export async function savePlaceRankTop300Snapshot(
  input: {
    keyword: string;
    results: readonly (
      Pick<PlaceRankTop300Row, "rank" | "placeId"> &
        Partial<
          Pick<
            PlaceRankTop300Row,
            | "rating"
            | "visitorReviewCount"
            | "blogReviewCount"
            | "saveCountValue"
            | "saveCountIsApproximate"
          >
        >
    )[];
  },
  options: SaveTop300SnapshotOptions = {}
): Promise<Top300RankHistory> {
  const calendar = buildTop300SnapshotCalendar(
    options.reference ?? new Date()
  );
  const rankedPlaceIds = buildTop300SnapshotPlaceIds(input.results);
  const metrics = buildTop300SnapshotMetrics(input.results);
  const delegate: Top300SnapshotDelegate =
    options.delegate ?? prisma.placeRankTop300Snapshot;
  const trackedRankDelegate: Top300TrackedRankDelegate | null =
    options.trackedRankDelegate ??
    (options.delegate ? null : prisma.rankHistory);

  await delegate.upsert({
    where: {
      keyword_snapshotDate: {
        keyword: input.keyword,
        snapshotDate: calendar.currentDate,
      },
    },
    create: {
      keyword: input.keyword,
      snapshotDate: calendar.currentDate,
      rankedPlaceIds,
      metrics,
    },
    update: { rankedPlaceIds, metrics },
    select: { id: true },
  });

  const cleanup = delegate
    .deleteMany({
      where: {
        keyword: input.keyword,
        snapshotDate: { lt: calendar.retentionCutoffDate },
      },
    })
    .catch((error) => {
      console.error("[rank-analysis TOP300 snapshot cleanup]", error);
      return { count: 0 };
    });

  const [storedSnapshots, , trackedRankRows] = await Promise.all([
    delegate.findMany({
      where: {
        keyword: input.keyword,
        snapshotDate: {
          in: calendar.comparisons.map((item) => item.snapshotDate),
        },
      },
      select: {
        snapshotDate: true,
        rankedPlaceIds: true,
        metrics: true,
        updatedAt: true,
      },
      take: calendar.comparisons.length,
    }),
    cleanup,
    trackedRankDelegate
      ? trackedRankDelegate.findMany({
          where: {
            keyword: input.keyword,
            rank: { gt: 0 },
            // Naver 순위추적(type=rank)은 기존 PC 순위 수집 경로만 사용한다.
            place: { type: "rank" },
            OR: calendar.comparisons.map((comparison) => {
              const range = utcRangeForSeoulDateString(
                comparison.snapshotDate
              );
              return {
                createdAt: { gte: range.start, lt: range.endExclusive },
              };
            }),
          },
          orderBy: { createdAt: "desc" },
          select: {
            rank: true,
            createdAt: true,
            place: { select: { placeUrl: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const exactComparisonDates = new Set(
    calendar.comparisons.map((comparison) => comparison.snapshotDate)
  );
  const trackedRankRecords: Top300TrackedRankRecord[] = trackedRankRows.flatMap(
    (row) => {
      const snapshotDate = seoulCalendarDateString(row.createdAt);
      const placeId = extractNaverPublicPlaceId(row.place.placeUrl);
      if (!exactComparisonDates.has(snapshotDate) || !placeId) return [];
      return [{ snapshotDate, placeId, rank: row.rank, collectedAt: row.createdAt }];
    }
  );

  return buildTop300RankHistory(
    calendar,
    storedSnapshots,
    trackedRankRecords
  );
}
