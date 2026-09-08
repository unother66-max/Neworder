import { prisma } from "@/lib/prisma";
import {
  buildWebAnalysisRankHistory,
  buildWebAnalysisSnapshotCalendar,
  buildWebAnalysisSnapshotUrls,
  type WebAnalysisRankHistory,
} from "@/lib/web-analysis-history";

export const WEB_ANALYSIS_SNAPSHOT_SAVE_FAILED_MESSAGE =
  "순위 기록 저장에 실패했습니다.";
export const WEB_ANALYSIS_PARTIAL_SNAPSHOT_MESSAGE =
  "일부 결과만 수집되어 순위 기록은 저장하지 않았습니다.";

type SnapshotUpsertArgs = {
  where: {
    keyword_snapshotDate: { keyword: string; snapshotDate: string };
  };
  create: {
    keyword: string;
    snapshotDate: string;
    rankedUrls: string[];
  };
  update: { rankedUrls: string[] };
  select: { id: true };
};

type SnapshotFindManyArgs = {
  where: {
    keyword: string;
    snapshotDate: { in: string[] };
  };
  select: { snapshotDate: true; rankedUrls: true };
  take: number;
};

export type WebAnalysisSnapshotDelegate = {
  upsert(args: SnapshotUpsertArgs): Promise<unknown>;
  findMany(args: SnapshotFindManyArgs): Promise<
    Array<{ snapshotDate: string; rankedUrls: unknown }>
  >;
};

type WebAnalysisSnapshotOptions = {
  reference?: Date;
  delegate?: WebAnalysisSnapshotDelegate;
};

async function readComparisonHistory(
  keyword: string,
  options: WebAnalysisSnapshotOptions
): Promise<WebAnalysisRankHistory> {
  const calendar = buildWebAnalysisSnapshotCalendar(
    options.reference ?? new Date()
  );
  const delegate: WebAnalysisSnapshotDelegate =
    options.delegate ?? prisma.webAnalysisSnapshot;
  const storedSnapshots = await delegate.findMany({
    where: {
      keyword,
      snapshotDate: {
        in: calendar.comparisons.map((comparison) => comparison.snapshotDate),
      },
    },
    select: { snapshotDate: true, rankedUrls: true },
    take: calendar.comparisons.length,
  });

  return buildWebAnalysisRankHistory(calendar, storedSnapshots);
}

export async function loadWebAnalysisRankHistory(
  keyword: string,
  options: WebAnalysisSnapshotOptions = {}
): Promise<WebAnalysisRankHistory> {
  return readComparisonHistory(keyword, options);
}

export async function saveWebAnalysisSnapshot(
  input: {
    keyword: string;
    results: readonly { collectedIndex: number; url: string }[];
  },
  options: WebAnalysisSnapshotOptions = {}
): Promise<WebAnalysisRankHistory> {
  const calendar = buildWebAnalysisSnapshotCalendar(
    options.reference ?? new Date()
  );
  const delegate: WebAnalysisSnapshotDelegate =
    options.delegate ?? prisma.webAnalysisSnapshot;
  const rankedUrls = buildWebAnalysisSnapshotUrls(input.results);

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
      rankedUrls,
    },
    update: { rankedUrls },
    select: { id: true },
  });

  return readComparisonHistory(input.keyword, { ...options, delegate });
}
