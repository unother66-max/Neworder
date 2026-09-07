import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNaverPublicPlaceId: vi.fn(),
  fetchNaverPlaceImage: vi.fn(),
}));

vi.mock("@/lib/naver-place-image", () => ({
  fetchNaverPublicPlaceId: mocks.fetchNaverPublicPlaceId,
  fetchNaverPlaceImage: mocks.fetchNaverPlaceImage,
}));

import { POST } from "@/app/api/search-place/route";

describe("search-place display text normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NAVER_CLIENT_ID", "client-id");
    vi.stubEnv("NAVER_CLIENT_SECRET", "client-secret");
    mocks.fetchNaverPublicPlaceId.mockResolvedValue("123456789");
    mocks.fetchNaverPlaceImage.mockResolvedValue("");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("decodes HTML entities in user-visible Naver search fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          items: [
            {
              title: "<b>라온휘트니스&amp;필라테스</b>",
              category: "스포츠&amp;레저&gt;필라테스",
              roadAddress: "서울 용산구 A&amp;B로 1",
              link: "https://map.naver.com/p/entry/place/123456789",
            },
          ],
        })
      )
    );

    const response = await POST(
      new Request("http://localhost/api/search-place", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "라온 휘트니스&" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          title: "라온휘트니스&필라테스",
          category: "스포츠&레저>필라테스",
          address: "서울 용산구 A&B로 1",
          link: "https://map.naver.com/p/entry/place/123456789",
          image: "",
        },
      ],
    });
  });
});
