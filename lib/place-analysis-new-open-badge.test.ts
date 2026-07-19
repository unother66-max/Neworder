import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlaceAnalysisNewOpenBadge } from "@/components/place-analysis-new-open-badge";

describe("PlaceAnalysisNewOpenBadge", () => {
  it("renders 새로오픈 for the observed Gallant fixture", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceAnalysisNewOpenBadge, {
        place: {
          isNewOpen: true,
          newOpenLabel: "새로오픈",
        },
      })
    );

    expect(html).toContain("새로오픈");
    expect(html).toContain("bg-red-50");
  });

  it("renders nothing for false, null, and legacy missing fields", () => {
    for (const place of [
      { isNewOpen: false },
      { isNewOpen: null },
      {},
    ]) {
      expect(
        renderToStaticMarkup(
          createElement(PlaceAnalysisNewOpenBadge, { place })
        )
      ).toBe("");
    }
  });
});
