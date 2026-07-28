import { describe, expect, it } from "vitest";

import {
  getRegisteredKeywordEmptyLabel,
  getRegisteredKeywordProgressLabel,
  hasCollectedRegisteredKeywords,
  hasPendingRegisteredKeywordVolumes,
  isRegisteredKeywordCollectionDelayed,
} from "@/lib/place-analysis-registered-keyword-ui";

describe("place analysis registered keyword state labels", () => {
  it.each(["QUEUE_PENDING", "QUEUED", "PROCESSING"])(
    "shows waiting for %s",
    (status) => {
      expect(getRegisteredKeywordEmptyLabel(status)).toBe("수집 대기");
    }
  );

  it.each(["COLLECTION_DELAYED", "COOLDOWN_MISS", "CIRCUIT_OPEN_MISS"])(
    "shows delayed for %s",
    (status) => {
      expect(getRegisteredKeywordEmptyLabel(status)).toBe("수집 지연");
    }
  );

  it("shows a dash when no cache or collection state exists", () => {
    expect(getRegisteredKeywordEmptyLabel(null)).toBe("-");
  });

  it("counts representative keywords as collected even while volumes are pending", () => {
    const item = {
      registeredKeywordsStatus: "AVAILABLE",
      registeredKeywords: [
        {
          keyword: "한남동맛집",
          volume: null,
          volumeStatus: "PENDING",
        },
      ],
    };

    expect(hasCollectedRegisteredKeywords(item)).toBe(true);
    expect(hasPendingRegisteredKeywordVolumes(item)).toBe(true);
    expect(
      getRegisteredKeywordProgressLabel({
        total: 70,
        available: 70,
        pending: 0,
        volumePending: 13,
        running: false,
      })
    ).toBe(
      "대표키워드 70/70개 매장 반영 완료 · 검색량 13개 매장 추후 보완"
    );
  });

  it("does not call retryable collection work delayed when a polling budget ends", () => {
    expect(
      isRegisteredKeywordCollectionDelayed({
        queueStatus: "TIME_BUDGET",
        collectionPending: 64,
        retryableCollection: 64,
      })
    ).toBe(false);
    expect(
      getRegisteredKeywordProgressLabel({
        total: 70,
        available: 6,
        pending: 64,
        volumePending: 0,
        running: false,
        delayed: false,
      })
    ).toBe("대표키워드 6/70개 매장 반영 · 64개 수집 대기");
  });

  it("marks collection delayed only for a real cooldown or no retryable store", () => {
    expect(
      isRegisteredKeywordCollectionDelayed({
        queueStatus: "GLOBAL_COOLDOWN",
        collectionPending: 64,
        retryableCollection: 64,
      })
    ).toBe(true);
    expect(
      isRegisteredKeywordCollectionDelayed({
        queueStatus: "COMPLETED",
        collectionPending: 64,
        retryableCollection: 0,
      })
    ).toBe(true);
  });
});
