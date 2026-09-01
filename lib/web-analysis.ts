import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { mapWithConcurrencyLimit } from "@/lib/place-rank-keyword-concurrency";

export const WEB_ANALYSIS_PAGES = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const NAVER_WEB_SEARCH_URL = "https://search.naver.com/search.naver";
const WEB_ANALYSIS_CONCURRENCY = 3;
const WEB_ANALYSIS_TIMEOUT_MS = 15_000;

const NAVER_WEB_SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://search.naver.com/",
} as const;

export type WebAnalysisFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type WebAnalysisParsedResult = {
  page: number;
  positionInPage: number;
  title: string;
  url: string;
  domain: string;
  source: string;
  snippet?: string;
  thumbnail?: string;
};

export type WebAnalysisResult = WebAnalysisParsedResult & {
  collectedIndex: number;
};

export type WebAnalysisCollection = {
  keyword: string;
  requestedPages: number[];
  successfulPages: number[];
  failedPages: number[];
  failures: Array<{ page: number; message: string }>;
  totalResults: number;
  results: WebAnalysisResult[];
};

export type WebAnalysisKeywordValidation =
  | { ok: true; keyword: string }
  | { ok: false; message: string };

type CollectWebAnalysisOptions = {
  fetchImpl?: WebAnalysisFetch;
  concurrency?: number;
  timeoutMs?: number;
};

type PageCollection =
  | { ok: true; page: number; results: WebAnalysisParsedResult[] }
  | { ok: false; page: number; message: string };

export function validateWebAnalysisKeyword(
  value: unknown
): WebAnalysisKeywordValidation {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, message: "분석할 키워드를 입력해주세요." };
  }

  return { ok: true, keyword: value.trim() };
}

export function getWebAnalysisStart(page: number): number {
  if (!Number.isInteger(page) || page < 2 || page > 10) {
    throw new RangeError("웹 분석 페이지는 2~10 사이여야 합니다.");
  }

  return 1 + (page - 2) * 15;
}

export function buildNaverWebSearchUrl(keyword: string, page: number): string {
  const url = new URL(NAVER_WEB_SEARCH_URL);
  url.searchParams.set("nso", "");
  url.searchParams.set("page", String(page));
  url.searchParams.set("qdt", "0");
  url.searchParams.set("query", keyword);
  url.searchParams.set("sm", "tab_pge");
  url.searchParams.set("start", String(getWebAnalysisStart(page)));
  url.searchParams.set("where", "web");
  return url.toString();
}

