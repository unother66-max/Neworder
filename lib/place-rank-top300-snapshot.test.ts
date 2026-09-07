import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  savePlaceRankTop300Snapshot,
  type Top300SnapshotDelegate,
  type Top300TrackedRankDelegate,
} from "@/lib/place-rank-top300-snapshot";
import type { Top300SnapshotMetrics } from "@/lib/place-rank-top300-history";

type MemoryRow = {
  keyword: string;
  snapshotDate: string;
  rankedPlaceIds: string[];
  metrics?: Top300SnapshotMetrics;
  updatedAt?: Date;
};

function cloneMetrics(
  metrics: Top300SnapshotMetrics | undefined
): Top300SnapshotMetrics | undefined {
  return metrics
    ? { version: 1, rows: metrics.rows.map((row) => [...row]) }
    : undefined;
}

function createMemoryDelegate(initialRows: MemoryRow[] = []) {
  const rows = new Map(
    initialRows.map((row) => [
      `${row.keyword}\u0000${row.snapshotDate}`,
      {
        ...row,
        rankedPlaceIds: [...row.rankedPlaceIds],
        ...(row.metrics ? { metrics: cloneMetrics(row.metrics) } : null),
      },
    ])
  );
  const upsertCalls: Parameters<Top300SnapshotDelegate["upsert"]>[0][] = [];
  const findManyCalls: Parameters<Top300SnapshotDelegate["findMany"]>[0][] = [];
  const deleteManyCalls: Parameters<Top300SnapshotDelegate["deleteMany"]>[0][] = [];

  const delegate: Top300SnapshotDelegate = {
    async upsert(args) {
      upsertCalls.push(args);
      const key = `${args.create.keyword}\u0000${args.create.snapshotDate}`;
      rows.set(key, {
        keyword: args.create.keyword,
        snapshotDate: args.create.snapshotDate,
        rankedPlaceIds: [...args.update.rankedPlaceIds],
        metrics: cloneMetrics(args.update.metrics),
      });
      return { id: key };
    },
    async findMany(args) {
      findManyCalls.push(args);
      const wantedDates = new Set(args.where.snapshotDate.in);
      return [...rows.values()]
        .filter(
          (row) =>
            row.keyword === args.where.keyword &&
            wantedDates.has(row.snapshotDate)
        )
        .slice(0, args.take)
        .map((row) => ({
          snapshotDate: row.snapshotDate,
          rankedPlaceIds: [...row.rankedPlaceIds],
          ...(row.updatedAt ? { updatedAt: new Date(row.updatedAt) } : null),
          ...(row.metrics ? { metrics: cloneMetrics(row.metrics) } : null),
        }));
    },
    async deleteMany(args) {
      deleteManyCalls.push(args);
      let count = 0;
      for (const [key, row] of rows) {
        if (
          row.keyword === args.where.keyword &&
          row.snapshotDate < args.where.snapshotDate.lt
        ) {
          rows.delete(key);
          count += 1;
        }
      }
      return { count };
    },
  };

  return { delegate, rows, upsertCalls, findManyCalls, deleteManyCalls };
}

