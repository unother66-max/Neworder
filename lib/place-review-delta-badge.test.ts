import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getReviewDeltaPresentation,
  PlaceReviewDeltaBadge,
} from "@/components/place-review-delta-badge";

describe("place review delta badge", () => {
  it.each([
    [1_234, "increase", "▲ 1,234", "1,234개 증가"],
    [-1_234, "decrease", "▼ 1,234", "1,234개 감소"],
    [0, "flat", "-", "전일 대비 변화 없음"],
    [null, "unavailable", "-", "비교할 전일 기록 없음"],
  ] as const)(
    "renders %s as a readable %s badge",
    (value, direction, label, accessibleLabel) => {
      const html = renderToStaticMarkup(
        React.createElement(PlaceReviewDeltaBadge, { value })
      );

      expect(html).toContain(`data-review-delta="${direction}"`);
      expect(html).toContain(label);
      expect(html).toContain(accessibleLabel);
    }
  );

  it("formats a large positive change as a compact upward indicator", () => {
    expect(getReviewDeltaPresentation(1_234_567)).toMatchObject({
      direction: "increase",
      label: "▲ 1,234,567",
    });
  });

  it("uses inline text rather than the previous pill treatment", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlaceReviewDeltaBadge, { value: 3 })
    );

    expect(html).toContain("text-[#ef4444]");
    expect(html).not.toContain("rounded-full");
    expect(html).not.toContain("border");
  });
});
