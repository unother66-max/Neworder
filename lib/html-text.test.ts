import { describe, expect, it } from "vitest";

import { decodeHtmlText } from "./html-text";

describe("decodeHtmlText", () => {
  it("renders encoded ampersands as ordinary text", () => {
    expect(decodeHtmlText("라온휘트니스&amp;필라테스")).toBe(
      "라온휘트니스&필라테스"
    );
    expect(decodeHtmlText("TM광택&amp;amp;스팀세차")).toBe(
      "TM광택&스팀세차"
    );
  });

  it("decodes numeric text entities without using HTML injection", () => {
    expect(decodeHtmlText("A&#38;B &#x26; C")).toBe("A&B & C");
  });
});
