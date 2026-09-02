import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { describe, expect, it, vi } from "vitest";

import PlaceRankComparisonControls from "@/components/place-rank-comparison-controls";

describe("place rank comparison controls", () => {
  it("enables only exact stored dates and shows the selected comparison basis", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlaceRankComparisonControls, {
        history: {
          currentDate: "2026-09-10",
          snapshots: [
            { daysAgo: 1, snapshotDate: "2026-09-09", rankedPlaceIds: ["A"] },
            { daysAgo: 3, snapshotDate: "2026-09-07", rankedPlaceIds: ["B"] },
            { daysAgo: 5, snapshotDate: "2026-09-05", rankedPlaceIds: ["C"] },
            { daysAgo: 15, snapshotDate: "2026-08-26", rankedPlaceIds: ["D"] },
          ],
        },
        selectedDays: 1,
        onSelect: vi.fn(),
      })
    );
    const $ = cheerio.load(html);

    expect($("button[data-comparison-days]")).toHaveLength(6);
    expect($("button[data-comparison-days=\"1\"]").attr("disabled")).toBeUndefined();
    expect($("button[data-comparison-days=\"1\"]").attr("aria-pressed")).toBe(
      "true"
    );
    expect($("button[data-comparison-days=\"2\"]").attr("disabled")).toBe(
      "disabled"
    );
    expect($("button[data-comparison-days=\"3\"]").attr("disabled")).toBeUndefined();
    expect($("button[data-comparison-days=\"5\"]").attr("disabled")).toBeUndefined();
    expect($("button[data-comparison-days=\"10\"]").attr("disabled")).toBe(
      "disabled"
    );
    expect($("button[data-comparison-days=\"15\"]").attr("disabled")).toBeUndefined();
    expect($.text()).toContain(
      "2026-09-10 순위 기준 · 2026-09-09(1일전) 비교"
    );
  });

  it("renders a non-blocking snapshot warning", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlaceRankComparisonControls, {
        history: { currentDate: "2026-09-10", snapshots: [] },
        selectedDays: null,
        warning: "순위 기록 저장에 실패했습니다.",
        onSelect: vi.fn(),
      })
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("순위 기록 저장에 실패했습니다.");
  });
});
