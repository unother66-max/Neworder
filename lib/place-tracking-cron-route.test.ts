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

import { GET } from "@/app/api/cron/place-tracking/route";

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
    });
  });
});

