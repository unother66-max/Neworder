import { makePostMatchKey } from "./naver";

export type NaverIntegratedBlogExposure = {
  matched: boolean;
  integratedSearchRank: number | null;
  integratedSearchBlock: "1블록" | "2블록" | "3블록" | "통합검색" | "스마트블록" | null;
  smartBlockCount: number;
  exposureType: "integrated" | "smartblock" | null;
  matchedPostKey: string | null;
  matchedPostUrl: string | null;
  matchedPostTitle: string | null;
  debug: NaverIntegratedBlogExposureDebug;
};

export type CheckNaverIntegratedBlogExposureInput = {
  keyword: string;
  blogId: string;
  candidatePostUrls?: Array<string | null | undefined>;
  candidatePostTitles?: Array<string | null | undefined>;
};

export type SourceCheckResult = {
  checked: boolean;
  matched: boolean;
  httpStatus: number | null;
  noBlogResult: boolean;
  isCaptchaPage: boolean;
  isBlockedPage: boolean;
  htmlLength: number;
  htmlContainsBlogNaverCom: boolean;
  extractedBlogPostKeys: string[];
  /** 상위 10개 href 링크 샘플 */
  sampleHtmlLinks: string[];
  /** blog.naver.com 첫 발견 위치 전후 1000자 */
  firstBlogNaverPreview: string;
  /** blog.naver.com 발견 위치 상위 5개, 각 300자 */
  allBlogNaverPreviews: string[];
  /** blog.naver.com/{blogId} 패턴 raw 샘플 20개 */
  blogNaverMatchRawSamples: string[];
  /** m.blog.naver.com/{blogId} 패턴 raw 샘플 20개 */
  mBlogNaverMatchRawSamples: string[];
  /** 인코딩된 블로그 URL 샘플 20개 */
  encodedBlogUrlSamples: string[];
};

export type NaverIntegratedBlogExposureDebug = {
  htmlFetched: boolean;
  htmlLength: number;
  htmlTitle: string;
  containsBlogId: boolean;
  containsCandidateLogNo: boolean;
  matchedUrlCount: number;
  sectionTitleCandidates: string[];
  firstNaverSearchStatus: number | null;
  /** @deprecated isCaptchaPage || isBlockedPage 와 동일 */
  blockedOrCaptchaDetected: boolean;
  isCaptchaPage: boolean;
  isBlockedPage: boolean;
  blockDetectionReason: string | null;
  noBlogResult: boolean;
  noCandidateMatch: boolean;
  isSearchPageWithNoBlogResults: boolean;
  sampleIntegratedSearchHtmlLinks: string[];
  sampleDecodedIntegratedSearchLinks: string[];
  extractedBlogPostKeys: string[];
  candidatePostKeys: string[];
  matchedPostKeys: string[];
  htmlContainsBlogNaverCom: boolean;
  htmlContainsPostView: boolean;
  htmlContainsViewSection: boolean;
  htmlContainsApiData: boolean;
  firstBlogNaverPreview: string;
  firstPostViewPreview: string;
  allBlogNaverPreviews: string[];
  blogNaverMatchRawSamples: string[];
  mBlogNaverMatchRawSamples: string[];
  encodedBlogUrlSamples: string[];
  pcIntegrated: SourceCheckResult;
  mobileIntegrated: SourceCheckResult;
  pcView: SourceCheckResult;
  mobileView: SourceCheckResult;
  matchedSource: "pc-integrated" | "mobile-integrated" | "pc-view" | "mobile-view" | null;
};

function emptySourceCheck(): SourceCheckResult {
  return {
    checked: false,
    matched: false,
    httpStatus: null,
    noBlogResult: false,
    isCaptchaPage: false,
    isBlockedPage: false,
    htmlLength: 0,
    htmlContainsBlogNaverCom: false,
    extractedBlogPostKeys: [],
    sampleHtmlLinks: [],
    firstBlogNaverPreview: "",
    allBlogNaverPreviews: [],
    blogNaverMatchRawSamples: [],
    mBlogNaverMatchRawSamples: [],
    encodedBlogUrlSamples: [],
  };
}

