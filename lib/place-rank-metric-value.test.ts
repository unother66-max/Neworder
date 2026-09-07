import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import PlaceRankMetricValue from "@/components/place-rank-metric-value";

function renderMetric(
  props: Parameters<typeof PlaceRankMetricValue>[0]
): cheerio.CheerioAPI {
  return cheerio.load(
    renderToStaticMarkup(createElement(PlaceRankMetricValue, props))
  );
}

describe("place rank metric value", () => {
  it("renders current value and a precise inline delta", () => {
    const $ = renderMetric({
      value: "4.94",
      currentValue: 4.94,
      previousValue: 4.93,
      comparisonActive: true,
      fractionDigits: 2,
    });

    expect($.text()).toBe("4.94▲0.01");
    expect($("[data-metric-movement]").attr("data-metric-movement")).toBe(
      "up"
    );
    expect($("[data-metric-movement]").attr("class")).toContain(
      "text-[#ef4444]"
    );
  });

  it("uses direction only when approximate save-count buckets change", () => {
    const $ = renderMetric({
      value: "28,000+",
      currentValue: 28_000,
      previousValue: 27_000,
      currentIsApproximate: true,
      previousIsApproximate: true,
      comparisonActive: true,
    });

    expect($.text()).toBe("28,000+▲");
    expect($.text()).not.toContain("1,000");
  });

  it("does not append a second dash when the current value is missing", () => {
    const $ = renderMetric({
      value: "-",
      currentValue: null,
      previousValue: 10,
      comparisonActive: true,
    });

    expect($.text()).toBe("-");
    expect($("[data-metric-movement]")).toHaveLength(0);
  });
});
