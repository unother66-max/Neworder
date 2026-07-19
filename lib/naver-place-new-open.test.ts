import { describe, expect, it } from "vitest";

import {
  PLACE_ANALYSIS_BATCH_SCHEMA_VERSION,
  filterNewOpenPlaces,
  getNewOpenBadgeLabel,
  parseNaverPlaceNewOpen,
  pcmapBatchHasNewOpeningField,
} from "./naver-place-new-open";
import {
  GET_PLACES_LIST_QUERY,
  buildGetPlacesListPagedBatch,
} from "./naver-map-businesses-shared";

describe("Naver place new-opening mapping", () => {
  it("maps the observed pcmap newOpening=true field", () => {
    expect(parseNaverPlaceNewOpen({ newOpening: true })).toEqual({
      isNewOpen: true,
      newOpenLabel: "새로오픈",
    });
  });

  it("does not render a label for an explicit false value", () => {
    expect(parseNaverPlaceNewOpen({ newOpening: false })).toEqual({
      isNewOpen: false,
      newOpenLabel: null,
    });
    expect(getNewOpenBadgeLabel({ isNewOpen: false })).toBeNull();
    expect(getNewOpenBadgeLabel({ isNewOpen: null })).toBeNull();
    expect(getNewOpenBadgeLabel({})).toBeNull();
  });

  it("keeps missing, null, and legacy values unknown", () => {
    expect(parseNaverPlaceNewOpen({})).toEqual({
      isNewOpen: null,
      newOpenLabel: null,
    });
    expect(parseNaverPlaceNewOpen({ newOpening: null })).toEqual({
      isNewOpen: null,
      newOpenLabel: null,
    });
    expect(parseNaverPlaceNewOpen(undefined)).toEqual({
      isNewOpen: null,
      newOpenLabel: null,
    });
  });

  it("filters only received rows and preserves their original ranks", () => {
    const rows = [
      { rank: 1, name: "일반 매장", isNewOpen: null },
      { rank: 2, name: "새 매장", isNewOpen: true },
      { rank: 3, name: "일반 확인", isNewOpen: false },
    ];

    expect(filterNewOpenPlaces(rows, true)).toEqual([
      { rank: 2, name: "새 매장", isNewOpen: true },
    ]);
    expect(filterNewOpenPlaces(rows, false)).toEqual(rows);
  });

  it("uses the server label only for an explicitly new-open item", () => {
    expect(
      getNewOpenBadgeLabel({
        isNewOpen: true,
        newOpenLabel: "새로오픈",
      })
    ).toBe("새로오픈");
    expect(getNewOpenBadgeLabel({ isNewOpen: true })).toBe("새로오픈");
  });

  it("requests newOpening in the actual first-priority getPlacesList query", () => {
    const batch = buildGetPlacesListPagedBatch(
      "한남동 맛집",
      { x: "127.0012", y: "37.5347" },
      1,
      30
    );

    expect(PLACE_ANALYSIS_BATCH_SCHEMA_VERSION).toBe(2);
    expect(GET_PLACES_LIST_QUERY).toContain("newOpening");
    expect(batch[0]?.query).toContain("newOpening");
  });

  it("rejects a legacy fieldless batch and accepts a null-valued current batch", () => {
    const legacy = [
      { data: { places: { items: [{ id: "2035306921", name: "갈란트" }] } } },
    ];
    const current = [
      {
        data: {
          places: {
            items: [
              {
                id: "2035306921",
                name: "갈란트",
                newOpening: null,
              },
            ],
          },
        },
      },
    ];

    expect(pcmapBatchHasNewOpeningField(legacy)).toBe(false);
    expect(pcmapBatchHasNewOpeningField(current)).toBe(true);
  });
});
