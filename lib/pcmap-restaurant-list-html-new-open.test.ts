import { describe, expect, it } from "vitest";

import { parsePcmapRestaurantListHtmlDiagnostic } from "./pcmap-restaurant-list-html-fetch";

describe("pcmap restaurant HTML Apollo new-opening parsing", () => {
  it("preserves Gallant newOpening through the ROOT_QUERY __ref", () => {
    const state = {
      "PlaceListBusinessesItem:2035306921:2035306921": {
        __typename: "PlaceListBusinessesItem",
        id: "2035306921",
        name: "갈란트",
        newOpening: true,
      },
      ROOT_QUERY: {
        __typename: "Query",
        'placeList({"input":{"query":"한남동 맛집","start":1}})': {
          businesses: {
            items: [
              {
                __ref: "PlaceListBusinessesItem:2035306921:2035306921",
              },
            ],
          },
        },
      },
    };
    const html = `<html><body><script>window.__APOLLO_STATE__ = ${JSON.stringify(
      state
    )};</script></body></html>`;

    const result = parsePcmapRestaurantListHtmlDiagnostic(html, "갈란트");

    expect(result.ok).toBe(true);
    expect(result.targetRank).toBe(1);
    expect(result.places[0]).toMatchObject({
      id: "2035306921",
      name: "갈란트",
      isNewOpen: true,
      newOpenLabel: "새로오픈",
    });
  });
});
