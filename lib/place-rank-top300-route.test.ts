import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  validateKeyword: vi.fn(),
  collect: vi.fn(),
  saveSnapshot: vi.fn(),
}));

vi.mock("@/lib/require-auth-api", () => ({
  requireAuthApi: mocks.requireAuth,
}));

vi.mock("@/lib/place-rank-top300", () => ({
  validateTop300Keyword: mocks.validateKeyword,
  collectNaverPlaceTop300: mocks.collect,
}));

vi.mock("@/lib/place-rank-top300-snapshot", () => ({
  savePlaceRankTop300Snapshot: mocks.saveSnapshot,
  TOP300_SNAPSHOT_SAVE_FAILED_MESSAGE: "순위 기록 저장에 실패했습니다.",
  TOP300_PARTIAL_SNAPSHOT_MESSAGE:
    "일부 결과만 수집되어 순위 기록은 저장하지 않았습니다.",
}));

import { maxDuration, POST } from "@/app/api/rank-analysis/route";

describe("rank analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requireAuth.mockResolvedValue({
      ok: true,
      session: { user: { id: "user-1" } },
    });
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
    mocks.saveSnapshot.mockResolvedValue({
      currentDate: "2026-09-02",
      snapshots: [
        {
          daysAgo: 1,
          snapshotDate: "2026-09-01",
          rankedPlaceIds: ["2", "1"],
        },
      ],
    });
  });

  it("rejects a guest before validating or collecting ranks", async () => {
    mocks.requireAuth.mockResolvedValue({
      ok: false,
      response: Response.json(
        { ok: false, error: "로그인이 필요한 기능입니다." },
        { status: 401 }
      ),
    });

    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "한남동 맛집" }),
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.validateKeyword).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
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
      snapshotSaved: true,
      rankHistory: {
        currentDate: "2026-09-02",
        snapshots: [{ daysAgo: 1, snapshotDate: "2026-09-01" }],
      },
    });
    expect(mocks.saveSnapshot).toHaveBeenCalledWith(
      {
        keyword: "한남동 맛집",
        results: [
          expect.objectContaining({ rank: 1, placeId: "1" }),
        ],
      },
      { reference: expect.any(Date) }
    );
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
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("keeps the current TOP300 response when snapshot storage fails", async () => {
    mocks.saveSnapshot.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "한남동 맛집" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      keyword: "한남동 맛집",
      total: 300,
      snapshotSaved: false,
      snapshotWarning: "순위 기록 저장에 실패했습니다.",
    });
    expect(body.results).toHaveLength(1);
  });

  it("does not overwrite a complete snapshot with partial collection data", async () => {
    mocks.collect.mockResolvedValue({
      keyword: "한남동 맛집",
      total: 70,
      availableTotal: 520,
      results: [{ rank: 1, placeId: "1", name: "첫 매장", category: "한식" }],
      searchMode: "restaurant",
      source: "pcmap-place-list",
      naverRequestCount: 1,
      requestOperationCount: 5,
      requestedStarts: [1, 71, 141, 211, 281],
      completedPages: 1,
      duplicateCount: 0,
      invalidItemCount: 0,
      partial: true,
    });

    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "한남동 맛집" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      partial: true,
      snapshotSaved: false,
      snapshotWarning:
        "일부 결과만 수집되어 순위 기록은 저장하지 않았습니다.",
    });
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });

  it("does not attempt a snapshot when the Naver collector fails", async () => {
    mocks.collect.mockRejectedValue(new Error("NAVER_PCMAP_HTTP_500"));

    const response = await POST(
      new Request("http://localhost/api/rank-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: "한남동 맛집" }),
      })
    );

    expect(response.status).toBe(502);
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
  });
});
