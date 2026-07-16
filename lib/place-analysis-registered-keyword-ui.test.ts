import { describe, expect, it } from "vitest";

import { getRegisteredKeywordEmptyLabel } from "@/lib/place-analysis-registered-keyword-ui";

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
});
