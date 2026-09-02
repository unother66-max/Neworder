import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { describe, expect, it, vi } from "vitest";

import WebAnalysisMobileResultItem, {
  WebAnalysisMobileResultHeader,
  webAnalysisSourceLabel,
} from "@/components/web-analysis-mobile-result-item";

const row = {
  collectedIndex: 1,
  page: 2,
  title: "뉴오더클럽 한남 > 여행지",
  url: "https://korean.visitkorea.or.kr/detail/1",
  domain: "korean.visitkorea.or.kr",
  source: "VISITKOREA",
  thumbnail: "https://example.com/thumb.jpg",
};

describe("web analysis mobile result item", () => {
  it("renders the compact mobile header", () => {
    const html = renderToStaticMarkup(
      createElement(WebAnalysisMobileResultHeader)
    );
    const $ = cheerio.load(html);

    expect($("[data-mobile-web-analysis-header]").text()).toBe(
      "수집순번페이지결과 정보"
    );
  });

  it("uses the result URL for the linked title and keeps the source below it", () => {
    const html = renderToStaticMarkup(
      createElement(WebAnalysisMobileResultItem, {
        row,
        isPreview: false,
      })
    );
    const $ = cheerio.load(html);
    const titleLink = $("[data-mobile-web-analysis-title-link]");

    expect(titleLink.text()).toBe(row.title);
    expect(titleLink.attr("href")).toBe(row.url);
    expect(titleLink.attr("target")).toBe("_blank");
    expect(titleLink.attr("rel")).toBe("noopener noreferrer");
    expect(titleLink.attr("class")).toContain("line-clamp-2");
    expect($("[data-mobile-web-analysis-source]").text()).toBe("VISITKOREA");
    expect($("[data-mobile-web-analysis-page-badge]").text()).toBe("2페이지");
    expect($("[data-mobile-web-analysis-page-badge]").attr("class")).toContain(
      "whitespace-nowrap"
    );
    expect($("img")).toHaveLength(1);
    expect($("a")).toHaveLength(1);
  });

  it("falls back to the domain and aligns naturally without a thumbnail", () => {
    const fallbackRow = { ...row, source: "   ", thumbnail: undefined };
    const html = renderToStaticMarkup(
      createElement(WebAnalysisMobileResultItem, {
        row: fallbackRow,
        isPreview: false,
      })
    );
    const $ = cheerio.load(html);

    expect(webAnalysisSourceLabel(fallbackRow)).toBe(row.domain);
    expect($("[data-mobile-web-analysis-source]").text()).toBe(row.domain);
    expect($("img")).toHaveLength(0);
  });

  it("uses the domain when an unvalidated response omits the source", () => {
    expect(
      webAnalysisSourceLabel({ source: null, domain: row.domain } as never)
    ).toBe(row.domain);
  });

  it("preserves the guest-preview login guard link", () => {
    const onLoginRequired = vi.fn();
    const html = renderToStaticMarkup(
      createElement(WebAnalysisMobileResultItem, {
        row,
        isPreview: true,
        onLoginRequired,
      })
    );
    const $ = cheerio.load(html);
    const titleLink = $("[data-mobile-web-analysis-title-link]");

    expect(titleLink.attr("href")).toBe("#login-required");
    expect(titleLink.attr("target")).toBeUndefined();
    expect(titleLink.attr("rel")).toBeUndefined();
  });
});
