import { describe, expect, it } from "vitest";

import {
  buildPreviousWebAnalysisRankMap,
  buildWebAnalysisRankHistory,
  buildWebAnalysisSnapshotCalendar,
  buildWebAnalysisSnapshotUrls,
  filterWebAnalysisDisplayResults,
  getWebAnalysisRankMovement,
  getWebAnalysisRankMovementLabel,
} from "@/lib/web-analysis-history";

describe("web analysis snapshot history", () => {
  it("uses exact Asia/Seoul calendar dates without a nearest-date fallback", () => {
    const calendar = buildWebAnalysisSnapshotCalendar(
      new Date("2026-09-07T15:30:00.000Z")
    );
    const history = buildWebAnalysisRankHistory(calendar, [
      { snapshotDate: "2026-09-07", rankedUrls: ["https://example.com/a"] },
      { snapshotDate: "2026-09-04", rankedUrls: ["https://example.com/b"] },
    ]);

    expect(calendar.currentDate).toBe("2026-09-08");
    expect(history.snapshots).toEqual([
      {
        daysAgo: 1,
        snapshotDate: "2026-09-07",
        rankedUrls: ["https://example.com/a"],
      },
    ]);
  });

  it("stores only URLs in collected-rank order", () => {
    expect(
      buildWebAnalysisSnapshotUrls([
        { collectedIndex: 3, url: "https://example.com/c" },
        { collectedIndex: 1, url: " https://example.com/a " },
        { collectedIndex: 2, url: "https://blog.naver.com/b" },
      ])
    ).toEqual([
      "https://example.com/a",
      "https://blog.naver.com/b",
      "https://example.com/c",
    ]);
  });

  it("identifies documents by URL and calculates all movement labels", () => {
    const previousRanks = buildPreviousWebAnalysisRankMap([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
      "https://example.com/e",
      "https://example.com/f",
      "https://example.com/target",
    ]);

    expect(
      getWebAnalysisRankMovementLabel(
        getWebAnalysisRankMovement(
          3,
          "https://example.com/target",
          previousRanks
        )
      )
    ).toBe("▲4");
    expect(
      getWebAnalysisRankMovementLabel(
        getWebAnalysisRankMovement(8, "https://example.com/a", previousRanks)
      )
    ).toBe("▼7");
    expect(
      getWebAnalysisRankMovementLabel(
        getWebAnalysisRankMovement(2, "https://example.com/b", previousRanks)
      )
    ).toBe("=");
    expect(
      getWebAnalysisRankMovementLabel(
        getWebAnalysisRankMovement(8, "https://example.com/new", previousRanks)
      )
    ).toBe("NEW");
  });

  it("hides Naver blog and cafe rows without renumbering rank or movement", () => {
    const rows = [
      { collectedIndex: 1, url: "A", domain: "a.test", source: "웹사이트" },
      {
        collectedIndex: 2,
        url: "NAVER-1",
        domain: "blog.naver.com",
        source: "네이버 블로그",
      },
      { collectedIndex: 3, url: "B", domain: "b.test", source: "웹사이트" },
      {
        collectedIndex: 4,
        url: "NAVER-CAFE",
        domain: "cafe.naver.com",
        source: "네이버 카페",
      },
      { collectedIndex: 5, url: "C", domain: "c.test", source: "웹사이트" },
    ];
    const displayed = filterWebAnalysisDisplayResults(rows, true);
    const previousRanks = buildPreviousWebAnalysisRankMap([
      "X1",
      "X2",
      "X3",
      "X4",
      "X5",
      "X6",
      "B",
    ]);

    expect(displayed.map((row) => row.collectedIndex)).toEqual([1, 3, 5]);
    expect(
      getWebAnalysisRankMovementLabel(
        getWebAnalysisRankMovement(
          displayed[1].collectedIndex,
          displayed[1].url,
          previousRanks
        )
      )
    ).toBe("▲4");
  });
});
