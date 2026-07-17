import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  placeFindMany: vi.fn(),
  historyCreate: vi.fn(),
  fetchRank: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    place: { findMany: mocks.placeFindMany },
    rankHistory: { create: mocks.historyCreate },
  },
}));

vi.mock("@/lib/kakao-keyword-rank", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kakao-keyword-rank")>();
  return {
    ...actual,
    fetchKakaoKeywordRankDiagnostic: mocks.fetchRank,
  };
});

import { GET } from "@/app/api/cron/kakao-keyword-tracking/route";
import { KakaoKeywordRankError } from "@/lib/kakao-keyword-rank";

function cronRequest(authorization?: string, extraHeaders?: HeadersInit) {
  return new Request("http://localhost/api/cron/kakao-keyword-tracking", {
    headers: {
      ...(authorization ? { authorization } : {}),
      ...extraHeaders,
    },
  });
}

function foundDiagnostic() {
  return {
    source: "KAKAO_LOCAL_KEYWORD" as const,
    keyword: "한남동 피자",
    targetPlaceName: "뉴오더클럽 한남",
    targetAddress: "서울 용산구 한남동",
    storedKakaoPlaceId: "12345",
    storedPlaceUrl: "https://place.map.kakao.com/12345",
    matchedKakaoPlaceId: "12345",
    matchedPlaceName: "뉴오더클럽 한남",
    matchedAddress: "서울 용산구 한남동",
    ranking: 5,
    page: 1,
    position: 5,
    totalFetchedCount: 15,
    dedupedCount: 15,
    checkedCount: 15,
    isMatched: true,
    reason: "FOUND" as const,
    debugReason: null,
  };
}

describe("kakao keyword tracking cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.placeFindMany.mockResolvedValue([]);
    mocks.historyCreate.mockResolvedValue({ id: "history-1" });
  });

  it("rejects a request without the CRON_SECRET bearer token", async () => {
    const response = await GET(
      cronRequest(undefined, { "x-vercel-cron": "1" })
    );

    expect(response.status).toBe(401);
    expect(mocks.placeFindMany).not.toHaveBeenCalled();
  });

  it("returns 200 for an authorized invocation with no targets", async () => {
    const response = await GET(cronRequest("Bearer test-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      totalPlaces: 0,
      totalKeywords: 0,
      savedCount: 0,
      failedCount: 0,
    });
    expect(mocks.placeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "kakao-place",
          keywords: { some: { isTracking: true } },
        },
      })
    );
  });

  it("uses the current Kakao diagnostic and saves its rank metadata", async () => {
    mocks.placeFindMany.mockResolvedValue([
      {
        id: "place-1",
        name: "뉴오더클럽 한남",
        address: "서울 용산구 한남동",
        placeUrl: "https://place.map.kakao.com/12345",
        keywords: [{ id: "keyword-1", keyword: "한남동 피자" }],
      },
    ]);
    mocks.fetchRank.mockResolvedValue(foundDiagnostic());

    const response = await GET(cronRequest("Bearer test-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      totalPlaces: 1,
      totalKeywords: 1,
      savedCount: 1,
      failedCount: 0,
    });
    expect(mocks.fetchRank).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "한남동 피자",
        targetPlaceName: "뉴오더클럽 한남",
        storedKakaoPlaceId: "12345",
      })
    );
    expect(mocks.historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        placeId: "place-1",
        keyword: "한남동 피자",
        rank: 5,
        source: "KAKAO_LOCAL_KEYWORD",
        resultStatus: "FOUND",
        rankLabel: "5위",
        matchedId: "12345",
      }),
    });
  });

  it("does not create a history row when the Kakao request fails", async () => {
    mocks.placeFindMany.mockResolvedValue([
      {
        id: "place-1",
        name: "뉴오더클럽 한남",
        address: "서울 용산구 한남동",
        placeUrl: "https://place.map.kakao.com/12345",
        keywords: [{ id: "keyword-1", keyword: "한남동 피자" }],
      },
    ]);
    mocks.fetchRank.mockRejectedValue(
      new KakaoKeywordRankError("HTTP_FAILED", "Kakao HTTP 429", {
        httpStatus: 429,
        page: 1,
      })
    );

    const response = await GET(cronRequest("Bearer test-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      savedCount: 0,
      failedCount: 1,
      results: [
        expect.objectContaining({
          saved: false,
          reason: "HTTP_FAILED",
          rank: null,
        }),
      ],
    });
    expect(mocks.historyCreate).not.toHaveBeenCalled();
  });
});
