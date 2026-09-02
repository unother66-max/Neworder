import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import PlaceReviewMobileHistory, {
  mobileReviewDateLabel,
  mobileReviewSaveCount,
  PlaceReviewMobileHistoryHeader,
} from "@/components/place-review-mobile-history";

const rows = [
  {
    id: "history-1",
    dateLabel: "09/02 (수)\n03:46",
    totalReviewCount: 1742,
    visitorReviewCount: 807,
    visitorReviewDiff: 1,
    blogReviewCount: 935,
    blogReviewDiff: -1,
    saveCount: "28000",
    keywords: ["청모블루 숙대입구점", "숙대입구 맛집"],
  },
  {
    id: "history-2",
    dateLabel: "09/01 (화)\n03:46",
    totalReviewCount: 1742,
    visitorReviewCount: 806,
    visitorReviewDiff: 0,
    blogReviewCount: 936,
    blogReviewDiff: null,
    saveCount: "28,000",
    keywords: ["청모블루"],
  },
];

describe("place review mobile history", () => {
  it("renders the short six-column header", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceReviewMobileHistoryHeader)
    );
    const $ = cheerio.load(html);

    expect($("[data-mobile-place-review-header]").text()).toBe(
      "날짜전체방문블로그저장키워드"
    );
  });

  it("removes the mobile time and keeps each record in six ordered cells", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceReviewMobileHistory, { rows })
    );
    const $ = cheerio.load(html);
    const firstRow = $('[data-mobile-place-review-row="history-1"]');
    const cells = firstRow.find("[data-mobile-place-review-cell]");

    expect(cells).toHaveLength(6);
    expect(
      cells.map((_, cell) => $(cell).attr("data-mobile-place-review-cell")).get()
    ).toEqual(["date", "total", "visitor", "blog", "save", "keywords"]);
    expect(cells.eq(0).text()).toBe("09/02(수)");
    expect(firstRow.text()).not.toContain("03:46");
    expect(cells.eq(1).text()).toBe("1,742");
    expect(cells.eq(2).text()).toBe("807▲1");
    expect(cells.eq(3).text()).toBe("935▼1");
    expect(cells.eq(4).text()).toBe("28,000");
  });

  it("keeps up, down, and flat deltas inline with the existing colors", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceReviewMobileHistory, { rows })
    );
    const $ = cheerio.load(html);

    expect($('[data-mobile-review-delta="increase"]').attr("class")).toContain(
      "text-[#ef4444]"
    );
    expect($('[data-mobile-review-delta="decrease"]').attr("class")).toContain(
      "text-[#2563eb]"
    );
    expect($('[data-mobile-review-delta="flat"]').first().text()).toBe("-");
    expect($('[data-mobile-review-delta="unavailable"]').first().text()).toBe("-");
    expect(
      $('[data-mobile-place-review-cell="visitor"]').first().attr("class")
    ).toContain("whitespace-nowrap");
  });

  it("formats save counts and truncates the keyword column", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceReviewMobileHistory, { rows })
    );
    const $ = cheerio.load(html);
    const keyword = $('[data-mobile-place-review-cell="keywords"]').first();

    expect(mobileReviewSaveCount("28000")).toBe("28,000");
    expect(mobileReviewSaveCount("2.8만")).toBe("28,000");
    expect(mobileReviewSaveCount("집계 중")).toBe("집계 중");
    expect(mobileReviewSaveCount(null)).toBe("-");
    expect(keyword.attr("class")).toContain("min-w-0");
    expect(keyword.attr("class")).toContain("truncate");
    expect(keyword.attr("title")).toBe("청모블루 숙대입구점, 숙대입구 맛집");
  });

  it("normalizes only the mobile date label", () => {
    expect(mobileReviewDateLabel("09/02 (수)\n03:46")).toBe("09/02(수)");
    expect(mobileReviewDateLabel("-")).toBe("-");
  });
});
