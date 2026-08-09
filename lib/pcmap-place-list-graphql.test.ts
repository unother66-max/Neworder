import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPcmapPlaceListGraphql } from "./pcmap-place-list-graphql";

describe("fetchPcmapPlaceListGraphql", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves the query and finds 소풍동물원 at rank 2", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            data: {
              placeList: {
                businesses: {
                  total: 9,
                  items: [
                    {
                      id: "943647156",
                      name: "삼층고양이카페",
                      category: "고양이카페",
                    },
                    {
                      id: "36192987",
                      name: "소풍동물원",
                      category: "키즈카페,실내놀이터",
                    },
                  ],
                },
              },
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPcmapPlaceListGraphql({
      keyword: "평택 동물체험",
      targetName: "소풍동물원",
      x: "127.072",
      y: "37.117",
      maxPages: 4,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const [payload] = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      operationName: "getPlacesList",
      variables: {
        input: {
          businessType: "place",
          query: "평택 동물체험",
          x: "127.072",
          y: "37.117",
        },
      },
    });
    expect(result).toMatchObject({
      status: "FOUND",
      source: "getPlacesList",
      rank: 2,
      parsedCount: 2,
      targetName: "소풍동물원",
    });
  });
});

