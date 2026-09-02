import { prisma } from "@/lib/prisma";
import {
  buildTop300RankHistory,
  buildTop300SnapshotCalendar,
  buildTop300SnapshotPlaceIds,
  type Top300RankHistory,
} from "@/lib/place-rank-top300-history";
import type { PlaceRankTop300Row } from "@/lib/place-rank-top300";

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
  };
  update: { rankedPlaceIds: string[] };
  select: { id: true };
};

type SnapshotFindManyArgs = {
  where: {
    keyword: string;
    snapshotDate: { in: string[] };
  };
  select: { snapshotDate: true; rankedPlaceIds: true };
  take: number;
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
    Array<{ snapshotDate: string; rankedPlaceIds: unknown }>
  >;
  deleteMany(args: SnapshotDeleteManyArgs): Promise<{ count: number }>;
};

type SaveTop300SnapshotOptions = {
  reference?: Date;
  delegate?: Top300SnapshotDelegate;
};

export async function savePlaceRankTop300Snapshot(
  input: {
    keyword: string;
    results: readonly Pick<PlaceRankTop300Row, "rank" | "placeId">[];
  },
  options: SaveTop300SnapshotOptions = {}
): Promise<Top300RankHistory> {
  const calendar = buildTop300SnapshotCalendar(
    options.reference ?? new Date()
  );
  const rankedPlaceIds = buildTop300SnapshotPlaceIds(input.results);
  const delegate: Top300SnapshotDelegate =
    options.delegate ?? prisma.placeRankTop300Snapshot;

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
    },
    update: { rankedPlaceIds },
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

  const [storedSnapshots] = await Promise.all([
    delegate.findMany({
      where: {
        keyword: input.keyword,
        snapshotDate: {
          in: calendar.comparisons.map((item) => item.snapshotDate),
        },
      },
      select: { snapshotDate: true, rankedPlaceIds: true },
      take: calendar.comparisons.length,
    }),
    cleanup,
  ]);

  return buildTop300RankHistory(calendar, storedSnapshots);
}
