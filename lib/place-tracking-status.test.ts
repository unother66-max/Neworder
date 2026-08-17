import { describe, expect, it } from "vitest";
import { summarizePlaceRankTracking } from "@/lib/place-tracking-status";

describe("summarizePlaceRankTracking", () => {
  const reference = new Date("2026-08-17T00:30:00.000Z"); // KST 09:30

  it("reports partial coverage using only today's tracked keyword successes", () => {
    const summary = summarizePlaceRankTracking({
      reference,
      keywords: [
        { keyword: "한남동 맛집", isTracking: true },
        { keyword: "한남동 데이트", isTracking: true },
        { keyword: "추적 안 함", isTracking: false },
      ],
      histories: [
        {
          keyword: "한남동 데이트",
          createdAt: "2026-08-16T18:32:42.000Z",
        },
        {
          keyword: "한남동 맛집",
          createdAt: "2026-08-15T18:32:42.000Z",
        },
        {
          keyword: "추적 안 함",
          createdAt: "2026-08-16T18:40:00.000Z",
        },
      ],
    });

    expect(summary).toMatchObject({
      trackingKeywordCount: 2,
      todayTrackingSuccessCount: 1,
      trackingUpdateStatus: "PARTIAL",
      trackingMode: "MIXED",
    });
    expect(summary.latestSuccessAt?.toISOString()).toBe(
      "2026-08-16T18:40:00.000Z"
    );
  });

  it("deduplicates multiple histories for one keyword on the same day", () => {
    const summary = summarizePlaceRankTracking({
      reference,
      keywords: [{ keyword: "한남동 맛집", isTracking: true }],
      histories: [
        {
          keyword: "한남동 맛집",
          createdAt: "2026-08-16T18:30:00.000Z",
        },
        {
          keyword: "한남동 맛집",
          createdAt: "2026-08-16T20:30:00.000Z",
        },
      ],
    });

    expect(summary.todayTrackingSuccessCount).toBe(1);
    expect(summary.trackingUpdateStatus).toBe("COMPLETE");
  });

  it("uses the Seoul midnight boundary", () => {
    const summary = summarizePlaceRankTracking({
      reference,
      keywords: [{ keyword: "한남동 맛집", isTracking: true }],
      histories: [
        {
          keyword: "한남동 맛집",
          createdAt: "2026-08-16T14:59:59.999Z",
        },
      ],
    });

    expect(summary.todayTrackingSuccessCount).toBe(0);
    expect(summary.trackingUpdateStatus).toBe("PENDING");
  });

  it("reports off when no keyword is tracked", () => {
    expect(
      summarizePlaceRankTracking({
        reference,
        keywords: [{ keyword: "한남동 맛집", isTracking: false }],
        histories: [],
      })
    ).toMatchObject({
      trackingKeywordCount: 0,
      todayTrackingSuccessCount: 0,
      trackingUpdateStatus: "OFF",
      trackingMode: "OFF",
      latestSuccessAt: null,
    });
  });
});
