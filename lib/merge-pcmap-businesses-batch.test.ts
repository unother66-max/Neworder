import { describe, expect, it } from "vitest";
import {
  mergePcmapGraphqlBatch,
  parseNullableNaverReviewCountField,
  parseNaverReviewCountField,
} from "./merge-pcmap-businesses-batch";

describe("parseNaverReviewCountField", () => {
  it("쉼표 포함 문자열을 정수로 변환", () => {
    expect(parseNaverReviewCountField("2,413")).toBe(2413);
    expect(parseNaverReviewCountField("1,229")).toBe(1229);
  });
  it("숫자·빈값", () => {
    expect(parseNaverReviewCountField(159)).toBe(159);
    expect(parseNaverReviewCountField(null)).toBe(0);
    expect(parseNaverReviewCountField("")).toBe(0);
  });

  it("실제 0과 수집 불가를 구분", () => {
    expect(parseNullableNaverReviewCountField(0)).toBe(0);
    expect(parseNullableNaverReviewCountField("0")).toBe(0);
    expect(parseNullableNaverReviewCountField(null)).toBeNull();
    expect(parseNullableNaverReviewCountField(undefined)).toBeNull();
    expect(parseNullableNaverReviewCountField("")).toBeNull();
  });
});

describe("mergePcmapGraphqlBatch", () => {
  it("지도와 같이 광고를 앞에 두고, 광고 id는 오가닉에서 제거", () => {
    const batch = [
      {
        data: {
          businesses: {
            total: 126,
            items: [
              { id: "1524027315", name: "그리고필라테스 서울역점" },
              { id: "1304374512", name: "모던필라테스 서울시청점" },
            ],
          },
        },
      },
      {
        data: {
          adBusinesses: {
            total: 2,
            items: [
              {
                id: "1569459920",
                adId: "nad-a001",
                name: "좋은습관 PT STUDIO 서울역",
              },
              {
                id: "1304374512",
                adId: "nad-a002",
                name: "모던필라테스 서울시청점",
              },
            ],
          },
        },
      },
    ];

    const { items, total } = mergePcmapGraphqlBatch(batch);
    const rows = items as { id: string; name: string; isPromotedAd?: boolean }[];

    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe("1569459920");
    expect(rows[0].isPromotedAd).toBe(true);
    expect(rows[1].id).toBe("1304374512");
    expect(rows[1].isPromotedAd).toBe(true);
    expect(rows[2].id).toBe("1524027315");
    expect(rows[2].isPromotedAd).toBeUndefined();
    expect(total).toBeGreaterThanOrEqual(126);
  });

  it("빈 배열", () => {
    const r = mergePcmapGraphqlBatch([]);
    expect(r.items).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it("places와 businesses가 동시에 있으면 places만 오가닉으로 쓴다", () => {
    const batch = [
      {
        data: {
          places: {
            total: 1,
            items: [{ id: "p1", name: "플레이스우선" }],
          },
          businesses: {
            total: 1,
            items: [{ id: "b1", name: "비즈니스무시" }],
          },
        },
      },
    ];
    const { items } = mergePcmapGraphqlBatch(batch);
    const rows = items as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("p1");
  });

  it("`places` 필드명으로 오가닉이 오면 businesses와 동일하게 병합", () => {
    const batch = [
      {
        data: {
          places: {
            total: 10,
            items: [{ id: "111", name: "테스트필라테스" }],
          },
          adBusinesses: {
            total: 1,
            items: [{ id: "999", name: "광고짐" }],
          },
        },
      },
    ];
    const { items } = mergePcmapGraphqlBatch(batch);
    const rows = items as { id: string; isPromotedAd?: boolean }[];
    expect(rows[0].id).toBe("999");
    expect(rows[1].id).toBe("111");
  });

  it("PlaceListInput의 중첩 businesses 응답을 오가닉 목록으로 병합", () => {
    const batch = [
      {
        data: {
          places: {
            businesses: {
              total: 24,
              items: [
                {
                  id: "restaurant-1",
                  name: "뉴오더클럽 한남",
                  businessCategory: "restaurant",
                },
              ],
            },
          },
        },
      },
    ];

    const { items, total } = mergePcmapGraphqlBatch(batch);
    const rows = items as Array<{
      id: string;
      name: string;
      businessCategory: string;
    }>;

    expect(rows).toEqual([
      {
        id: "restaurant-1",
        name: "뉴오더클럽 한남",
        businessCategory: "restaurant",
      },
    ]);
    expect(total).toBe(24);
  });

  it("charAt GraphQL 오류를 숨기지 않고 진단에 유지", () => {
    const message =
      "Cannot read properties of undefined (reading 'charAt')";
    const result = mergePcmapGraphqlBatch([
      {
        errors: [{ message }],
        data: {
          places: {
            businesses: { total: 0, items: [] },
          },
        },
      },
    ]);

    expect(result.graphqlErrors).toEqual([message]);
  });

  it("광고 total이 오가닉 검색 total을 덮어쓰지 않음", () => {
    const result = mergePcmapGraphqlBatch([
      {
        data: {
          places: {
            businesses: {
              total: 37,
              items: [{ id: "organic-1", name: "정확한 지역 결과" }],
            },
          },
        },
      },
      {
        data: {
          adBusinesses: {
            total: 911430,
            items: [{ id: "ad-1", name: "광고 결과" }],
          },
        },
      },
    ]);

    expect(result.total).toBe(37);
    expect(result.items).toHaveLength(2);
  });
});
