import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateKeyword: vi.fn(),
  collectResults: vi.fn(),
  saveSnapshot: vi.fn(),
  loadHistory: vi.fn(),
}));

vi.mock("@/lib/require-auth-api", () => ({
  requireAuthApi: mocks.requireAuth,
}));

vi.mock("@/lib/web-analysis", () => ({
  validateWebAnalysisKeyword: mocks.validateKeyword,
  collectNaverWebResults: mocks.collectResults,
}));

vi.mock("@/lib/web-analysis-snapshot", () => ({
  saveWebAnalysisSnapshot: mocks.saveSnapshot,
  loadWebAnalysisRankHistory: mocks.loadHistory,
  WEB_ANALYSIS_PARTIAL_SNAPSHOT_MESSAGE:
    "일부 결과만 수집되어 순위 기록은 저장하지 않았습니다.",
  WEB_ANALYSIS_SNAPSHOT_SAVE_FAILED_MESSAGE: "순위 기록 저장에 실패했습니다.",
}));

import { POST, maxDuration } from "@/app/api/web-analysis/route";

describe("web analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
    });
    mocks.validateKeyword.mockReturnValue({
      ok: true,
      keyword: "뉴오더클럽한남",
    });
    mocks.saveSnapshot.mockResolvedValue({
      currentDate: "2026-09-08",
      snapshots: [],
    });
    mocks.loadHistory.mockResolvedValue({
      currentDate: "2026-09-08",
      snapshots: [],
    });
  });

  it("saves the complete result, including Naver blogs, once", async () => {
    const results = [
      {
        collectedIndex: 1,
        url: "https://example.com/a",
        domain: "example.com",
        source: "웹사이트",
      },
      {
        collectedIndex: 2,
        url: "https://blog.naver.com/b",
        domain: "blog.naver.com",
        source: "네이버 블로그",
      },
    ];
    mocks.collectResults.mockResolvedValue({
      keyword: "뉴오더클럽한남",
      requestedPages: [2, 3],
      successfulPages: [2, 3],
      failedPages: [],
      failures: [],
      totalResults: 2,
      results,
    });

    const response = await POST(
      new Request("http://localhost/api/web-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: "뉴오더클럽한남" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.saveSnapshot).toHaveBeenCalledWith({
      keyword: "뉴오더클럽한남",
      results,
    });
    expect(mocks.loadHistory).not.toHaveBeenCalled();
    expect(body.snapshotSaved).toBe(true);
    expect(body.snapshotWarning).toBeNull();
  });

  it("does not overwrite a snapshot when any requested page failed", async () => {
    mocks.collectResults.mockResolvedValue({
      keyword: "뉴오더클럽한남",
      requestedPages: [2, 3],
      successfulPages: [2],
      failedPages: [3],
      failures: [{ page: 3, message: "failed" }],
      totalResults: 1,
      results: [{ collectedIndex: 1, url: "https://example.com/a" }],
    });

    const response = await POST(
      new Request("http://localhost/api/web-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: "뉴오더클럽한남" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    expect(mocks.loadHistory).toHaveBeenCalledWith("뉴오더클럽한남");
    expect(body.snapshotSaved).toBe(false);
    expect(body.snapshotWarning).toContain("일부 결과만 수집");
  });

  it("rejects a guest before validating or collecting web results", async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: "로그인이 필요한 기능입니다." },
        { status: 401 }
      ),
    });

    const response = await POST(
      new Request("http://localhost/api/web-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: "뉴오더클럽한남" }),
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.validateKeyword).not.toHaveBeenCalled();
    expect(mocks.collectResults).not.toHaveBeenCalled();
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
