import { describe, expect, it } from "vitest";

import {
  BAEMIN_MART_BASE_URL,
  isBaeminMartUrl,
} from "@/lib/neworder/sellers";

describe("NewOrder seller helpers", () => {
  it("accepts Baemin Mart product links", () => {
    expect(isBaeminMartUrl(BAEMIN_MART_BASE_URL)).toBe(true);
    expect(
      isBaeminMartUrl("https://mart.baemin.com/goods/detail/12345")
    ).toBe(true);
  });

  it("rejects non-Baemin Mart and malformed links", () => {
    expect(isBaeminMartUrl("https://baemin.com/")).toBe(false);
    expect(isBaeminMartUrl("https://mart.baemin.com.example.com/")).toBe(
      false
    );
    expect(isBaeminMartUrl("not-a-url")).toBe(false);
  });
});
