import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";

import PlaceRankMobileResultItem, {
  PlaceRankMobileResultHeader,
  type MobilePlaceRankResult,
} from "@/components/place-rank-mobile-result-item";

const baseRow = {
  rank: 1,
  placeId: "place-1",
  name: "이태리국시 한남",
  category: "양식",
  thumbnail: "https://example.com/place.jpg",
  rating: "4.85",
  visitorReviewCount: 19_144,
  blogReviewCount: 4_844,
  saveCount: "12,480",
};

function renderMobileRow(
  previousRanks: ReadonlyMap<string, number> | null,
  row: MobilePlaceRankResult & { saveCount?: string } = baseRow
) {
  return renderToStaticMarkup(
    createElement(PlaceRankMobileResultItem, { row, previousRanks })
  );
}

describe("place rank mobile result item", () => {
  it("renders one shared compact header", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceRankMobileResultHeader)
    );
    const $ = cheerio.load(html);

    expect($("[data-mobile-place-rank-header]").text()).toBe(
      "순위업체명평점방문블로그"
    );
  });

  it("shows six single-row fields without category, labels, save count, or links", () => {
    const html = renderMobileRow(new Map([[baseRow.placeId, 3]]));
    const $ = cheerio.load(html);
    const cells = $("[data-mobile-place-rank-cell]");

    expect(cells).toHaveLength(6);
    expect(cells.map((_, cell) => $(cell).attr("data-mobile-place-rank-cell")).get()).toEqual([
      "rank",
      "thumbnail",
      "name",
      "rating",
      "visitor",
      "blog",
    ]);
    expect($("article").text()).toContain("이태리국시 한남");
    expect($("article").text()).toContain("4.85");
    expect($("article").text()).toContain("19,144");
    expect($("article").text()).toContain("4,844");
    expect($("article").text()).not.toContain("양식");
    expect($("article").text()).not.toContain("평점");
    expect($("article").text()).not.toContain("방문자리뷰");
    expect($("article").text()).not.toContain("블로그리뷰");
    expect($("article").text()).not.toContain("12,480");
    expect($("a")).toHaveLength(0);
    expect($("img").attr("width")).toBe("36");
    expect($("img").attr("height")).toBe("36");
    expect($("[data-mobile-place-rank-cell='name']").attr("class")).toContain(
      "truncate"
    );
    expect(html).toContain('data-rank-movement="up"');
    expect(html).toContain("▲2");
  });

  it.each([
    { previousRank: 1, rank: 3, kind: "down", label: "▼2" },
    { previousRank: 3, rank: 3, kind: "same", label: "=" },
    { previousRank: null, rank: 300, kind: "new", label: "NEW" },
  ])("keeps the $kind history marker visible", (movement) => {
    const row = { ...baseRow, rank: movement.rank };
    const previousRanks =
      movement.previousRank === null
        ? new Map<string, number>()
        : new Map([[row.placeId, movement.previousRank]]);
    const html = renderMobileRow(previousRanks, row);

    expect(html).toContain(`data-rank-movement="${movement.kind}"`);
    expect(html).toContain(movement.label);
  });

  it("uses the existing dash convention for missing metrics", () => {
    const html = renderMobileRow(null, {
      ...baseRow,
      rating: null,
      visitorReviewCount: null,
      blogReviewCount: null,
    });
    const $ = cheerio.load(html);

    expect($("[data-mobile-place-rank-cell='rating']").text()).toBe("-");
    expect($("[data-mobile-place-rank-cell='visitor']").text()).toBe("-");
    expect($("[data-mobile-place-rank-cell='blog']").text()).toBe("-");
  });
});
