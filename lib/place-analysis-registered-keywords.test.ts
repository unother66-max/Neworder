import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  normalizePlaceAnalysisRegisteredKeywords,
  PlaceAnalysisRegisteredKeywords,
} from "@/components/place-analysis-registered-keywords";

const nopsKeywords = [
  { keyword: "한남동스테이크", volume: 1690, volumeStatus: "AVAILABLE" as const },
  { keyword: "한남동파스타", volume: 1550, volumeStatus: "AVAILABLE" as const },
  { keyword: "한남동와인", volume: 630, volumeStatus: "AVAILABLE" as const },
  { keyword: "한남동양식", volume: 550, volumeStatus: "AVAILABLE" as const },
  { keyword: "한남스테이크", volume: 320, volumeStatus: "AVAILABLE" as const },
];

describe("place-analysis registered keyword display", () => {
  it("renders all five registered keywords in volume order", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlaceAnalysisRegisteredKeywords, {
        keywords: nopsKeywords,
        emptyLabel: "-",
      })
    );

    expect(html).toContain('data-registered-keyword="한남동스테이크"');
    expect(html).toContain('data-registered-keyword="한남동파스타"');
    expect(html).toContain('data-registered-keyword="한남동와인"');
    expect(html).toContain('data-registered-keyword="한남동양식"');
    expect(html).toContain('data-registered-keyword="한남스테이크"');
    expect(html).toContain("1,690");
    expect(html).toContain("1,550");
    expect(html).toContain("한남동양식 550");
    expect(html).toContain("한남스테이크 320");
  });

  it("shows zero, pending, and unavailable volume states distinctly", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlaceAnalysisRegisteredKeywords, {
        keywords: [
          { keyword: "실제검색량0", volume: 0, volumeStatus: "ZERO" },
          {
            keyword: "보강대기키워드",
            volume: null,
            volumeStatus: "PENDING",
          },
          {
            keyword: "미수집키워드",
            volume: null,
            volumeStatus: "UNAVAILABLE",
          },
        ],
        emptyLabel: "-",
      })
    );

    expect(html).toContain("실제검색량0");
    expect(html).toMatch(/실제검색량0[\s\S]*?>0</);
    expect(html).toMatch(/보강대기키워드[\s\S]*?>수집 대기</);
    expect(html).toMatch(/미수집키워드[\s\S]*?>-</);
  });

  it("keeps one cached volume and four pending values visible", () => {
    const normalized = normalizePlaceAnalysisRegisteredKeywords({
      registeredKeywords: [
        { keyword: "한남동스테이크", volume: null, volumeStatus: "PENDING" },
        { keyword: "한남동와인", volume: null, volumeStatus: "PENDING" },
        { keyword: "한남동양식", volume: 550, volumeStatus: "AVAILABLE" },
        { keyword: "한남동파스타", volume: null, volumeStatus: "PENDING" },
        { keyword: "한남스테이크", volume: null, volumeStatus: "PENDING" },
      ],
      registeredKeywordsStatus: "AVAILABLE",
    });
    expect(normalized?.map((item) => item.volumeStatus)).toEqual([
      "AVAILABLE",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
    ]);

    const html = renderToStaticMarkup(
      React.createElement(PlaceAnalysisRegisteredKeywords, {
        keywords: normalized,
        emptyLabel: "-",
      })
    );
    expect(html).toContain('data-registered-keyword="한남동양식"');
    expect(html).toContain('data-registered-keyword="한남동스테이크"');
    expect(html).toContain('data-registered-keyword="한남동와인"');
    expect(html).toContain('data-registered-keyword="한남동파스타"');
    expect(html).toContain('data-registered-keyword="한남스테이크"');
    expect(html).toContain("한남동파스타 수집 대기");
    expect(html).toContain("한남스테이크 수집 대기");
  });

  it("supports a legacy string response but never accepts review keywords as input", () => {
    const legacy = normalizePlaceAnalysisRegisteredKeywords({
      registeredKeywords: ["한남동데이트", "화덕피자"],
      registeredKeywordsStatus: "AVAILABLE",
      legacyKeywords: ["피자가 맛있어요"],
    });
    const unavailable = normalizePlaceAnalysisRegisteredKeywords({
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
      legacyKeywords: ["피자가 맛있어요"],
    });

    expect(legacy?.map((item) => item.keyword)).toEqual([
      "한남동데이트",
      "화덕피자",
    ]);
    expect(legacy?.some((item) => item.keyword === "피자가 맛있어요")).toBe(
      false
    );
    expect(unavailable).toBeNull();
  });

  it("deduplicates normalized keyword labels before rendering", () => {
    const normalized = normalizePlaceAnalysisRegisteredKeywords({
      registeredKeywords: [
        " 한남동맛집 ",
        "한남동맛집",
        "화덕피자",
      ],
      registeredKeywordsStatus: "AVAILABLE",
    });

    expect(normalized?.map((item) => item.keyword)).toEqual([
      "한남동맛집",
      "화덕피자",
    ]);
  });

  it("keeps cached keywords visible regardless of queue state outside the data list", () => {
    const normalized = normalizePlaceAnalysisRegisteredKeywords({
      registeredKeywords: nopsKeywords,
      registeredKeywordsStatus: "AVAILABLE",
    });
    expect(normalized?.slice(0, 3).map((item) => item.keyword)).toEqual([
      "한남동스테이크",
      "한남동파스타",
      "한남동와인",
    ]);
  });
});