function emptyDebug(overrides: Partial<NaverIntegratedBlogExposureDebug> = {}): NaverIntegratedBlogExposureDebug {
  return {
    htmlFetched: false,
    htmlLength: 0,
    htmlTitle: "",
    containsBlogId: false,
    containsCandidateLogNo: false,
    matchedUrlCount: 0,
    sectionTitleCandidates: [],
    firstNaverSearchStatus: null,
    blockedOrCaptchaDetected: false,
    isCaptchaPage: false,
    isBlockedPage: false,
    blockDetectionReason: null,
    noBlogResult: false,
    noCandidateMatch: false,
    isSearchPageWithNoBlogResults: false,
    sampleIntegratedSearchHtmlLinks: [],
    sampleDecodedIntegratedSearchLinks: [],
    extractedBlogPostKeys: [],
    candidatePostKeys: [],
    matchedPostKeys: [],
    htmlContainsBlogNaverCom: false,
    htmlContainsPostView: false,
    htmlContainsViewSection: false,
    htmlContainsApiData: false,
    firstBlogNaverPreview: "",
    firstPostViewPreview: "",
    allBlogNaverPreviews: [],
    blogNaverMatchRawSamples: [],
    mBlogNaverMatchRawSamples: [],
    encodedBlogUrlSamples: [],
    pcIntegrated: emptySourceCheck(),
    mobileIntegrated: emptySourceCheck(),
    pcView: emptySourceCheck(),
    mobileView: emptySourceCheck(),
    matchedSource: null,
    ...overrides,
  };
}

function emptyExposure(): NaverIntegratedBlogExposure {
  return {
    matched: false,
    integratedSearchRank: null,
    integratedSearchBlock: null,
    smartBlockCount: 0,
    exposureType: null,
    matchedPostKey: null,
    matchedPostUrl: null,
    matchedPostTitle: null,
    debug: emptyDebug(),
  };
}

