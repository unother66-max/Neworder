import { describe, expect, it } from "vitest";

import {
  normalizeStringArray,
  parseLines,
} from "@/lib/neworder/item-keywords";

describe("NewOrder item keyword helpers", () => {
  it("trims, removes blank lines, and deduplicates textarea values", () => {
    expect(parseLines(" 트러플 오일\n\n송로버섯 오일\r\n트러플 오일 ")).toEqual([
      "트러플 오일",
      "송로버섯 오일",
    ]);
  });

  it("normalizes arrays, strings, null, and undefined", () => {
    expect(normalizeStringArray([" a ", "", "a", "b"])).toEqual(["a", "b"]);
    expect(normalizeStringArray("a\nb\na")).toEqual(["a", "b"]);
    expect(normalizeStringArray(null)).toEqual([]);
    expect(normalizeStringArray(undefined)).toEqual([]);
  });

  it("supports comma-separated legacy exclusion keywords", () => {
    expect(normalizeStringArray("무료배송, 해외직구; 중고", /[,;\r\n]+/)).toEqual([
      "무료배송",
      "해외직구",
      "중고",
    ]);
  });
});
