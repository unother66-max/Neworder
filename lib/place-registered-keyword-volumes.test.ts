import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    keywordSearchVolumeCache: {
      findMany: mocks.findMany,
    },
  },
}));

import { keywordVolumeCacheKey } from "@/lib/getKeywordSearchVolume";
import {
  buildRegisteredKeywordsWithVolumes,
  loadRegisteredKeywordVolumeCache,
  missingRegisteredKeywordVolumes,
} from "@/lib/place-registered-keyword-volumes";

function volumeRow(
  keyword: string,
  totalVolume: number,
  options?: { confirmedZero?: boolean }
) {
  return {
    id: `volume-${keyword}`,
    keyword,
    normalizedKeyword: keywordVolumeCacheKey(keyword),
    monthlyPcQcCnt: 0,
    monthlyMobileQcCnt: totalVolume,
    totalVolume,
    belowThreshold: totalVolume < 250,
    source: "naver-searchad",
    checkedAt: new Date("2026-07-19T00:00:00.000Z"),
    raw:
      totalVolume > 0 || options?.confirmedZero
        ? { matchedKeyword: keyword }
        : { reason: "not-found" },
  };
}

describe("place registered keyword volumes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("batch-loads the existing global volume cache without a SearchAD request", async () => {
    const rows = [volumeRow("한남동스테이크", 1690)];
    mocks.findMany.mockResolvedValue(rows);

    const result = await loadRegisteredKeywordVolumeCache([
      "한남동스테이크",
      "한남동 스테이크",
    ]);

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        normalizedKeyword: {
          in: [keywordVolumeCacheKey("한남동스테이크")],
        },
      },
    });
    expect(result.loadStatus).toBe("AVAILABLE");
    expect(result.rows.get(keywordVolumeCacheKey("한남동스테이크"))).toEqual(
      rows[0]
    );
  });

  it("sorts the 놉스 대표키워드 by volume while retaining every keyword", () => {
    const rows = [
      volumeRow("한남동스테이크", 1690),
      volumeRow("한남동와인", 630),
      volumeRow("한남동양식", 560),
      volumeRow("한남동파스타", 1550),
      volumeRow("한남스테이크", 320),
    ];
    const cache = {
      rows: new Map(rows.map((row) => [row.normalizedKeyword, row])),
      loadStatus: "AVAILABLE" as const,
    };

    const result = buildRegisteredKeywordsWithVolumes(
      [
        "한남동스테이크",
        "한남동와인",
        "한남동양식",
        "한남동파스타",
        "한남스테이크",
      ],
      cache
    );

    expect(result).toEqual([
      { keyword: "한남동스테이크", volume: 1690, volumeStatus: "AVAILABLE" },
      { keyword: "한남동파스타", volume: 1550, volumeStatus: "AVAILABLE" },
      { keyword: "한남동와인", volume: 630, volumeStatus: "AVAILABLE" },
      { keyword: "한남동양식", volume: 560, volumeStatus: "AVAILABLE" },
      { keyword: "한남스테이크", volume: 320, volumeStatus: "AVAILABLE" },
    ]);
  });

  it("distinguishes a confirmed zero from an unavailable legacy zero", () => {
    const confirmedZero = volumeRow("실제검색량0", 0, {
      confirmedZero: true,
    });
    const unknownZero = volumeRow("미수집키워드", 0);
    const cache = {
      rows: new Map([
        [confirmedZero.normalizedKeyword, confirmedZero],
        [unknownZero.normalizedKeyword, unknownZero],
      ]),
      loadStatus: "AVAILABLE" as const,
    };

    const result = buildRegisteredKeywordsWithVolumes(
      ["실제검색량0", "미수집키워드", "캐시없음"],
      cache
    );

    expect(result).toEqual([
      { keyword: "실제검색량0", volume: 0, volumeStatus: "ZERO" },
      { keyword: "미수집키워드", volume: null, volumeStatus: "UNAVAILABLE" },
      { keyword: "캐시없음", volume: null, volumeStatus: "PENDING" },
    ]);
    expect(missingRegisteredKeywordVolumes(result)).toEqual([
      "미수집키워드",
      "캐시없음",
    ]);
  });

  it("keeps unavailable and actually empty registered-keyword states distinct", () => {
    const emptyCache = {
      rows: new Map(),
      loadStatus: "AVAILABLE" as const,
    };
    expect(buildRegisteredKeywordsWithVolumes(null, emptyCache)).toBeNull();
    expect(buildRegisteredKeywordsWithVolumes([], emptyCache)).toEqual([]);
  });

  it("uses UNAVAILABLE rather than PENDING when the cache lookup itself fails", async () => {
    mocks.findMany.mockRejectedValue(new Error("db unavailable"));
    const cache = await loadRegisteredKeywordVolumeCache(["한남동스테이크"]);

    expect(cache.loadStatus).toBe("UNAVAILABLE");
    expect(
      buildRegisteredKeywordsWithVolumes(["한남동스테이크"], cache)
    ).toEqual([
      {
        keyword: "한남동스테이크",
        volume: null,
        volumeStatus: "UNAVAILABLE",
      },
    ]);
  });
});
