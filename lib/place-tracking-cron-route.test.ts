import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  rankHistoryCreate: vi.fn(),
  keywordUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    placeKeyword: {
      findMany: mocks.findMany,
      update: mocks.keywordUpdate,
    },
    rankHistory: {
      create: mocks.rankHistoryCreate,
    },
  },
}));

import { GET, maxDuration } from "@/app/api/cron/place-tracking/route";
import { interleaveTrackedKeywordsByPlace } from "@/lib/place-tracking-cron";

describe("place tracking cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findMany.mockResolvedValue([
      {
        id: "keyword-1",
        placeId: "place-1",
        keyword: "평택 동물체험",
        isTracking: true,
        place: {
          name: "소풍동물원",
          category: "키즈카페,실내놀이터",
          x: "127.072",
          y: "37.117",
        },
      },
    ]);
    mocks.rankHistoryCreate.mockResolvedValue({ id: "history-1" });
    mocks.keywordUpdate.mockResolvedValue({ id: "keyword-1" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the full function budget and only selects stale Naver rank keywords", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, canSaveRank: true, rank: "2" })
      )
    );

    await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );

    expect(maxDuration).toBe(300);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        isTracking: true,
        place: { type: "rank" },
      },
      include: { place: true },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
  });

  it("round-robins keywords across places instead of exhausting one place first", () => {
    const scheduled = interleaveTrackedKeywordsByPlace([
      { id: "place-1-keyword-1", placeId: "place-1" },
      { id: "place-1-keyword-2", placeId: "place-1" },
      { id: "place-1-keyword-3", placeId: "place-1" },
      { id: "place-2-keyword-1", placeId: "place-2" },
      { id: "place-2-keyword-2", placeId: "place-2" },
      { id: "place-3-keyword-1", placeId: "place-3" },
    ]);

    expect(scheduled.map((item) => item.id)).toEqual([
      "place-1-keyword-1",
      "place-2-keyword-1",
      "place-3-keyword-1",
      "place-1-keyword-2",
      "place-2-keyword-2",
      "place-1-keyword-3",
    ]);
  });

  it("runs the fair queue with bounded concurrency and processes every keyword", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "place-1-keyword-1",
        placeId: "place-1",
        keyword: "첫 업체 키워드 1",
        isTracking: true,
        place: { name: "첫 업체", category: null, x: null, y: null },
      },
      {
        id: "place-1-keyword-2",
        placeId: "place-1",
        keyword: "첫 업체 키워드 2",
        isTracking: true,
        place: { name: "첫 업체", category: null, x: null, y: null },
      },
      {
        id: "place-2-keyword-1",
        placeId: "place-2",
        keyword: "둘째 업체 키워드 1",
        isTracking: true,
        place: { name: "둘째 업체", category: null, x: null, y: null },
      },
      {
        id: "place-2-keyword-2",
        placeId: "place-2",
        keyword: "둘째 업체 키워드 2",
        isTracking: true,
        place: { name: "둘째 업체", category: null, x: null, y: null },
      },
    ]);
    const requestedKeywords: string[] = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      requestedKeywords.push(JSON.parse(String(init?.body)).keyword);
      await Promise.resolve();
      activeRequests -= 1;
      return Response.json({ ok: true, canSaveRank: true, rank: "3" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );
    const body = await response.json();

    expect(requestedKeywords).toEqual([
      "첫 업체 키워드 1",
      "둘째 업체 키워드 1",
      "첫 업체 키워드 2",
      "둘째 업체 키워드 2",
    ]);
    expect(maxActiveRequests).toBe(3);
    expect(body).toMatchObject({
      total: 4,
      attemptedCount: 4,
      successCount: 4,
      failCount: 0,
      skippedCount: 0,
      concurrency: 3,
    });
  });

  it("continues with other places when one rank cannot be saved", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "failed-keyword",
        placeId: "failed-place",
        keyword: "조회 실패 키워드",
        isTracking: true,
        place: { name: "조회 실패 업체", category: null, x: null, y: null },
      },
      {
        id: "saved-keyword",
        placeId: "saved-place",
        keyword: "조회 성공 키워드",
        isTracking: true,
        place: { name: "조회 성공 업체", category: null, x: null, y: null },
      },
    ]);
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const { keyword } = JSON.parse(String(init?.body));
      return keyword === "조회 실패 키워드"
        ? Response.json({
            ok: true,
            canSaveRank: false,
            rank: "-",
            failureCode: "PCMAP_GRAPHQL_FAILED",
          })
        : Response.json({ ok: true, canSaveRank: true, rank: "8" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.rankHistoryCreate).toHaveBeenCalledTimes(1);
    expect(mocks.keywordUpdate).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      total: 2,
      attemptedCount: 2,
      successCount: 1,
      failCount: 1,
      skippedCount: 0,
    });
  });

  it("stops starting work at the soft deadline and reports skipped keywords", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "keyword-1",
        placeId: "place-1",
        keyword: "키워드 1",
        isTracking: true,
        place: { name: "업체 1", category: null, x: null, y: null },
      },
      {
        id: "keyword-2",
        placeId: "place-2",
        keyword: "키워드 2",
        isTracking: true,
        place: { name: "업체 2", category: null, x: null, y: null },
      },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValue(286_001);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );
    const body = await response.json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      total: 2,
      attemptedCount: 0,
      successCount: 0,
      failCount: 0,
      skippedCount: 2,
    });
  });

  it("passes the registered place coordinates to the rank collector", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ ok: true, canSaveRank: true, rank: "2" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/place-tracking", {
        headers: { "x-vercel-cron": "1" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      total: 1,
      successCount: 1,
      failCount: 0,
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      keyword: "평택 동물체험",
      targetName: "소풍동물원",
      placeCategory: "키즈카페,실내놀이터",
      x: "127.072",
      y: "37.117",
      skipVolume: true,
    });
  });
});