describe("TOP300 snapshot persistence", () => {
  const reference = new Date("2026-09-02T03:00:00.000Z");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("upserts one shared keyword/date row and replaces it on a same-day search", async () => {
    const memory = createMemoryDelegate();

    await savePlaceRankTop300Snapshot(
      {
        keyword: "한남동 맛집",
        results: [
          { rank: 1, placeId: "A" },
          { rank: 2, placeId: "B" },
        ],
      },
      { reference, delegate: memory.delegate }
    );
    await savePlaceRankTop300Snapshot(
      {
        keyword: "한남동 맛집",
        results: [
          {
            rank: 1,
            placeId: "C",
            rating: "4.94",
            visitorReviewCount: 815,
            blogReviewCount: 936,
            saveCountValue: 28_000,
            saveCountIsApproximate: true,
          },
          {
            rank: 2,
            placeId: "A",
            rating: "4.5",
            visitorReviewCount: 10,
            blogReviewCount: 20,
            saveCountValue: 30,
            saveCountIsApproximate: false,
          },
        ],
      },
      { reference, delegate: memory.delegate }
    );

    expect(memory.rows.size).toBe(1);
    expect([...memory.rows.values()][0]).toEqual({
      keyword: "한남동 맛집",
      snapshotDate: "2026-09-02",
      rankedPlaceIds: ["C", "A"],
      metrics: {
        version: 1,
        rows: [
          ["C", 1, 4.94, 815, 936, 28_000, true],
          ["A", 2, 4.5, 10, 20, 30, false],
        ],
      },
    });
    expect(memory.upsertCalls).toHaveLength(2);
    expect(memory.upsertCalls[0].where).toEqual({
      keyword_snapshotDate: {
        keyword: "한남동 맛집",
        snapshotDate: "2026-09-02",
      },
    });
    expect(Object.keys(memory.upsertCalls[0].create).sort()).toEqual([
      "keyword",
      "metrics",
      "rankedPlaceIds",
      "snapshotDate",
    ]);
    expect(memory.upsertCalls[0].create).not.toHaveProperty("userId");
  });

  it("loads exact comparison dates and cleans only this keyword before 20 days", async () => {
    const memory = createMemoryDelegate([
      { keyword: "한남동 맛집", snapshotDate: "2026-09-01", rankedPlaceIds: ["A"] },
      { keyword: "한남동 맛집", snapshotDate: "2026-08-30", rankedPlaceIds: ["B"] },
      { keyword: "한남동 맛집", snapshotDate: "2026-08-28", rankedPlaceIds: ["C"] },
      { keyword: "한남동 맛집", snapshotDate: "2026-08-18", rankedPlaceIds: ["D"] },
      { keyword: "한남동 맛집", snapshotDate: "2026-08-12", rankedPlaceIds: ["old"] },
      { keyword: "다른 키워드", snapshotDate: "2026-08-12", rankedPlaceIds: ["keep"] },
    ]);

    const history = await savePlaceRankTop300Snapshot(
      {
        keyword: "한남동 맛집",
        results: [{ rank: 1, placeId: "NOW" }],
      },
      { reference, delegate: memory.delegate }
    );

    expect(history.snapshots.map((snapshot) => snapshot.daysAgo)).toEqual([
      1, 3, 5, 15,
    ]);
    expect(memory.findManyCalls[0].where.snapshotDate.in).toEqual([
      "2026-09-01",
      "2026-08-31",
      "2026-08-30",
      "2026-08-28",
      "2026-08-23",
      "2026-08-18",
    ]);
    expect(memory.deleteManyCalls[0]).toEqual({
      where: {
        keyword: "한남동 맛집",
        snapshotDate: { lt: "2026-08-13" },
      },
    });
    expect(memory.rows.has("한남동 맛집\u00002026-08-12")).toBe(false);
    expect(memory.rows.has("다른 키워드\u00002026-08-12")).toBe(true);
  });

  it("does not discard saved history when keyword-scoped cleanup fails", async () => {
    const memory = createMemoryDelegate([
      { keyword: "한남동 맛집", snapshotDate: "2026-09-01", rankedPlaceIds: ["A"] },
    ]);
    memory.delegate.deleteMany = vi
      .fn()
      .mockRejectedValue(new Error("cleanup unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const history = await savePlaceRankTop300Snapshot(
      {
        keyword: "한남동 맛집",
        results: [{ rank: 1, placeId: "NOW" }],
      },
      { reference, delegate: memory.delegate }
    );

    expect(history.snapshots).toEqual([
      {
        daysAgo: 1,
        snapshotDate: "2026-09-01",
        rankedPlaceIds: ["A"],
      },
    ]);
  });

  it("loads only exact KST dates from existing Naver PC rank history", async () => {
    const rankedPlaceIds = Array.from(
      { length: 60 },
      (_, index) => (index === 59 ? "123456789" : `place-${index + 1}`)
    );
    const memory = createMemoryDelegate([
      {
        keyword: "한남동 맛집",
        snapshotDate: "2026-09-07",
        rankedPlaceIds,
        updatedAt: new Date("2026-09-07T00:18:00.000Z"),
      },
    ]);
    const trackedFindMany = vi.fn<Top300TrackedRankDelegate["findMany"]>();
    trackedFindMany.mockResolvedValue([
      {
        rank: 65,
        createdAt: new Date("2026-09-07T14:01:00.000Z"),
        place: {
          placeUrl: "https://m.place.naver.com/restaurant/123456789/home",
        },
      },
    ]);

    const history = await savePlaceRankTop300Snapshot(
      {
        keyword: "한남동 맛집",
        results: [{ rank: 1, placeId: "NOW" }],
      },
      {
        reference: new Date("2026-09-08T03:00:00.000Z"),
        delegate: memory.delegate,
        trackedRankDelegate: { findMany: trackedFindMany },
      }
    );

    expect(trackedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keyword: "한남동 맛집",
          rank: { gt: 0 },
          place: { type: "rank" },
        }),
      })
    );
    const query = trackedFindMany.mock.calls[0][0];
    expect(query.where.OR[0]).toEqual({
      createdAt: {
        gte: new Date("2026-09-06T15:00:00.000Z"),
        lt: new Date("2026-09-07T15:00:00.000Z"),
      },
    });
    expect(query.where.OR).toHaveLength(6);
    expect(history.snapshots[0]).toMatchObject({
      daysAgo: 1,
      snapshotDate: "2026-09-07",
      rankOverrides: [["123456789", 65]],
    });
  });
});
