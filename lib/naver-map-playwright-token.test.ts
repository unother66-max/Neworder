import { describe, expect, it } from "vitest";
import { parseTokenFromAllSearchUrl } from "./naver-map-playwright-token";

describe("parseTokenFromAllSearchUrl", () => {
  it("parses token from allSearch URL", () => {
    const u =
      "https://map.naver.com/p/api/search/allSearch?query=a&type=all&token=abc123456789&x=1";
    expect(parseTokenFromAllSearchUrl(u)).toBe("abc123456789");
  });

  it("returns null for short token", () => {
    const u =
      "https://map.naver.com/p/api/search/allSearch?query=a&token=short";
    expect(parseTokenFromAllSearchUrl(u)).toBeNull();
  });

  it("returns null for non-allSearch", () => {
    expect(parseTokenFromAllSearchUrl("https://example.com/?token=abcdefghijklmn")).toBeNull();
  });
});
