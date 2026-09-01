import { describe, expect, it } from "vitest";

import {
  WEB_ANALYSIS_PAGES,
  buildNaverWebSearchUrl,
  classifyWebResultSource,
  collectNaverWebResults,
  getWebAnalysisStart,
  normalizeWebResultDomain,
  parseNaverWebSearchHtml,
  validateWebAnalysisKeyword,
  type WebAnalysisFetch,
} from "@/lib/web-analysis";

function resultHtml({
  title = "뉴오더클럽 한남",
  url = "https://www.example.com/post/1",
  source = "Example",
  snippet = "검색 결과 문서 설명입니다.",
  thumbnail,
}: {
  title?: string;
  url?: string;
  source?: string;
  snippet?: string;
  thumbnail?: string;
} = {}): string {
  return `
    <!doctype html>
    <html lang="ko">
      <body>
        <nav>
          <a href="/search.naver?page=3">3</a>
          <a href="https://help.naver.com/">검색 고객센터</a>
        </nav>
        <div class="fds-web-doc-root">
          <div class="sds-comps-profile-info-title-text">${source}</div>
          <a href="#" class="item_save">Keep에 저장</a>
          <a href="${url}">
            <span class="sds-comps-text sds-comps-text-type-headline1">${title}</span>
            <span>새 창 열림</span>
          </a>
          <a href="${url}">
            <span class="sds-comps-text sds-comps-text-ellipsis-3 sds-comps-text-type-body1">${snippet}</span>
          </a>
          <img alt="${title}의 이미지"${thumbnail ? ` src="${thumbnail}"` : ""}>
          <a href="https://help.naver.com/">관련문서 더보기</a>
        </div>
        <footer>
          <a href="https://policy.naver.com/">이용약관</a>
        </footer>
      </body>
    </html>
  `;
}

describe("web analysis keyword validation", () => {
  it("rejects an empty or whitespace-only keyword", () => {
    expect(validateWebAnalysisKeyword("")).toEqual({
      ok: false,
      message: "분석할 키워드를 입력해주세요.",
    });
    expect(validateWebAnalysisKeyword("   ").ok).toBe(false);
  });

  it("trims a valid Korean keyword", () => {
    expect(validateWebAnalysisKeyword("  뉴오더클럽 한남  ")).toEqual({
      ok: true,
      keyword: "뉴오더클럽 한남",
    });
  });
});

describe("Naver web search URL generation", () => {
  it.each([
    [2, 1],
    [3, 16],
    [4, 31],
    [5, 46],
    [6, 61],
    [7, 76],
    [8, 91],
    [9, 106],
    [10, 121],
  ])("maps page %i to start %i", (page, start) => {
    expect(getWebAnalysisStart(page)).toBe(start);

    const url = new URL(buildNaverWebSearchUrl("뉴오더클럽 한남", page));
    expect(url.searchParams.get("page")).toBe(String(page));
    expect(url.searchParams.get("start")).toBe(String(start));
    expect(url.searchParams.get("query")).toBe("뉴오더클럽 한남");
    expect(url.searchParams.get("where")).toBe("web");
  });

  it("requests exactly pages 2 through 10", () => {
    expect([...WEB_ANALYSIS_PAGES]).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("Naver web result parsing", () => {
  it("collects one representative result per result card", () => {
    const results = parseNaverWebSearchHtml(
      resultHtml({
        title: "뉴오더클럽 한남 - 여행지",
        url: "https://www.korean.visitkorea.or.kr/detail/1",
        source: "대한민국 구석구석",
        snippet: "한남동에 위치한 뉴욕 스타일 피자 전문점입니다.",
      }),
      2
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      page: 2,
      positionInPage: 1,
      title: "뉴오더클럽 한남 - 여행지",
      url: "https://www.korean.visitkorea.or.kr/detail/1",
      domain: "korean.visitkorea.or.kr",
      source: "VISITKOREA",
      snippet: "한남동에 위치한 뉴욕 스타일 피자 전문점입니다.",
    });
  });

  it("does not collect navigation, Keep, related, or footer links", () => {
    const results = parseNaverWebSearchHtml(resultHtml(), 2);
    expect(results.map((item) => item.url)).toEqual([
      "https://www.example.com/post/1",
    ]);
  });

  it("includes Naver blog results with their source, snippet, and thumbnail", () => {
    const thumbnail =
      "https://search.pstatic.net/common?src=https%3A%2F%2Fblogfiles.naver.net%2Fpost.jpg&type=fff208_208_ar";
    const results = parseNaverWebSearchHtml(
      resultHtml({
        title: "뉴오더클럽 한남, 한강진역 피자 맛집 추천",
        url: "https://blog.naver.com/bbb0931/224367838433",
        source: "수수",
        snippet: "뉴오더클럽 한남 방문 후기입니다.",
        thumbnail,
      }),
      3
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      page: 3,
      title: "뉴오더클럽 한남, 한강진역 피자 맛집 추천",
      domain: "blog.naver.com",
      source: "네이버 블로그",
      snippet: "뉴오더클럽 한남 방문 후기입니다.",
      thumbnail,
    });
  });

  it("does not create a thumbnail URL when an image has no source", () => {
    const results = parseNaverWebSearchHtml(resultHtml(), 2);
    expect(results[0].thumbnail).toBeUndefined();
  });
});

describe("web result domain and source", () => {
  it("removes only the leading www from the displayed domain", () => {
    expect(
      normalizeWebResultDomain(
        "https://www.instagram.com/neworderclub_hannam/"
      )
    ).toBe("instagram.com");
  });

  it("uses the small MVP source mapping", () => {
    expect(classifyWebResultSource("blog.naver.com")).toBe("네이버 블로그");
    expect(classifyWebResultSource("m.blog.naver.com")).toBe(
      "네이버 블로그"
    );
    expect(classifyWebResultSource("cafe.naver.com")).toBe("네이버 카페");
    expect(classifyWebResultSource("instagram.com")).toBe("Instagram");
    expect(classifyWebResultSource("app.catchtable.co.kr")).toBe("캐치테이블");
  });
});

describe("web analysis collection", () => {
  it("keeps successful pages when one page fails", async () => {
    const fetchImpl: WebAnalysisFetch = async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      if (page === 4) throw new Error("network failed");

      return new Response(
        resultHtml({
          title: `${page}페이지 문서`,
          url: `https://example.com/page-${page}`,
        }),
        { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" } }
      );
    };

    const analysis = await collectNaverWebResults("뉴오더클럽한남", {
      fetchImpl,
      concurrency: 2,
      timeoutMs: 1_000,
    });

    expect(analysis.requestedPages).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(analysis.successfulPages).toEqual([2, 3, 5, 6, 7, 8, 9, 10]);
    expect(analysis.failedPages).toEqual([4]);
    expect(analysis.totalResults).toBe(8);
    expect(analysis.results.map((item) => item.collectedIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(analysis.results.map((item) => item.page)).toEqual([
      2, 3, 5, 6, 7, 8, 9, 10,
    ]);
  });
});
