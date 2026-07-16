import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chooseBestPlaceTypeResult,
  extractRegisteredKeywordsFromHtml,
  extractReviewFeatureKeywordsFromObject,
  extractReviewCountsFromRawHtml,
  getNaverPlaceReviewSnapshot,
  resolvePlaceTypeOrder,
  resolveSnapshotRequestCacheStatus,
  runPlaceTypeAttempts,
} from "./getNaverPlaceReviewSnapshot";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getNaverPlaceReviewSnapshot parsing helpers", () => {
  it("parses restaurant microReview and distinguishes an available empty value", () => {
    expect(
      extractReviewFeatureKeywordsFromObject({
        microReview: ["피자가 맛있어요", "분위기가 좋아요"],
        keywordList: ["화덕피자"],
      })
    ).toEqual({
      keywords: ["피자가 맛있어요", "분위기가 좋아요"],
      status: "AVAILABLE",
    });
    expect(extractReviewFeatureKeywordsFromObject({ microReview: null })).toEqual({
      keywords: [],
      status: "AVAILABLE",
    });
    expect(extractReviewFeatureKeywordsFromObject({ name: "특징 미수집" })).toEqual({
      keywords: null,
      status: "UNAVAILABLE",
    });
  });

  it("parses keywordList from information HTML and preserves empty versus unavailable", () => {
    expect(
      extractRegisteredKeywordsFromHtml(
        `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"keywordList":["블루스퀘어맛집","화덕피자"],"microReview":["피자가 맛있어요"]}}}</script>`
      )
    ).toEqual({
      keywords: ["블루스퀘어맛집", "화덕피자"],
      status: "AVAILABLE",
    });
    expect(
      extractRegisteredKeywordsFromHtml(`window.__STATE__={"keywordList":[]}`)
    ).toEqual({ keywords: [], status: "AVAILABLE" });
    expect(extractRegisteredKeywordsFromHtml("<html></html>")).toEqual({
      keywords: null,
      status: "UNAVAILABLE",
    });
  });

  it("reads current review-count key aliases from raw mobile HTML", () => {
    expect(
      extractReviewCountsFromRawHtml(`
        <script>
          window.__STATE__ = {
            "placeReviewCount": "1,234",
            "blogCafeReviewCount": 56
          };
        </script>
      `)
    ).toEqual({
      visitorReviewCount: 1234,
      blogReviewCount: 56,
    });
  });

  it("preserves real zero values", () => {
    expect(
      extractReviewCountsFromRawHtml(
        `{"visitorReviewCount":0,"blogReviewCount":"0"}`
      )
    ).toEqual({
      visitorReviewCount: 0,
      blogReviewCount: 0,
    });
  });

  it("prefers the type with page-derived metrics over the URL hint order", () => {
    const selected = chooseBestPlaceTypeResult([
      {
        type: "restaurant",
        pageMetricCount: 0,
        visitorReviewCount: 100,
        blogReviewCount: 20,
        saveCount: 300,
        registeredKeywords: [],
        registeredKeywordsStatus: "AVAILABLE",
        reviewFeatureKeywords: null,
        reviewFeatureKeywordsStatus: "UNAVAILABLE",
        keywordList: [],
        keywordListStatus: "AVAILABLE",
      },
      {
        type: "place",
        pageMetricCount: 2,
        visitorReviewCount: 101,
        blogReviewCount: 21,
        saveCount: 300,
        registeredKeywords: [],
        registeredKeywordsStatus: "AVAILABLE",
        reviewFeatureKeywords: null,
        reviewFeatureKeywordsStatus: "UNAVAILABLE",
        keywordList: [],
        keywordListStatus: "AVAILABLE",
      },
    ]);

    expect(selected?.type).toBe("place");
  });

  it("distinguishes in-flight dedupe from force update bypass", () => {
    expect(resolveSnapshotRequestCacheStatus(false, true)).toBe(
      "IN_FLIGHT_DEDUPE"
    );
    expect(resolveSnapshotRequestCacheStatus(true, true)).toBe("FORCE_BYPASS");
    expect(resolveSnapshotRequestCacheStatus(false, false)).toBe("MISS");
  });

  it("uses restaurant first for a food category", () => {
    expect(
      resolvePlaceTypeOrder({
        category: "음식점 > 양식 > 피자",
        placeName: "뉴오더클럽 한남",
        placeUrl: "https://m.place.naver.com/restaurant/1/home",
      })
    ).toEqual(["restaurant", "place"]);
  });

  it.each(["restaurant", "cafe"])(
    "uses restaurant first for an explicit %s business type",
    (businessType) => {
      expect(
        resolvePlaceTypeOrder({
          businessType,
          category: "필라테스",
          placeName: "뉴오더클럽 한남",
          placeUrl: "https://m.place.naver.com/place/1/home",
        })
      ).toEqual(["restaurant", "place"]);
    }
  );

  it("uses place first for pilates and ballet even when the saved URL says restaurant", () => {
    expect(
      resolvePlaceTypeOrder({
        category: "필라테스, 발레",
        placeName: "키코필라테스 앤 발레",
        placeUrl: "https://m.place.naver.com/restaurant/1225865054/home",
      })
    ).toEqual(["place", "restaurant"]);
  });

  it("uses the place result when restaurant is empty without a block", async () => {
    const called: string[] = [];
    const result = await runPlaceTypeAttempts(
      ["restaurant", "place"],
      async (type) => {
        called.push(type);
        return type === "restaurant"
          ? {
              type,
              pageMetricCount: 0,
              visitorReviewCount: null,
              blogReviewCount: null,
              saveCount: null,
              registeredKeywords: null,
              registeredKeywordsStatus: "UNAVAILABLE",
              reviewFeatureKeywords: null,
              reviewFeatureKeywordsStatus: "UNAVAILABLE",
              keywordList: [],
              keywordListStatus: "UNAVAILABLE",
              blocked: false,
              debugReason: "restaurant:GRAPHQL_TARGET_NOT_FOUND",
            }
          : {
              type,
              pageMetricCount: 0,
              visitorReviewCount: 321,
              blogReviewCount: 45,
              saveCount: 678,
              registeredKeywords: [],
              registeredKeywordsStatus: "AVAILABLE",
              reviewFeatureKeywords: null,
              reviewFeatureKeywordsStatus: "UNAVAILABLE",
              keywordList: [],
              keywordListStatus: "AVAILABLE",
              blocked: false,
              debugReason: null,
            };
      }
    );

    expect(called).toEqual(["restaurant", "place"]);
    expect(result.chosen).toMatchObject({
      type: "place",
      visitorReviewCount: 321,
      blogReviewCount: 45,
      saveCount: 678,
    });
  });

  it("stops before the fallback type when CAPTCHA or cooldown is explicit", async () => {
    const called: string[] = [];
    const result = await runPlaceTypeAttempts(
      ["restaurant", "place"],
      async (type) => {
        called.push(type);
        return {
          type,
          pageMetricCount: 0,
          visitorReviewCount: null,
          blogReviewCount: null,
          saveCount: null,
          registeredKeywords: null,
          registeredKeywordsStatus: "UNAVAILABLE",
          reviewFeatureKeywords: null,
          reviewFeatureKeywordsStatus: "UNAVAILABLE",
          keywordList: [],
          keywordListStatus: "UNAVAILABLE",
          blocked: true,
          debugReason: `${type}:GRAPHQL_NCAPTCHA`,
        };
      }
    );

    expect(called).toEqual(["restaurant"]);
    expect(result.stoppedByBlock).toBe(true);
    expect(result.attempts).toHaveLength(1);
  });

  it("keeps an unavailable save count null when visitor and blog counts exist", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url === "https://pcmap-api.place.naver.com/graphql") {
          const payload = JSON.parse(String(init?.body || "[]")) as Array<{
            operationName?: string;
          }>;
          const operationName = payload[0]?.operationName;
          const responseBody =
            operationName === "getPlacesList"
              ? [
                  {
                    data: {
                      places: {
                        businesses: {
                          items: [
                            {
                              id: "10001",
                              name: "테스트 플레이스",
                              visitorReviewCount: 725,
                              blogCafeReviewCount: 900,
                              saveCount: null,
                            },
                          ],
                        },
                      },
                    },
                  },
                ]
              : [
                  {
                    data: {
                      restaurants: {
                        businesses: { items: [] },
                      },
                    },
                  },
                ];

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("<html><body>metrics unavailable</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const snapshot = await getNaverPlaceReviewSnapshot({
      placeUrl: "https://m.place.naver.com/place/10001/home",
      placeId: "10001",
      placeName: "테스트 플레이스",
      businessType: "place",
      x: "127.0005",
      y: "37.53455",
      force: true,
    });

    expect(snapshot).toMatchObject({
      ok: false,
      chosenType: "place",
      visitorReviewCount: 725,
      blogReviewCount: 900,
      totalReviewCount: 1625,
      saveCountText: null,
    });
    expect(snapshot.debugReason).toContain("place:SAVE_COUNT_UNAVAILABLE");
    expect(snapshot.debugReason).not.toContain(
      "SAVE_COUNT_UNAVAILABLE_NORMALIZED_TO_ZERO"
    );
    expect(fetchMock).toHaveBeenCalled();
  });

  it("collects getPlacesList registered keywords from information HTML without refetching review pages", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://pcmap-api.place.naver.com/graphql") {
          const payload = JSON.parse(String(init?.body || "[]")) as Array<{
            operationName?: string;
          }>;
          expect(payload[0]?.operationName).toBe("getPlacesList");
          return new Response(
            JSON.stringify([
              {
                data: {
                  places: {
                    businesses: {
                      items: [
                        {
                          id: "place-1",
                          name: "일반 플레이스",
                          visitorReviewCount: 10,
                          blogCafeReviewCount: 2,
                          saveCount: 30,
                        },
                      ],
                    },
                  },
                },
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        expect(url).toBe(
          "https://pcmap.place.naver.com/place/place-1/information"
        );
        return new Response(
          `<script id="__NEXT_DATA__" type="application/json">{"props":{"keywordList":["서울역개인필라테스","숙대입구그룹필라테스"]}}</script>`,
          { status: 200, headers: { "Content-Type": "text/html" } }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const snapshot = await getNaverPlaceReviewSnapshot({
      placeUrl: "https://m.place.naver.com/place/place-1/home",
      placeId: "place-1",
      placeName: "일반 플레이스",
      businessType: "place",
      force: true,
    });

    expect(snapshot).toMatchObject({
      ok: true,
      visitorReviewCount: 10,
      blogReviewCount: 2,
      saveCountText: "30",
      registeredKeywords: ["서울역개인필라테스", "숙대입구그룹필라테스"],
      registeredKeywordsStatus: "AVAILABLE",
      reviewFeatureKeywords: null,
      reviewFeatureKeywordsStatus: "UNAVAILABLE",
      keywordList: ["서울역개인필라테스", "숙대입구그룹필라테스"],
      keywordListStatus: "AVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps GraphQL review metrics but skips information HTML when registered keyword collection is disabled", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request) => {
        const url = String(input);
        expect(url).toBe("https://pcmap-api.place.naver.com/graphql");
        return new Response(
          JSON.stringify([
            {
              data: {
                places: {
                  businesses: {
                    items: [
                      {
                        id: "place-keyword-cache-hit",
                        name: "캐시된 일반 플레이스",
                        visitorReviewCount: 11,
                        blogCafeReviewCount: 3,
                        saveCount: 40,
                      },
                    ],
                  },
                },
              },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const snapshot = await getNaverPlaceReviewSnapshot({
      placeUrl:
        "https://m.place.naver.com/place/place-keyword-cache-hit/home",
      placeId: "place-keyword-cache-hit",
      placeName: "캐시된 일반 플레이스",
      businessType: "place",
      collectRegisteredKeywords: false,
      force: true,
    });

    expect(snapshot).toMatchObject({
      ok: true,
      visitorReviewCount: 11,
      blogReviewCount: 3,
      saveCountText: "40",
      registeredKeywords: null,
      registeredKeywordsStatus: "UNAVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/information")
      )
    ).toBe(false);
  });

  it("dedupes the same place in flight even when keyword collection modes differ", async () => {
    let releaseGraphql!: () => void;
    const graphqlGate = new Promise<void>((resolve) => {
      releaseGraphql = resolve;
    });
    const fetchMock = vi.fn(
      async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://pcmap-api.place.naver.com/graphql") {
          await graphqlGate;
          return new Response(
            JSON.stringify([
              {
                data: {
                  places: {
                    businesses: {
                      items: [
                        {
                          id: "place-in-flight",
                          name: "동시 요청 플레이스",
                          visitorReviewCount: 12,
                          blogCafeReviewCount: 4,
                          saveCount: 50,
                        },
                      ],
                    },
                  },
                },
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        expect(url).toContain("/place/place-in-flight/information");
        return new Response(
          `<script id="__NEXT_DATA__" type="application/json">{"props":{"keywordList":["동시수집키워드"]}}</script>`,
          { status: 200, headers: { "Content-Type": "text/html" } }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const baseInput = {
      placeUrl: "https://m.place.naver.com/place/place-in-flight/home",
      placeId: "place-in-flight",
      placeName: "동시 요청 플레이스",
      businessType: "place",
    } as const;
    const collecting = getNaverPlaceReviewSnapshot({
      ...baseInput,
      collectRegisteredKeywords: true,
    });
    const metricsOnly = getNaverPlaceReviewSnapshot({
      ...baseInput,
      collectRegisteredKeywords: false,
    });
    releaseGraphql();

    const [first, second] = await Promise.all([collecting, metricsOnly]);
    expect(first.registeredKeywords).toEqual(["동시수집키워드"]);
    expect(second).toMatchObject({
      registeredKeywords: ["동시수집키워드"],
      cacheStatus: "IN_FLIGHT_DEDUPE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps getRestaurantsPcmap microReview separate and still fetches registered keywords", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/information")) {
          return new Response(
            `<script id="__NEXT_DATA__" type="application/json">{"props":{"keywordList":["맥주술집","화덕피자"],"microReview":["피자가 맛있어요"]}}</script>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
        const payload = JSON.parse(String(init?.body || "[]")) as Array<{
          operationName?: string;
          query?: string;
        }>;
        expect(payload[0]?.operationName).toBe("getRestaurantsPcmap");
        expect(payload[0]?.query).toContain("microReview");
        return new Response(
          JSON.stringify([
            {
              data: {
                restaurants: {
                  businesses: {
                    items: [
                      {
                        id: "restaurant-1",
                        name: "음식점",
                        visitorReviewCount: 100,
                        blogCafeReviewCount: 20,
                        saveCount: 300,
                        microReview: ["음식이 맛있어요", "특별한 메뉴가 있어요"],
                      },
                    ],
                  },
                },
              },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const snapshot = await getNaverPlaceReviewSnapshot({
      placeUrl: "https://m.place.naver.com/restaurant/restaurant-1/home",
      placeId: "restaurant-1",
      placeName: "음식점",
      businessType: "restaurant",
      force: true,
    });

    expect(snapshot).toMatchObject({
      ok: true,
      registeredKeywords: ["맥주술집", "화덕피자"],
      registeredKeywordsStatus: "AVAILABLE",
      reviewFeatureKeywords: ["음식이 맛있어요", "특별한 메뉴가 있어요"],
      reviewFeatureKeywordsStatus: "AVAILABLE",
      keywordList: ["맥주술집", "화덕피자"],
      keywordListStatus: "AVAILABLE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
