import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPcmapRestaurantsGraphqlDiagnostic } from "./pcmap-restaurants-graphql-diagnostic";

function graphqlResponse(items: Array<Record<string, unknown>>, total = 100) {
  return new Response(
    JSON.stringify([
      {
        data: {
          restaurants: {
            businesses: { total, items },
          },
        },
      },
    ]),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("fetchPcmapRestaurantsGraphqlDiagnostic", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stops after the page containing the target rank", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      graphqlResponse([
        { id: "1", name: "첫 매장" },
        { id: "2", name: "대상 매장" },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPcmapRestaurantsGraphqlDiagnostic({
      keyword: "한남동 맛집",
      targetName: "대상 매장",
      maxPages: 4,
      fallbackToHtml: false,
    });

    expect(result.status).toBe("FOUND");
    expect(result.rank).toBe(2);
    expect(result.completedPages).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops additional pages and fallback on an explicit CAPTCHA response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            errors: [{ message: "NCAPTCHA challenge required" }],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPcmapRestaurantsGraphqlDiagnostic({
      keyword: "한남동 맛집",
      targetName: "대상 매장",
      maxPages: 4,
      fallbackToHtml: false,
    });

    expect(result.status).toBe("PARTIAL_FAILED");
    expect(result.debugReason).toContain("NCAPTCHA");
    expect(result.pages).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
