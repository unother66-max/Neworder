import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchBestPcmapBusinessesBatchJson: vi.fn(),
}));

vi.mock("@/lib/pcmap-businesses-batch-fetch", () => ({
  fetchBestPcmapBusinessesBatchJson:
    mocks.fetchBestPcmapBusinessesBatchJson,
}));

import { POST } from "@/app/api/pcmap-businesses-batch/route";

function request() {
  return new Request("http://localhost/api/pcmap-businesses-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keyword: "한남동 맛집" }),
  });
}

describe("pcmap-businesses-batch route new-opening schema", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the live Gallant field with schema version 2", async () => {
    const batch = [
      {
        data: {
          places: {
            items: [
              {
                id: "2035306921",
                name: "갈란트",
                newOpening: true,
              },
            ],
          },
        },
      },
    ];
    mocks.fetchBestPcmapBusinessesBatchJson.mockResolvedValue({
      batch,
      mode: "original",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      schemaVersion: 2,
      hasNewOpeningField: true,
      itemCount: 1,
      batch,
    });
  });

  it("does not return a fieldless legacy batch as a current response", async () => {
    mocks.fetchBestPcmapBusinessesBatchJson.mockResolvedValue({
      batch: [
        {
          data: {
            places: {
              items: [{ id: "2035306921", name: "갈란트" }],
            },
          },
        },
      ],
      mode: "original",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(body).toMatchObject({
      schemaVersion: 2,
      hasNewOpeningField: false,
      itemCount: 1,
      batch: null,
    });
  });
});
