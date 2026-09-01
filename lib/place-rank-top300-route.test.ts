import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateKeyword: vi.fn(),
  collect: vi.fn(),
}));

vi.mock("@/lib/place-rank-top300", () => ({
  validateTop300Keyword: mocks.validateKeyword,
  collectNaverPlaceTop300: mocks.collect,
}));

import { maxDuration, POST } from "@/app/api/rank-analysis/route";

describe("rank analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.validateKeyword.mockReturnValue({
      ok: true,
      keyword: "한남동 맛집",
    });
    mocks.collect.mockResolvedValue({
      keyword: "한남동 맛집",
      total: 300,
      availableTotal: 520,
      results: [{ rank: 1, placeId: "1", name: "첫 매장", category: "한식" }],
      searchMode: "restaurant",
      source: "pcmap-place-list",
      naverRequestCount: 1,
      requestOperationCount: 5,
      requestedStarts: [1, 71, 141, 211, 281],
      completedPages: 5,
      duplicateCount: 0,
      invalidItemCount: 0,
      partial: false,
    });
  });

  it("returns the lightweight TOP300 result without caching", async () => {
    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "한남동 맛집" }),
      })
    );
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.collect).toHaveBeenCalledWith("한남동 맛집");
    expect(body).toMatchObject({
      ok: true,
      keyword: "한남동 맛집",
      total: 300,
      naverRequestCount: 1,
    });
  });

  it("always uses the PC collector even if a client sends a device field", async () => {
    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "한남동 맛집", device: "mobile" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.collect).toHaveBeenCalledWith("한남동 맛집");
  });

  it("rejects an invalid keyword before collection", async () => {
    mocks.validateKeyword.mockReturnValue({
      ok: false,
      message: "검색 키워드를 입력해주세요.",
    });

    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "" }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
