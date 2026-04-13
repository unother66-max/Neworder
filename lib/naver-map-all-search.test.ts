import { describe, expect, it } from "vitest";
import {
  buildAllSearchUrlCheckPlaceRankStyle,
  extractPlacesFromAllSearchJson,
  getAllSearchPlaceBlock,
  mapAllSearchListItemToRow,
  mapAllSearchRowsToCheckPlaceRankList,
  type MapAllSearchPlaceRow,
} from "./naver-map-all-search";

describe("buildAllSearchUrlCheckPlaceRankStyle", () => {
  it("검색어 기준 pickBusinessesCoords로 searchCoord·boundary를 만든다", () => {
    const u = buildAllSearchUrlCheckPlaceRankStyle("서울역 필라테스");
    expect(u).toContain("searchCoord=126.9707;37.5547");
    expect(u).toContain(
      "boundary=126.9707;37.5547;126.9707;37.5547"
    );
    expect(u).toContain("sscode=svc.mapv5.search");
    expect(u).not.toContain("token=");
  });
});

describe("getAllSearchPlaceBlock / extractPlacesFromAllSearchJson", () => {
  it("data.result.place.list 변형을 읽는다", () => {
    const json = {
      data: {
        result: {
          place: {
            totalCount: 2,
            list: [
              {
                id: "1",
                name: "A",
                visitorReviewCount: 10,
                blogCafeReviewCount: 5,
                categoryPath: ["스포츠", "필라테스"],
              },
            ],
          },
        },
      },
    };
    const block = getAllSearchPlaceBlock(json);
    expect(block?.totalCount).toBe(2);
    const rows = extractPlacesFromAllSearchJson(json);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("A");
    expect(rows[0].placeReviewCount).toBe(10);
    expect(rows[0].reviewCount).toBe(5);
    expect(rows[0].category).toContain("필라테스");
  });
});

describe("mapAllSearchRowsToCheckPlaceRankList", () => {
  it("display 상한 적용", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      mapAllSearchListItemToRow(
        { id: String(i), name: `n${i}`, placeReviewCount: 1, reviewCount: 0 },
        i
      )
    ).filter(Boolean) as MapAllSearchPlaceRow[];
    const list = mapAllSearchRowsToCheckPlaceRankList(rows, 15);
    expect(list).toHaveLength(15);
    expect(list[0].rank).toBe(1);
    expect(list[14].placeId).toBe("14");
  });
});