function compactText(value: unknown): string {
  return String(value ?? "")
    .replace(/새 창 열림/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeResultUrl(rawHref: string): string | null {
  const href = rawHref.trim();
  if (!href) return null;

  try {
    const url = new URL(href, NAVER_WEB_SEARCH_URL);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    if (url.hostname === "search.naver.com") {
      for (const key of ["url", "u", "target"]) {
        const target = url.searchParams.get(key)?.trim();
        if (!target) continue;
        try {
          const resolved = new URL(target);
          if (resolved.protocol === "http:" || resolved.protocol === "https:") {
            return resolved.toString();
          }
        } catch {
          // 단순히 해제할 수 없는 네이버 추적 URL은 원본 href를 유지합니다.
        }
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeWebResultDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isDomainOrSubdomain(domain: string, expected: string): boolean {
  return domain === expected || domain.endsWith(`.${expected}`);
}

export function classifyWebResultSource(
  domain: string,
  displayedSource = ""
): string {
  if (isDomainOrSubdomain(domain, "blog.naver.com")) return "네이버 블로그";
  if (isDomainOrSubdomain(domain, "cafe.naver.com")) return "네이버 카페";
  if (isDomainOrSubdomain(domain, "instagram.com")) return "Instagram";
  if (isDomainOrSubdomain(domain, "visitkorea.or.kr")) return "VISITKOREA";
  if (isDomainOrSubdomain(domain, "catchtable.co.kr")) return "캐치테이블";
  if (domain.includes("tripadvisor.")) return "Tripadvisor";

  return compactText(displayedSource) || domain;
}

function findThumbnail(
  $: cheerio.CheerioAPI,
  card: cheerio.Cheerio<Element>
): string | undefined {
  const images = card
    .find("img")
    .filter((_, element) =>
      compactText($(element).attr("alt")).includes("이미지")
    );

  for (const element of images.toArray()) {
    const image = $(element);
    const candidates = [
      image.attr("data-lazy-src"),
      image.attr("data-src"),
      image.attr("src"),
      image.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0],
    ];

    for (const candidate of candidates) {
      const normalized = normalizeResultUrl(candidate || "");
      if (normalized) return normalized;
    }
  }

  return undefined;
}

export function parseNaverWebSearchHtml(
  html: string,
  page: number
): WebAnalysisParsedResult[] {
  getWebAnalysisStart(page);

  const $ = cheerio.load(html);
  const results: WebAnalysisParsedResult[] = [];
  const seenOnPage = new Set<string>();

  $(".fds-web-doc-root").each((cardIndex, element) => {
    const card = $(element);
    const titleAnchor = card
      .find("a[href]")
      .filter((_, anchor) =>
        Boolean($(anchor).find(".sds-comps-text-type-headline1").length)
      )
      .first();
    const title = compactText(
      titleAnchor.find(".sds-comps-text-type-headline1").first().text()
    );
    const url = normalizeResultUrl(titleAnchor.attr("href")?.trim() || "");

    if (!title || !url || seenOnPage.has(url)) return;

    const domain = normalizeWebResultDomain(url);
    if (!domain) return;

    const displayedSource = compactText(
      card.find(".sds-comps-profile-info-title-text").first().text()
    );
    const snippet = compactText(
      card
        .find(
          ".sds-comps-text-ellipsis-3.sds-comps-text-type-body1"
        )
        .first()
        .text()
    );
    const thumbnail = findThumbnail($, card);

    seenOnPage.add(url);
    results.push({
      page,
      positionInPage: cardIndex + 1,
      title,
      url,
      domain,
      source: classifyWebResultSource(domain, displayedSource),
      ...(snippet ? { snippet } : {}),
      ...(thumbnail ? { thumbnail } : {}),
    });
  });

  return results;
}

function visiblePageText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return compactText($("body").text()).slice(0, 8_000);
}

function blockedPageMessage(html: string): string | null {
  const text = visiblePageText(html);
  if (/captcha|비정상적인 접근|접근이 제한|자동입력 방지/i.test(text)) {
    return "네이버가 해당 페이지 요청을 제한했습니다.";
  }
  return null;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "요청 시간이 초과되었습니다.";
    }
    return error.message;
  }
  return "페이지 수집에 실패했습니다.";
}

async function collectPage(
  keyword: string,
  page: number,
  fetchImpl: WebAnalysisFetch,
  timeoutMs: number
): Promise<PageCollection> {
  try {
    const response = await fetchImpl(buildNaverWebSearchUrl(keyword, page), {
      headers: NAVER_WEB_SEARCH_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`네이버 웹검색 HTTP ${response.status}`);
    }

    const html = await response.text();
    const results = parseNaverWebSearchHtml(html, page);
    if (results.length === 0) {
      const blocked = blockedPageMessage(html);
      if (blocked) throw new Error(blocked);
    }

    return { ok: true, page, results };
  } catch (error) {
    return { ok: false, page, message: failureMessage(error) };
  }
}

export async function collectNaverWebResults(
  keyword: string,
  options: CollectWebAnalysisOptions = {}
): Promise<WebAnalysisCollection> {
  const validation = validateWebAnalysisKeyword(keyword);
  if (!validation.ok) throw new TypeError(validation.message);

  const fetchImpl = options.fetchImpl ?? fetch;
  const concurrency = Math.min(
    WEB_ANALYSIS_CONCURRENCY,
    Math.max(1, Math.floor(options.concurrency ?? WEB_ANALYSIS_CONCURRENCY))
  );
  const timeoutMs = Math.max(1, options.timeoutMs ?? WEB_ANALYSIS_TIMEOUT_MS);
  const requestedPages = [...WEB_ANALYSIS_PAGES];

  const pages = await mapWithConcurrencyLimit(
    requestedPages,
    concurrency,
    (page) => collectPage(validation.keyword, page, fetchImpl, timeoutMs)
  );

  const successfulPages = pages
    .filter((item): item is Extract<PageCollection, { ok: true }> => item.ok)
    .map((item) => item.page);
  const failures = pages
    .filter((item): item is Extract<PageCollection, { ok: false }> => !item.ok)
    .map((item) => ({ page: item.page, message: item.message }));
  const parsedResults = pages.flatMap((item) =>
    item.ok ? item.results : []
  );
  const results = parsedResults.map((result, index) => ({
    collectedIndex: index + 1,
    ...result,
  }));

  return {
    keyword: validation.keyword,
    requestedPages,
    successfulPages,
    failedPages: failures.map((item) => item.page),
    failures,
    totalResults: results.length,
    results,
  };
}
