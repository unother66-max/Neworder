import { describe, expect, it, vi } from "vitest";

import {
  loadWebAnalysisRankHistory,
  saveWebAnalysisSnapshot,
  type WebAnalysisSnapshotDelegate,
} from "@/lib/web-analysis-snapshot";

function createDelegate(
  stored: Array<{ snapshotDate: string; rankedUrls: unknown }> = []
) {
  return {
    upsert: vi.fn(async () => ({ id: "snapshot-1" })),
    findMany: vi.fn(async () => stored),
  } satisfies WebAnalysisSnapshotDelegate;
}

describe("web analysis snapshot persistence", () => {
  const reference = new Date("2026-09-07T15:30:00.000Z");

  it("upserts one same-day row by keyword and KST snapshot date", async () => {
    const delegate = createDelegate([
      { snapshotDate: "2026-09-07", rankedUrls: ["https://old.test/a"] },
    ]);

    const history = await saveWebAnalysisSnapshot(
      {
        keyword: "한남동 맛집",
        results: [
          { collectedIndex: 2, url: "https://blog.naver.com/b" },
          { collectedIndex: 1, url: "https://example.com/a" },
        ],
      },
      { reference, delegate }
    );

    expect(delegate.upsert).toHaveBeenCalledWith({
      where: {
        keyword_snapshotDate: {
          keyword: "한남동 맛집",
          snapshotDate: "2026-09-08",
        },
      },
      create: {
        keyword: "한남동 맛집",
        snapshotDate: "2026-09-08",
        rankedUrls: ["https://example.com/a", "https://blog.naver.com/b"],
      },
      update: {
        rankedUrls: ["https://example.com/a", "https://blog.naver.com/b"],
      },
      select: { id: true },
    });
    expect(history.snapshots[0]?.daysAgo).toBe(1);
  });

  it("loads comparison history without writing a snapshot", async () => {
    const delegate = createDelegate([
      { snapshotDate: "2026-09-07", rankedUrls: ["https://example.com/a"] },
    ]);

    const history = await loadWebAnalysisRankHistory("한남동 맛집", {
      reference,
      delegate,
    });

    expect(delegate.upsert).not.toHaveBeenCalled();
    expect(history.snapshots).toEqual([
      {
        daysAgo: 1,
        snapshotDate: "2026-09-07",
        rankedUrls: ["https://example.com/a"],
      },
    ]);
  });
});
