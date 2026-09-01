import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateKeyword: vi.fn(),
  collectResults: vi.fn(),
}));

vi.mock("@/lib/web-analysis", () => ({
  validateWebAnalysisKeyword: mocks.validateKeyword,
  collectNaverWebResults: mocks.collectResults,
}));

import { POST, maxDuration } from "@/app/api/web-analysis/route";

describe("web analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateKeyword.mockReturnValue({
      ok: true,
      keyword: "뉴오더클럽한남",
    });
  });

  it("returns a friendly 502 response when every page fails", async () => {
    mocks.collectResults.mockResolvedValue({
      keyword: "뉴오더클럽한남",
      requestedPages: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      successfulPages: [],
      failedPages: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      failures: [
        { page: 2, message: "네이버가 해당 페이지 요청을 제한했습니다." },
      ],
      totalResults: 0,
      results: [],
    });

    const response = await POST(
      new Request("http://localhost/api/web-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: "뉴오더클럽한남" }),
      })
    );
    const body = await response.json();

    expect(maxDuration).toBe(60);
    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.message).toContain("잠시 후 다시 시도해주세요");
    expect(body.failedPages).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
