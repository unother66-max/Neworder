import { describe, expect, it } from "vitest";

import {
  buildPreviousTop300RankMap,
  buildPreviousTop300MetricMap,
  buildTop300RankHistory,
  buildTop300SnapshotCalendar,
  buildTop300SnapshotMetrics,
  buildTop300SnapshotPlaceIds,
  getDefaultTop300ComparisonDays,
  getTop300MetricMovement,
  getTop300MetricMovementLabel,
  getTop300RankMovement,
  getTop300RankMovementLabel,
  getTop300SaveCountMovement,
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

  it("never substitutes the 2-day snapshot when the exact 1-day date is missing", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-07T03:00:00.000Z")
    );
    const history = buildTop300RankHistory(calendar, [
      { snapshotDate: "2026-09-05", rankedPlaceIds: ["A"] },
    ]);

    expect(history.snapshots).toEqual([
      {
        daysAgo: 2,
        snapshotDate: "2026-09-05",
        rankedPlaceIds: ["A"],
      },
    ]);
    expect(
      history.snapshots.find((snapshot) => snapshot.daysAgo === 1)
    ).toBeUndefined();
  });

  it("uses the latest same-KST-day PC tracking rank over an earlier TOP300 rank", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-08T03:00:00.000Z")
    );
    const rankedPlaceIds = Array.from(
      { length: 70 },
      (_, index) => `place-${index + 1}`
    );
    rankedPlaceIds[59] = "target-place";

    const history = buildTop300RankHistory(
      calendar,
      [
        {
          snapshotDate: "2026-09-07",
          rankedPlaceIds,
          updatedAt: new Date("2026-09-07T00:18:00.000Z"), // 09:18 KST
          metrics: {
            version: 1,
            rows: [["target-place", 60, 4.9, 100, 20, 300, false]],
          },
        },
      ],
      [
        {
          snapshotDate: "2026-09-07",
          placeId: "target-place",
          rank: 64,
          collectedAt: new Date("2026-09-07T11:18:00.000Z"), // 20:18 KST
        },
        {
          snapshotDate: "2026-09-07",
          placeId: "target-place",
          rank: 65,
          collectedAt: new Date("2026-09-07T14:01:00.000Z"), // 23:01 KST
        },
      ]
    );

    const snapshot = history.snapshots.find((item) => item.daysAgo === 1);
    expect(
      buildPreviousTop300RankMap(
        snapshot?.rankedPlaceIds ?? [],
        snapshot?.rankOverrides
      ).get("target-place")
    ).toBe(65);
    expect(
      buildPreviousTop300MetricMap(snapshot?.metrics).get("target-place")
    ).toMatchObject({ rank: 60, rating: 4.9 });
  });

  it("applies the source rule independently to every TOP300 placeId", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-08T03:00:00.000Z")
    );
    const history = buildTop300RankHistory(
      calendar,
      [
        {
          snapshotDate: "2026-09-07",
          rankedPlaceIds: [
            "untracked-first",
            "tracked-second",
            "untracked-third",
            "tracked-fourth",
          ],
          updatedAt: new Date("2026-09-07T00:18:00.000Z"),
        },
      ],
      [
        {
          snapshotDate: "2026-09-07",
          placeId: "tracked-second",
          rank: 8,
          collectedAt: new Date("2026-09-07T11:18:00.000Z"),
        },
        {
          snapshotDate: "2026-09-07",
          placeId: "tracked-fourth",
          rank: 12,
          collectedAt: new Date("2026-09-07T14:01:00.000Z"),
        },
      ]
    );
    const snapshot = history.snapshots.find((item) => item.daysAgo === 1);
    const ranks = buildPreviousTop300RankMap(
      snapshot?.rankedPlaceIds ?? [],
      snapshot?.rankOverrides
    );

    expect([...ranks.entries()]).toEqual([
      ["untracked-first", 1],
      ["tracked-second", 8],
      ["untracked-third", 3],
      ["tracked-fourth", 12],
    ]);
  });

  it("keeps the later TOP300 rank and ignores tracking records from other dates", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-08T03:00:00.000Z")
    );
    const rankedPlaceIds = Array.from(
      { length: 60 },
      (_, index) => (index === 59 ? "target-place" : `place-${index + 1}`)
    );
    const history = buildTop300RankHistory(
      calendar,
      [
        {
          snapshotDate: "2026-09-07",
          rankedPlaceIds,
          updatedAt: new Date("2026-09-07T14:30:00.000Z"), // 23:30 KST
        },
      ],
      [
        {
          snapshotDate: "2026-09-07",
          placeId: "target-place",
          rank: 65,
          collectedAt: new Date("2026-09-07T14:01:00.000Z"),
        },
        {
          snapshotDate: "2026-09-06",
          placeId: "target-place",
          rank: 70,
          collectedAt: new Date("2026-09-06T14:59:00.000Z"),
        },
      ]
    );
    const snapshot = history.snapshots.find((item) => item.daysAgo === 1);

    expect(snapshot?.rankOverrides).toBeUndefined();
    expect(
      buildPreviousTop300RankMap(snapshot?.rankedPlaceIds ?? []).get(
        "target-place"
      )
    ).toBe(60);
  });

  it("allows an exact-date tracking-only rank without inventing metric history", () => {
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-08T03:00:00.000Z")
    );
    const history = buildTop300RankHistory(calendar, [], [
      {
        snapshotDate: "2026-09-07",
        placeId: "target-place",
        rank: 65,
        collectedAt: new Date("2026-09-07T14:01:00.000Z"),
      },
    ]);

    expect(history.snapshots).toEqual([
      {
        daysAgo: 1,
        snapshotDate: "2026-09-07",
        rankedPlaceIds: [],
        rankOverrides: [["target-place", 65]],
      },
    ]);
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

  it.each([
    { previousRank: 65, currentRank: 66, expected: "▼1" },
    { previousRank: 60, currentRank: 66, expected: "▼6" },
    { previousRank: 70, currentRank: 66, expected: "▲4" },
  ])(
    "compares rank $previousRank → $currentRank as $expected",
    ({ previousRank, currentRank, expected }) => {
      const movement = getTop300RankMovement(
        currentRank,
        "new-order",
        new Map([["new-order", previousRank]])
      );
      expect(getTop300RankMovementLabel(movement)).toBe(expected);
    }
  );

  it.each([
    {
      name: "rating",
      previous: 4.93,
      current: 4.94,
      fractionDigits: 2,
      expected: "▲0.01",
    },
    {
      name: "visitor reviews",
      previous: 806,
      current: 815,
      fractionDigits: 0,
      expected: "▲9",
    },
    {
      name: "blog reviews",
      previous: 940,
      current: 936,
      fractionDigits: 0,
      expected: "▼4",
    },
    {
      name: "unchanged",
      previous: 936,
      current: 936,
      fractionDigits: 0,
      expected: "-",
    },
  ])(
    "calculates $name metric movement without floating point noise",
    ({ previous, current, fractionDigits, expected }) => {
      const movement = getTop300MetricMovement(
        previous,
        current,
        fractionDigits
      );
      expect(getTop300MetricMovementLabel(movement, fractionDigits)).toBe(
        expected
      );
    }
  );

  it("marks a missing previous metric unavailable instead of treating it as zero", () => {
    const movement = getTop300MetricMovement(null, 815);
    expect(movement).toEqual({ kind: "unavailable", amount: null });
    expect(getTop300MetricMovementLabel(movement)).toBe("-");
  });

  it("does not invent an exact save-count delta from approximate buckets", () => {
    const unchanged = getTop300SaveCountMovement(28_000, 28_000, true, true);
    const changed = getTop300SaveCountMovement(27_000, 28_000, true, true);

    expect(getTop300MetricMovementLabel(unchanged)).toBe("-");
    expect(getTop300MetricMovementLabel(changed)).toBe("▲");
    expect(changed).toEqual({ kind: "up", amount: null });
  });

  it("round-trips compact snapshot metrics and keeps legacy rank-only rows valid", () => {
    const metrics = buildTop300SnapshotMetrics([
      {
        placeId: "1699073167",
        rank: 66,
        rating: "4.94",
        visitorReviewCount: 815,
        blogReviewCount: 936,
        saveCountValue: 28_000,
        saveCountIsApproximate: true,
      },
    ]);
    const calendar = buildTop300SnapshotCalendar(
      new Date("2026-09-07T03:00:00.000Z")
    );
    const history = buildTop300RankHistory(calendar, [
      {
        snapshotDate: "2026-09-06",
        rankedPlaceIds: ["1699073167"],
        metrics,
      },
      { snapshotDate: "2026-09-05", rankedPlaceIds: ["legacy"] },
    ]);

    const previous = buildPreviousTop300MetricMap(history.snapshots[0]?.metrics);
    expect(previous.get("1699073167")).toEqual({
      placeId: "1699073167",
      rank: 66,
      rating: 4.94,
      visitorReviewCount: 815,
      blogReviewCount: 936,
      saveCount: 28_000,
      saveCountIsApproximate: true,
    });
    expect(history.snapshots[1]).not.toHaveProperty("metrics");
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