// ── 유틸리티 ────────────────────────────────────────────────────────────────

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecodeUri(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

/**
 * JSON 인코딩된 슬래시(`\/`)와 퍼센트 인코딩된 슬래시(`%2F`)를 `/`로 변환해
 * URL 추출이 쉽도록 정규화한다.
 * (원문 위치 추적이 필요 없는 콘텐츠에 적용)
 */
function normalizeUrlSlashes(value: string): string {
  return value
    .replace(/\\\//g, "/")       // JSON escape: \/ → /
    .replace(/%2F/gi, "/")       // percent: %2F → /
    .replace(/%3A/gi, ":");      // percent: %3A → :
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractResultRankFromContext(context: string): number | null {
  const patterns = [
    /data-cr-(?:on|off|url)=["'][^"']*?[?&]r=(\d+)/i,
    /[?&]r=(\d+)(?:&|&amp;|["'])/i,
  ];
  for (const pattern of patterns) {
    const match = context.match(pattern);
    const rank = match?.[1] ? Number(match[1]) : NaN;
    if (Number.isFinite(rank) && rank >= 1) return rank;
  }
  return null;
}

function blockLabelFromRank(rank: number | null): "1블록" | "2블록" | "3블록" | "통합검색" {
  if (!rank || rank < 1) return "통합검색";
  if (rank <= 3) return "1블록";
  if (rank <= 6) return "2블록";
  return "3블록";
}

function extractSectionTitleCandidates(html: string): string[] {
  const titles = new Set<string>();
  const patterns = [
    /<(?:h2|strong|span|a)[^>]*(?:class=["'][^"']*(?:title|tit|keyword|name)[^"']*["'])[^>]*>([\s\S]{1,120}?)<\/(?:h2|strong|span|a)>/gi,
    /<h2[^>]*>([\s\S]{1,120}?)<\/h2>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const title = safeDecodeUri(decodeHtmlEntities(String(match[1] ?? "")))
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!title) continue;
      if (/통합검색|인기글|VIEW|블로그|스마트\s*블록|지식iN|이미지|동영상|뉴스/i.test(title)) titles.add(title);
      if (titles.size >= 12) break;
    }
    if (titles.size >= 12) break;
  }
  return [...titles].slice(0, 12);
}

function inferBlockLabelFromHtmlPosition(html: string, matchIndex: number, rank: number | null): "1블록" | "2블록" | "3블록" | "통합검색" {
  const blockStartPattern = /<(?:section|div)[^>]*class=["'][^"']*(?:api_subject_bx|fds-collection-root|sc_new|sp_nreview|view_wrap|collection|api_flicking_wrap)[^"']*["'][^>]*>/gi;
  const starts: number[] = [];
  for (const m of html.matchAll(blockStartPattern)) {
    if (m.index == null) continue;
    if (m.index > matchIndex) break;
    starts.push(m.index);
  }
  const blockOrder = starts.length;
  if (blockOrder >= 1 && blockOrder <= 3) return `${blockOrder}블록` as "1블록" | "2블록" | "3블록";
  return blockLabelFromRank(rank);
}

function isSmartBlockContext(context: string): boolean {
  return /스마트\s*블록|smartblock|smart_block|MAIN_SMARTBLOCK/i.test(context);
}

/**
 * 정상 검색 페이지가 아닌 경우에만 captcha/blocked 판정.
 * 30KB 이상 HTML이거나 검색 결과 구조 클래스가 있으면 정상 페이지로 간주.
 */
function detectPageBlockState(rawHtml: string): {
  isCaptchaPage: boolean; isBlockedPage: boolean; blockDetectionReason: string | null;
} {
  const hasSearchResultIndicators =
    rawHtml.length > 30_000 ||
    /id=["']main_pack["']|content_wrap|class=["'][^"']*sc_new|class=["'][^"']*api_subject_bx/i.test(rawHtml);
  if (!hasSearchResultIndicators) {
    if (/자동입력\s*방지\s*문자|보안\s*문자\s*입력/i.test(rawHtml))
      return { isCaptchaPage: true, isBlockedPage: false, blockDetectionReason: "captcha_form" };
    if (/비정상적인\s*접근|robot\s*verification|접근이\s*차단|잠시\s*후\s*다시\s*시도|too\s*many\s*requests/i.test(rawHtml))
      return { isCaptchaPage: false, isBlockedPage: true, blockDetectionReason: "access_blocked" };
  }
  return { isCaptchaPage: false, isBlockedPage: false, blockDetectionReason: null };
}

function extractHtmlTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  if (!m) return "";
  return decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim();
}

// ── 블로그 포스트 키 추출 ─────────────────────────────────────────────────

/**
 * URL 문자열에서 직접 blog.naver.com/{blogId}/{logNo} 형태를 추출 (재귀 없음).
 * 정규화된 텍스트에 사용한다.
 */
function extractDirectBlogKeys(text: string, blogId: string): { logNo: string }[] {
  const bid = blogId.toLowerCase().trim();
  const bidEsc = escapeRegExp(bid);
  const results: { logNo: string }[] = [];
  // 직접 URL (프로토콜 있음/없음/protocol-relative 모두 허용)
  const directRe = new RegExp(
    `(?:https?:)?\\/{1,2}(?:m\\.)?blog\\.naver\\.com\\/${bidEsc}\\/(\\d{6,})`,
    "gi"
  );
  for (const m of text.matchAll(directRe)) {
    if (m[1]) results.push({ logNo: m[1] });
  }
  // PostView.naver?blogId=...&logNo=... (순서 무관)
  const pvRe1 = new RegExp(
    `(?:m\\.)?blog\\.naver\\.com\\/PostView\\.naver\\?[^"'<>\\s]{0,300}blogId=${bidEsc}[^"'<>\\s]{0,300}logNo=(\\d{6,})`,
    "gi"
  );
  for (const m of text.matchAll(pvRe1)) {
    if (m[1]) results.push({ logNo: m[1] });
  }
  const pvRe2 = new RegExp(
    `(?:m\\.)?blog\\.naver\\.com\\/PostView\\.naver\\?[^"'<>\\s]{0,300}logNo=(\\d{6,})[^"'<>\\s]{0,300}blogId=${bidEsc}`,
    "gi"
  );
  for (const m of text.matchAll(pvRe2)) {
    if (m[1]) results.push({ logNo: m[1] });
  }
  return results;
}

/**
 * JSON 데이터 내 "blogId"+"logNo" 분리 필드 쌍, 또는 JSON URL 필드에서 포스트 키 추출.
 */
function extractBlogPostKeysFromJsonFields(
  html: string,
  blogId: string
): { logNo: string }[] {
  const bid = blogId.toLowerCase().trim();
  const bidEsc = escapeRegExp(bid);
  const results: { logNo: string }[] = [];
  const seen = new Set<string>();

  function tryAdd(logNo: string) {
    if (!seen.has(logNo)) { seen.add(logNo); results.push({ logNo }); }
  }

  // 1) "blogId":"playwithharry" → 전방 600자에서 "logNo":"..."
  const bidRe = new RegExp(`"blogId"\\s*:\\s*"${bidEsc}"`, "gi");
  for (const m of html.matchAll(bidRe)) {
    if (m.index == null) continue;
    const ahead = html.slice(m.index, m.index + 600);
    const lnm = ahead.match(/"logNo"\s*:\s*"(\d{6,})"/);
    if (lnm?.[1]) tryAdd(lnm[1]);
    // 역방향도 확인
    const behind = html.slice(Math.max(0, m.index - 600), m.index + 50);
    const lnm2 = behind.match(/"logNo"\s*:\s*"(\d{6,})"/);
    if (lnm2?.[1]) tryAdd(lnm2[1]);
  }

  // 2) "logNo":"123456" 단독 패턴 + 주변 blogId 확인
  const logNoRe = /"logNo"\s*:\s*"(\d{6,})"/gi;
  for (const m of html.matchAll(logNoRe)) {
    if (m.index == null || !m[1]) continue;
    const window = html.slice(Math.max(0, m.index - 400), m.index + 400);
    if (new RegExp(`"blogId"\\s*:\\s*"${bidEsc}"`, "i").test(window)) tryAdd(m[1]);
  }

  // 3) JSON URL 필드: "pcUrl","mobileUrl","linkUrl","contentsUrl","landingUrl","clickUrl","postUrl","targetUrl","redirectUrl"
  const urlFieldRe = /"(?:postUrl|linkUrl|pcUrl|mobileUrl|landingUrl|contentsUrl|clickUrl|targetUrl|redirectUrl|pcLinkUrl|mobileLinkUrl)"\s*:\s*"([^"]{10,600})"/gi;
  for (const m of html.matchAll(urlFieldRe)) {
    if (!m[1]) continue;
    const decoded = normalizeUrlSlashes(safeDecodeUri(m[1]));
    for (const { logNo } of extractDirectBlogKeys(decoded, blogId)) tryAdd(logNo);
  }

  return results;
}

/**
 * HTML에서 디버깅용 raw 샘플을 수집한다.
 */
function collectBlogNaverSamples(html: string, rawHtml: string, blogId: string): {
  firstBlogNaverPreview: string;
  allBlogNaverPreviews: string[];
  blogNaverMatchRawSamples: string[];
  mBlogNaverMatchRawSamples: string[];
  encodedBlogUrlSamples: string[];
} {
  const bid = blogId.toLowerCase().trim();
  const bidEsc = escapeRegExp(bid);

  // blog.naver.com 발견 위치 컨텍스트
  const allBlogNaverPreviews: string[] = [];
  let searchFrom = 0;
  while (allBlogNaverPreviews.length < 5) {
    const idx = rawHtml.indexOf("blog.naver.com", searchFrom);
    if (idx < 0) break;
    allBlogNaverPreviews.push(rawHtml.slice(Math.max(0, idx - 100), idx + 400));
    searchFrom = idx + 1;
  }
  const firstBlogNaverPreview = allBlogNaverPreviews[0] ?? "";

  // blog.naver.com/{blogId} raw 샘플
  const blogNaverMatchRawSamples: string[] = [];
  const bidPattern = new RegExp(`blog\\.naver\\.com[/\\\\%2F]+${bidEsc}`, "gi");
  for (const m of html.matchAll(bidPattern)) {
    if (blogNaverMatchRawSamples.length >= 20) break;
    if (m.index != null) blogNaverMatchRawSamples.push(html.slice(m.index, m.index + 100));
  }

  // m.blog.naver.com/{blogId} raw 샘플
  const mBlogNaverMatchRawSamples: string[] = [];
  const mBidPattern = new RegExp(`m\\.blog\\.naver\\.com[/\\\\%2F]+${bidEsc}`, "gi");
  for (const m of html.matchAll(mBidPattern)) {
    if (mBlogNaverMatchRawSamples.length >= 20) break;
    if (m.index != null) mBlogNaverMatchRawSamples.push(html.slice(m.index, m.index + 100));
  }

  // 인코딩된 블로그 URL 샘플
  const encodedBlogUrlSamples: string[] = [];
  const encodedRe = /(?:%2F%2F|%2F)(?:m\.)?blog\.naver\.com/gi;
  for (const m of rawHtml.matchAll(encodedRe)) {
    if (encodedBlogUrlSamples.length >= 20) break;
    if (m.index != null) encodedBlogUrlSamples.push(rawHtml.slice(m.index, m.index + 150));
  }

  return { firstBlogNaverPreview, allBlogNaverPreviews, blogNaverMatchRawSamples, mBlogNaverMatchRawSamples, encodedBlogUrlSamples };
}

/**
 * HTML(원문 + entity-decoded)에서 블로그 포스트 키(blogId:logNo)를 추출한다.
 * - 직접 URL, PostView, redirect 파라미터, JSON 필드, JSON escape, percent-encoding 지원
 */
function extractBlogPostKeysFromHtml(
  rawHtml: string,
  html: string,  // entity-decoded
  blogId: string
): { key: string; logNo: string; rawUrl: string }[] {
  const bid = blogId.toLowerCase().trim();
  const bidEsc = escapeRegExp(bid);
  const collected: { key: string; logNo: string; rawUrl: string }[] = [];
  const seenLogNos = new Set<string>();

  function addKey(logNo: string, rawUrl: string = "") {
    if (!seenLogNos.has(logNo)) {
      seenLogNos.add(logNo);
      collected.push({ key: `${bid}:${logNo}`, logNo, rawUrl });
    }
  }

  // 1) 직접 URL (원문 HTML)
  const directRe = new RegExp(
    `https?:\\/\\/(?:m\\.)?blog\\.naver\\.com\\/${bidEsc}\\/(\\d{6,})`,
    "gi"
  );
  for (const m of html.matchAll(directRe)) {
    if (m[1]) addKey(m[1], m[0]);
  }

  // 2) JSON single-escape: https:\/\/blog.naver.com\/{blogId}\/{logNo}
  const singleEscRe = new RegExp(
    `https?:\\\\/\\\\/(?:m\\.)?blog\\.naver\\.com\\\\/${bidEsc}\\\\/(\\d{6,})`,
    "gi"
  );
  for (const m of rawHtml.matchAll(singleEscRe)) {
    if (m[1]) addKey(m[1], m[0]);
  }

  // 3) PostView.naver?blogId=...&logNo=...
  const pvRe1 = new RegExp(
    `https?:\\/\\/(?:m\\.)?blog\\.naver\\.com\\/PostView\\.naver\\?[^"'<>\\s]{0,300}blogId=${bidEsc}[^"'<>\\s]{0,300}logNo=(\\d{6,})`,
    "gi"
  );
  for (const m of html.matchAll(pvRe1)) { if (m[1]) addKey(m[1], m[0]); }
  const pvRe2 = new RegExp(
    `https?:\\/\\/(?:m\\.)?blog\\.naver\\.com\\/PostView\\.naver\\?[^"'<>\\s]{0,300}logNo=(\\d{6,})[^"'<>\\s]{0,300}blogId=${bidEsc}`,
    "gi"
  );
  for (const m of html.matchAll(pvRe2)) { if (m[1]) addKey(m[1], m[0]); }

  // 4) redirect/u=/url=/targetUrl=/clickUrl= 파라미터 안 인코딩된 블로그 URL
  const redirectRe = /(?:url|u|redirect|targetUrl|redirectUrl|clickUrl|contentsUrl|landingUrl)=([^"'<>\s&]{6,})/gi;
  for (const m of html.matchAll(redirectRe)) {
    if (!m[1]) continue;
    let decoded = normalizeUrlSlashes(safeDecodeUri(decodeHtmlEntities(m[1])));
    decoded = safeDecodeUri(decoded);
    for (const { logNo } of extractDirectBlogKeys(decoded, blogId)) addKey(logNo, decoded);
  }

  // 5) JSON double-escape: blog.naver.com\\\/{blogId}\\\/123456
  const doubleEscRe = new RegExp(
    `(?:m\\.)?blog\\.naver\\.com\\\\+\\/${bidEsc}\\\\+\\/(\\d{6,})`,
    "gi"
  );
  for (const m of rawHtml.matchAll(doubleEscRe)) { if (m[1]) addKey(m[1], m[0]); }

  // 6) %2F 인코딩된 URL: blog.naver.com%2F{blogId}%2F{logNo}
  const pctRe = new RegExp(
    `(?:m\\.)?blog\\.naver\\.com%2F${bidEsc}%2F(\\d{6,})`,
    "gi"
  );
  for (const m of rawHtml.matchAll(pctRe)) { if (m[1]) addKey(m[1], m[0]); }

  // 7) 정규화 후 재시도 (JSON escape, %2F 등 처리)
  const normalizedHtml = normalizeUrlSlashes(html);
  for (const { logNo } of extractDirectBlogKeys(normalizedHtml, blogId)) addKey(logNo, "");

  // 8) JSON 필드 "blogId"+"logNo" 분리 형태
  for (const { logNo } of extractBlogPostKeysFromJsonFields(rawHtml, blogId)) addKey(logNo, "");

  return collected;
}

function candidateMapFromUrls(
  urls: Array<string | null | undefined>,
  titles: Array<string | null | undefined>
): Map<string, { url: string | null; title: string | null }> {
  const map = new Map<string, { url: string | null; title: string | null }>();
  urls.forEach((url, index) => {
    if (!url) return;
    const key = makePostMatchKey(url);
    if (!key) return;
    map.set(key, { url, title: titles[index] ?? null });
  });
  return map;
}

// ── 검색 요청 공통 ──────────────────────────────────────────────────────────

const COMMON_SEARCH_HEADERS = {
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://search.naver.com/",
} as const;

const PC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";

type SourceMatchResult = {
  sourceResult: SourceCheckResult;
  matches: Array<{ index: number; logNo: string; key: string }>;
  html: string;
  rawHtml: string;
  sectionTitleCandidates: string[];
};

async function fetchAndMatchBlogPosts(
  searchUrl: string,
  blogId: string,
  candidateByKey: Map<string, { url: string | null; title: string | null }>,
  shouldRestrictToCandidates: boolean,
  ua: string
): Promise<SourceMatchResult> {
  const empty: SourceMatchResult = {
    sourceResult: emptySourceCheck(),
    matches: [],
    html: "",
    rawHtml: "",
    sectionTitleCandidates: [],
  };

  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": ua, ...COMMON_SEARCH_HEADERS },
      cache: "no-store",
    });

    const rawHtml = await res.text();
    const html = decodeHtmlEntities(rawHtml);
    const htmlLength = rawHtml.length;
    const blockState = detectPageBlockState(rawHtml);
    const htmlContainsBlogNaverCom = rawHtml.includes("blog.naver.com");

    // 블로그 포스트 키 추출 (강화된 파서)
    const extracted = extractBlogPostKeysFromHtml(rawHtml, html, blogId);
    const extractedBlogPostKeys = extracted.map((e) => e.key).slice(0, 30);

    // href 링크 샘플
    const sampleHtmlLinks: string[] = [];
    for (const m of html.matchAll(/href=["']([^"']{6,300})["']/gi)) {
      if (sampleHtmlLinks.length >= 10) break;
      if (m[1]) sampleHtmlLinks.push(m[1]);
    }

    // 디버깅 샘플 수집
    const samples = collectBlogNaverSamples(html, rawHtml, blogId);

    // 후보 매칭
    const matches: Array<{ index: number; logNo: string; key: string }> = [];
    for (const { key, logNo, rawUrl } of extracted) {
      if (shouldRestrictToCandidates && !candidateByKey.has(key)) continue;
      const idx = rawUrl ? html.indexOf(rawUrl) : -1;
      matches.push({ index: idx >= 0 ? idx : 0, logNo, key });
    }

    const sourceResult: SourceCheckResult = {
      checked: true,
      matched: matches.length > 0,
      httpStatus: res.status,
      noBlogResult: extracted.length === 0,
      isCaptchaPage: blockState.isCaptchaPage,
      isBlockedPage: blockState.isBlockedPage,
      htmlLength,
      htmlContainsBlogNaverCom,
      extractedBlogPostKeys,
      sampleHtmlLinks,
      ...samples,
    };

    return {
      sourceResult,
      matches,
      html,
      rawHtml,
      sectionTitleCandidates: res.ok ? extractSectionTitleCandidates(html) : [],
    };
  } catch {
    return empty;
  }
}

// ── 메인 함수 ───────────────────────────────────────────────────────────────

/**
 * 네이버 통합/VIEW 검색에서 블로그 포스트 노출을 확인한다.
 *
 * 시도 순서:
 *  1. PC 통합검색 (nexearch)
 *  2. 모바일 통합검색 (m.search nexearch)
 *  3. PC VIEW 검색 (where=view)
 *  4. 모바일 VIEW 검색 (where=m_view)
 *
 * - PC 403은 정상 fallback으로 처리하며 에러 로그를 남기지 않는다.
 * - 차단·캡차 감지 시 다음 소스로 자동 넘어간다.
 */
export async function checkNaverIntegratedBlogExposure({
  keyword,
  blogId,
  candidatePostUrls = [],
  candidatePostTitles = [],
}: CheckNaverIntegratedBlogExposureInput): Promise<NaverIntegratedBlogExposure> {
  const normalizedBlogId = blogId.trim().toLowerCase();
  if (!keyword.trim() || !normalizedBlogId) return emptyExposure();

  const candidateByKey = candidateMapFromUrls(candidatePostUrls, candidatePostTitles);
  // 통합검색은 전체/과거 글 노출이 섞일 수 있으므로 후보 풀에 없는 같은 blogId 포스트도 인정한다.
  // candidateByKey는 매칭된 글의 제목/URL 보강에만 사용한다.
  const shouldRestrictToCandidates = false;
  const candidatePostKeysList = [...candidateByKey.keys()].slice(0, 30);
  const enc = encodeURIComponent(keyword);

  const sources = [
    { label: "pc-integrated" as const, url: `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&query=${enc}`, ua: PC_UA },
    { label: "mobile-integrated" as const, url: `https://m.search.naver.com/search.naver?where=nexearch&sm=top_hty&query=${enc}`, ua: MOBILE_UA },
    { label: "pc-view" as const, url: `https://search.naver.com/search.naver?where=view&sm=tab_jum&query=${enc}`, ua: PC_UA },
    { label: "mobile-view" as const, url: `https://m.search.naver.com/search.naver?where=m_view&query=${enc}`, ua: MOBILE_UA },
  ] as const;

  const resultsByLabel: Partial<Record<string, SourceMatchResult>> = {};
  let winner: (typeof sources)[number] | null = null;
  let winnerResult: SourceMatchResult | null = null;

  for (const source of sources) {
    const result = await fetchAndMatchBlogPosts(
      source.url,
      normalizedBlogId,
      candidateByKey,
      shouldRestrictToCandidates,
      source.ua
    );
    resultsByLabel[source.label] = result;

    // 403 / 차단 → 다음 소스
    const st = result.sourceResult.httpStatus;
    if (st != null && st >= 400) continue;
    if (result.sourceResult.isCaptchaPage || result.sourceResult.isBlockedPage) continue;

    if (result.matches.length > 0) {
      winner = source;
      winnerResult = result;
      break;
    }
    // 블로그 글 링크가 전혀 없으면 다음 소스로 폴백
    if (result.sourceResult.noBlogResult) continue;
    // candidate 제한으로 매칭 안 됐지만 링크는 있었음 → 계속 시도
  }

  // ── 공통 디버그 데이터 ─────────────────────────────────────────────────
  const pcResult = resultsByLabel["pc-integrated"];
  const primaryResult =
    pcResult?.sourceResult.checked
      ? pcResult
      : Object.values(resultsByLabel).find((r) => r?.sourceResult.checked) ?? undefined;

  const rawHtml = primaryResult?.rawHtml ?? "";
  const html = primaryResult?.html ?? "";
  const htmlLength = primaryResult?.sourceResult.htmlLength ?? 0;
  const htmlTitle = extractHtmlTitle(rawHtml);
  const blockState = detectPageBlockState(rawHtml);

  const htmlContainsBlogNaverCom = rawHtml.includes("blog.naver.com");
  const htmlContainsPostView = rawHtml.includes("PostView.naver");
  const htmlContainsViewSection = /\bview\b|VIEW_ALL|m_view/i.test(rawHtml);
  const htmlContainsApiData = /__NEXT_DATA__|nxData|"collection"|"viewType"/i.test(rawHtml);

  const firstBlogNaverIdx = rawHtml.indexOf("blog.naver.com");
  const firstBlogNaverPreview = firstBlogNaverIdx >= 0
    ? rawHtml.slice(Math.max(0, firstBlogNaverIdx - 100), firstBlogNaverIdx + 900)
    : "";
  const firstPostViewIdx = rawHtml.indexOf("PostView.naver");
  const firstPostViewPreview = firstPostViewIdx >= 0
    ? rawHtml.slice(Math.max(0, firstPostViewIdx - 50), firstPostViewIdx + 450)
    : "";

  // 모든 소스 중 blog.naver.com을 포함하는 소스의 샘플을 합산
  const bestMobileSamples: SourceCheckResult =
    (resultsByLabel["mobile-integrated"]?.sourceResult.htmlContainsBlogNaverCom
      ? resultsByLabel["mobile-integrated"]?.sourceResult
      : resultsByLabel["mobile-view"]?.sourceResult.htmlContainsBlogNaverCom
        ? resultsByLabel["mobile-view"]?.sourceResult
        : null) ?? emptySourceCheck();

  const allBlogNaverPreviews = bestMobileSamples.allBlogNaverPreviews.length > 0
    ? bestMobileSamples.allBlogNaverPreviews
    : (primaryResult ? collectBlogNaverSamples(html, rawHtml, normalizedBlogId).allBlogNaverPreviews : []);
  const blogNaverMatchRawSamples = bestMobileSamples.blogNaverMatchRawSamples.length > 0
    ? bestMobileSamples.blogNaverMatchRawSamples
    : (primaryResult ? collectBlogNaverSamples(html, rawHtml, normalizedBlogId).blogNaverMatchRawSamples : []);
  const mBlogNaverMatchRawSamples = bestMobileSamples.mBlogNaverMatchRawSamples;
  const encodedBlogUrlSamples = bestMobileSamples.encodedBlogUrlSamples;

  const candidateKeys = [...candidateByKey.keys()];
  const containsBlogId = new RegExp(
    `blog\\.naver\\.com\\/${escapeRegExp(normalizedBlogId)}(?:\\b|\\/|&|%2F)`, "i"
  ).test(html);
  const containsCandidateLogNo = candidateKeys.length > 0 &&
    candidateKeys.some((key) => {
      const logNo = key.split(":")[1];
      return logNo ? rawHtml.includes(logNo) : false;
    });

  const sectionTitleCandidates = primaryResult?.sectionTitleCandidates ?? [];

  const pcExtracted = pcResult ? extractBlogPostKeysFromHtml(pcResult.rawHtml, pcResult.html, normalizedBlogId) : [];
  const extractedBlogPostKeys = pcExtracted.map((e) => e.key).slice(0, 30);

  const sampleIntegratedSearchHtmlLinks = (pcResult?.sourceResult.sampleHtmlLinks ?? []).slice(0, 10);
  const sampleDecodedIntegratedSearchLinks = sampleIntegratedSearchHtmlLinks
    .map((l) => safeDecodeUri(decodeHtmlEntities(l)))
    .filter((l) => /blog\.naver\.com/i.test(l))
    .slice(0, 10);

  const isSearchPageWithNoBlogResults = htmlLength > 10_000 && !htmlContainsBlogNaverCom;
  const noBlogResult = winnerResult === null &&
    Object.values(resultsByLabel).every((r) => !r || r.sourceResult.noBlogResult || !r.sourceResult.checked);
  const noCandidateMatch = winnerResult === null &&
    Object.values(resultsByLabel).some((r) => r && !r.sourceResult.noBlogResult && r.sourceResult.checked);
  const matchedPostKeys = winnerResult ? [...new Set(winnerResult.matches.map((m) => m.key))].slice(0, 30) : [];

  const pcIntegrated = resultsByLabel["pc-integrated"]?.sourceResult ?? emptySourceCheck();
  const mobileIntegrated = resultsByLabel["mobile-integrated"]?.sourceResult ?? emptySourceCheck();
  const pcView = resultsByLabel["pc-view"]?.sourceResult ?? emptySourceCheck();
  const mobileView = resultsByLabel["mobile-view"]?.sourceResult ?? emptySourceCheck();
  const matchedSource = winner?.label ?? null;
  const firstNaverSearchStatus =
    pcIntegrated.httpStatus ?? mobileIntegrated.httpStatus ?? pcView.httpStatus ?? mobileView.httpStatus ?? null;

  const isCaptchaPage = blockState.isCaptchaPage;
  const isBlockedPage = blockState.isBlockedPage;

  const debugBase = emptyDebug({
    htmlFetched: !!primaryResult?.sourceResult.checked,
    htmlLength,
    htmlTitle,
    containsBlogId,
    containsCandidateLogNo,
    matchedUrlCount: matchedPostKeys.length,
    sectionTitleCandidates,
    firstNaverSearchStatus,
    blockedOrCaptchaDetected: isCaptchaPage || isBlockedPage,
    isCaptchaPage,
    isBlockedPage,
    blockDetectionReason: blockState.blockDetectionReason,
    noBlogResult,
    noCandidateMatch,
    isSearchPageWithNoBlogResults,
    sampleIntegratedSearchHtmlLinks,
    sampleDecodedIntegratedSearchLinks,
    extractedBlogPostKeys,
    candidatePostKeys: candidatePostKeysList,
    matchedPostKeys,
    htmlContainsBlogNaverCom,
    htmlContainsPostView,
    htmlContainsViewSection,
    htmlContainsApiData,
    firstBlogNaverPreview,
    firstPostViewPreview,
    allBlogNaverPreviews,
    blogNaverMatchRawSamples,
    mBlogNaverMatchRawSamples,
    encodedBlogUrlSamples,
    pcIntegrated,
    mobileIntegrated,
    pcView,
    mobileView,
    matchedSource,
  });

  if (!winnerResult || !winner) {
    return { ...emptyExposure(), debug: debugBase };
  }

  const matches = winnerResult.matches;
  matches.sort((a, b) => a.index - b.index);
  const first = matches[0];
  const context = winnerResult.html.slice(Math.max(0, first.index - 3000), first.index + 3000);
  const rank = extractResultRankFromContext(context);
  const smartBlock = isSmartBlockContext(context);
  const candidate = candidateByKey.get(first.key);

  return {
    matched: true,
    integratedSearchRank: rank,
    integratedSearchBlock: smartBlock ? "스마트블록" : inferBlockLabelFromHtmlPosition(winnerResult.html, first.index, rank),
    smartBlockCount: smartBlock ? 1 : 0,
    exposureType: smartBlock ? "smartblock" : "integrated",
    matchedPostKey: first.key,
    matchedPostUrl: candidate?.url ?? `https://blog.naver.com/${normalizedBlogId}/${first.logNo}`,
    matchedPostTitle: candidate?.title ?? null,
    debug: debugBase,
  };
}
