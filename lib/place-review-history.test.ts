import { describe, expect, it } from "vitest";

import {
  buildPlaceReviewDailyHistory,
  getPreviousTrackedDate,
  parsePlaceReviewCount,
} from "@/lib/place-review-history";

function row(
  trackedDate: string,
  total: number,
  visitor: number,
  blog: number,
  save: string
) {
  return {
    id: trackedDate,
    trackedDate,
    totalReviewCount: total,
    visitorReviewCount: visitor,
    blogReviewCount: blog,
    saveCount: save,
  };
}

describe("place review daily history", () => {
  it("calculates every metric against the previous calendar day", () => {
    const history = buildPlaceReviewDailyHistory([
      row("2026-07-28", 130, 90, 40, "1.2만"),
      row("2026-07-27", 120, 84, 36, "11,950"),
    ]);

    expect(history[0]).toMatchObject({
      comparedTrackedDate: "2026-07-27",
      totalReviewDiff: 10,
      visitorReviewDiff: 6,
      blogReviewDiff: 4,
      saveCountDiff: 50,
    });
    expect(history[1].totalReviewDiff).toBeNull();
  });

  it("does not call a two-day accumulated change a previous-day change", () => {
    const history = buildPlaceReviewDailyHistory([
      row("2026-07-28", 130, 90, 40, "12,000"),
      row("2026-07-26", 100, 70, 30, "11,000"),
    ]);

    expect(history[0]).toMatchObject({
      comparedTrackedDate: null,
      totalReviewDiff: null,
      visitorReviewDiff: null,
      blogReviewDiff: null,
      saveCountDiff: null,
    });
  });

  it("uses the hidden 31st row as the comparison for the 30th visible row", () => {
    const rows = Array.from({ length: 31 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, 31 - index));
      const trackedDate = date.toISOString().slice(0, 10);
      return row(trackedDate, 1_031 - index, 700, 331 - index, "2,000");
    });
    const history = buildPlaceReviewDailyHistory(rows, 30);

    expect(history).toHaveLength(30);
    expect(history[29]).toMatchObject({
      trackedDate: "2026-07-02",
      comparedTrackedDate: "2026-07-01",
      totalReviewDiff: 1,
    });
  });

  it.each([
    ["12,345", 12_345],
    ["1.2만", 12_000],
    ["2천+", 2_000],
    ["-", null],
    ["알 수 없음", null],
  ])("parses saved-count label %s", (value, expected) => {
    expect(parsePlaceReviewCount(value)).toBe(expected);
  });

  it("handles year and leap-day boundaries", () => {
    expect(getPreviousTrackedDate("2026-01-01")).toBe("2025-12-31");
    expect(getPreviousTrackedDate("2024-03-01")).toBe("2024-02-29");
    expect(getPreviousTrackedDate("invalid")).toBeNull();
  });
});
