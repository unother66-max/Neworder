import { describe, expect, it } from "vitest";

import {
  buildPreviousTop300RankMap,
  buildTop300RankHistory,
  buildTop300SnapshotCalendar,
  buildTop300SnapshotPlaceIds,
  getDefaultTop300ComparisonDays,
  getTop300RankMovement,
  getTop300RankMovementLabel,
} from "@/lib/place-rank-top300-history";

describe("TOP300 rank history", () => {
  it("uses the KST calendar date across the UTC 15:00 boundary", () => {
    expect(
      buildTop300SnapshotCalendar(
        new Date("2026-09-01T14:59:59.999Z")
      ).currentDate
    ).toBe("2026-09-01");
    expect(
      buildTop300SnapshotCalendar(
        new Date("2026-09-01T15:00:00.000Z")
      ).currentDate
    ).toBe("2026-09-02");
  });

  it("builds only the exact 1, 2, 3, 5, 10 and 15 day dates", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-10T03:00:00.000Z")
    );

    expect(calendar.currentDate).toBe("2026-09-10");
    expect(calendar.comparisons).toEqual([
      { daysAgo: 1, snapshotDate: "2026-09-09" },
      { daysAgo: 2, snapshotDate: "2026-09-08" },
      { daysAgo: 3, snapshotDate: "2026-09-07" },
      { daysAgo: 5, snapshotDate: "2026-09-05" },
      { daysAgo: 10, snapshotDate: "2026-08-31" },
      { daysAgo: 15, snapshotDate: "2026-08-26" },
    ]);
    expect(calendar.retentionCutoffDate).toBe("2026-08-21");
  });

  it("enables only dates with an exact stored snapshot", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-10T03:00:00.000Z")
    );
    const history = buildTop300RankHistory(calendar, [
      { snapshotDate: "2026-09-09", rankedPlaceIds: ["A"] },
      { snapshotDate: "2026-09-07", rankedPlaceIds: ["B"] },
      { snapshotDate: "2026-09-05", rankedPlaceIds: ["C"] },
      { snapshotDate: "2026-08-26", rankedPlaceIds: ["D"] },
    ]);

    expect(history.snapshots.map((snapshot) => snapshot.daysAgo)).toEqual([
      1, 3, 5, 15,
    ]);
    expect(getDefaultTop300ComparisonDays(history.snapshots)).toBe(1);
    expect(
      getDefaultTop300ComparisonDays(
        history.snapshots.filter((snapshot) => snapshot.daysAgo !== 1)
      )
    ).toBeNull();
  });

  it("calculates ▲, ▼, = and NEW with lower numbers ranked higher", () => {
    const previousRanks = buildPreviousTop300RankMap([
      "unused-1",
      "unused-2",
      "unused-3",
      "B",
      "unused-5",
      "unused-6",
      "unused-7",
      "A",
      "unused-9",
      "C",
    ]);

    const movements = [
      getTop300RankMovement(3, "A", previousRanks),
      getTop300RankMovement(7, "B", previousRanks),
      getTop300RankMovement(10, "C", previousRanks),
      getTop300RankMovement(30, "D", previousRanks),
    ];

    expect(movements).toEqual([
      { kind: "up", amount: 5, previousRank: 8 },
      { kind: "down", amount: 3, previousRank: 4 },
      { kind: "same", previousRank: 10 },
      { kind: "new", previousRank: null },
    ]);
    expect(movements.map(getTop300RankMovementLabel)).toEqual([
      "▲5",
      "▼3",
      "=",
      "NEW",
    ]);
  });

  it("stores only place IDs in rank order", () => {
    const ids = buildTop300SnapshotPlaceIds([
      { rank: 3, placeId: "C" },
      { rank: 1, placeId: "A" },
      { rank: 2, placeId: "B" },
    ]);

    expect(ids).toEqual(["A", "B", "C"]);
  });
});
