import { describe, expect, it } from "vitest";
import {
  mergePcmapGraphqlBatch,
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
});
