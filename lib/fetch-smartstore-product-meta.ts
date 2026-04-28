import {
  cooldownOn429,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";
import * as cheerio from "cheerio";
import {
  buildNaverJsonFetchHeadersUnified,
  buildSmartstoreMobileDocumentFetchHeaders,
  loadSystemConfigNaverCookie,
  SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
} from "@/lib/naver-smartstore-unified-fetch-headers";

/**
 * 네이버 스마트스토어·브랜드스토어 상품 상세 JSON API (HTML 없음).
 * 브라우저와 동일하게 `channelUid` 경로를 쓰기 위해 슬러그로 채널 메타를 조회한 뒤
 * `/n/v2/channels/{channelUid}/products/{id}` 를 최우선 시도합니다.
 */

export type SmartstoreProductMeta = {
  name: string | null;
  imageUrl: string | null;
  category: string | null;
};

export type SmartstoreProductFetchResult = {
  name: string;
  category: string | null;
  imageUrl: string | null;
  imageUrls: string[];
};

export const SMARTSTORE_PRODUCT_IMAGE_FALLBACK = "/file.svg";

export const SMARTSTORE_TRACE_LOG = "[smartstore]";

const FETCH_TIMEOUT_MS = 12_000;

/** 서버 fetch: 브라우저 XHR와 유사한 헤더. browserMinimal: 클라이언트 fetch(CORS·브라우저 제약)용 최소 헤더 */
export type NaverSmartstoreMetaHeaderMode = "serverLike" | "browserMinimal";

/** 브라우저 XHR와 유사한 헤더 (API URL마다 Sec-Fetch-Site·Host 정합) */
function buildNaverApiRequestHeaders(
  productPageUrl: string,
  requestUrl: string,
  naverCookie: string
): Record<string, string> {
  const productId = extractProductId(productPageUrl) ?? "";
  return buildNaverJsonFetchHeadersUnified({
    productId,
    naverCookie,
    productPageUrl,
    requestUrl,
  });
}

function buildNaverMetaFetchHeaders(
  productPageUrl: string,
  requestUrl: string,
  mode: NaverSmartstoreMetaHeaderMode,
  naverCookie: string
): Record<string, string> {
  if (mode === "browserMinimal") {
    return {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": SMARTSTORE_UNIFIED_ACCEPT_LANGUAGE,
      Referer: productPageUrl,
    };
  }
  return buildNaverApiRequestHeaders(productPageUrl, requestUrl, naverCookie);
}

/** 저장 API·로그 호환. HTML 미사용 시 html* 필드는 고정 플레이스홀더, 본 응답은 api* 및 상단 필드에 반영 */
export type SmartstoreProductPageFetchDiag = {
  requestUrl: string;
  /** API 최종 URL(리다이렉트 반영) */
  responseUrl: string;
  /** API HTTP status (호환 필드명 유지) */
  status: number;
  responseOk: boolean;
  contentType: string | null;
  /** API 본문 앞 500자 */
  bodyHeadSample: string;
  /** HTML 미사용: 0 */
  htmlStatus: number;
  htmlResponseUrl: string;
  htmlHeadSample: string;
  apiUrl: string | null;
  apiStatus: number | null;
  apiHeadSample: string | null;
};

export type FetchSmartstoreProductMetaResult = {
  meta: SmartstoreProductMeta;
  productPageFetch: SmartstoreProductPageFetchDiag | null;
};

type MetaFieldSources = {
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  imageUrlsSource: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function normalizeProductUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return t.startsWith("http") ? t : `https://${t}`;
}

function trimName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** smartstore / brand / 모바일 등 경로의 숫자 productId */
function extractProductId(rawUrl: string): string | null {
  const m = rawUrl.match(/\/products\/(\d+)/i);
  return m?.[1] ?? null;
}

function toMobileProductUrl(productUrl: string, productId: string | null): string {
  try {
    const u = new URL(productUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    const slug = pi > 0 ? segs[pi - 1] : null;
    const pid = productId?.trim() || (pi >= 0 ? segs[pi + 1] : null);
    if (!slug || !pid) return productUrl;
    if (host === "brand.naver.com" || host === "m.brand.naver.com") {
      return `https://m.brand.naver.com/${encodeURIComponent(slug)}/products/${encodeURIComponent(pid)}`;
    }
    if (host === "smartstore.naver.com" || host === "m.smartstore.naver.com") {
      return `https://m.smartstore.naver.com/${encodeURIComponent(slug)}/products/${encodeURIComponent(pid)}`;
    }
  } catch {
    // ignore
  }
  return productUrl;
}

function firstStringCandidate(values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return null;
}

async function fetchSmartstoreProductMetaViaMobileHtml(
  productUrl: string,
  naverProductId: string | null
): Promise<FetchSmartstoreProductMetaResult> {
  const normalized = normalizeProductUrl(productUrl);
  const productIdResolved = (naverProductId?.trim() || extractProductId(normalized)) ?? null;
  const mobileUrl = toMobileProductUrl(normalized, productIdResolved);

  const naverCookie = await loadSystemConfigNaverCookie();

  const requestHeaders = buildSmartstoreMobileDocumentFetchHeaders({
    mobileUrl,
    normalizedProductUrl: normalized,
    productId: productIdResolved,
    naverCookie,
  });

  await randomSmartstoreDelay("save");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let res: Response;
  try {
    res = await fetch(mobileUrl, {
      method: "GET",
      headers: requestHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    await cooldownOn429();
    throw new SmartstoreNaverRateLimitedError("네이버가 요청을 일시적으로 제한(HTTP 429)했습니다.");
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Fail-fast: og tags are most stable. If missing, do not do slow/fragile fallbacks.
  const ogTitle = firstStringCandidate([$('meta[property="og:title"]').attr("content")]);
  const ogImage = firstStringCandidate([$('meta[property="og:image"]').attr("content")]);
  const name = ogTitle ? trimName(ogTitle) : null;
  const imageUrl = ogImage ?? null;

  const productPageFetch: SmartstoreProductPageFetchDiag = {
    requestUrl: mobileUrl,
    responseUrl: res.url || mobileUrl,
    status: res.status,
    responseOk: res.ok,
    contentType: res.headers.get("content-type"),
    bodyHeadSample: html.slice(0, 500) || "(빈 본문)",
    htmlStatus: res.status,
    htmlResponseUrl: res.url || mobileUrl,
    htmlHeadSample: html.slice(0, 500) || "(빈 본문)",
    apiUrl: null,
    apiStatus: null,
    apiHeadSample: null,
  };

  return {
    meta: {
      name: name && name.trim() ? name : null,
      imageUrl: imageUrl?.trim() ? imageUrl.trim() : null,
      category: null,
    },
    productPageFetch,
  };
}

function mergeImageUrlsUnique(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const u of list) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}

/** brand/smartstore 상품 URL에서 `/스토어슬러그/products/숫자` 슬러그 */
function extractChannelSlugFromProductUrl(normalized: string): string | null {
  try {
    const u = new URL(normalized);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h !== "brand.naver.com" && h !== "smartstore.naver.com") return null;
    const segs = u.pathname.split("/").filter(Boolean);
    const pi = segs.indexOf("products");
    if (pi > 0 && /^\d+$/.test(segs[pi + 1] ?? "")) {
      return segs[pi - 1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function extractChannelUidFromJsonPayload(parsed: unknown): string | null {
  const root = asRecord(parsed);
  if (!root) return null;
  const tryUid = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const d = tryUid(root.channelUid);
  if (d) return d;

  const data = asRecord(root.data);
  if (data) {
    const u1 = tryUid(data.channelUid);
    if (u1) return u1;
    const ch = asRecord(data.channel);
    const u2 = tryUid(ch?.channelUid);
    if (u2) return u2;
  }

  const chRoot = asRecord(root.channel);
  const u3 = tryUid(chRoot?.channelUid);
  if (u3) return u3;

  return null;
}

/** 스토어 슬러그 → channelUid (브라우저 네트워크와 동일한 경로용) */
async function tryResolveBrandChannelUidBySlug(
  slug: string,
  signal: AbortSignal,
  productPageUrl: string,
  headerMode: NaverSmartstoreMetaHeaderMode,
  naverCookie: string
): Promise<string | null> {
  const candidates = [
    `https://brand.naver.com/n/v2/channels/${encodeURIComponent(slug)}?withWindow=false`,
    `https://smartstore.naver.com/i/v2/channels/${encodeURIComponent(slug)}?withWindow=false`,
  ];
  for (const metaUrl of candidates) {
    try {
      const headers = buildNaverMetaFetchHeaders(productPageUrl, metaUrl, headerMode, naverCookie);
      await randomSmartstoreDelay("save");
      const res = await fetch(metaUrl, {
        signal,
        redirect: "follow",
        headers,
        cache: "no-store",
      });
      if (res.status === 429) {
        await cooldownOn429();
        throw new SmartstoreNaverRateLimitedError(
          `네이버 채널 메타 조회가 일시적으로 제한(HTTP 429)되었습니다.`
        );
      }
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim().startsWith("{")) continue;
      const parsed = JSON.parse(text) as unknown;
      const uid = extractChannelUidFromJsonPayload(parsed);
      if (uid) {
        return uid;
      }
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

function dedupeStrings(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

type NaverProductApiCandidates = { urls: string[]; channelUid: string | null };

/** 시도할 상품 API URL (앞쪽 우선). channelUid URL을 최우선에 둠 */
async function buildNaverProductDetailApiUrlCandidates(
  normalized: string,
  productId: string,
  signal: AbortSignal,
  headerMode: NaverSmartstoreMetaHeaderMode,
  naverCookie: string
): Promise<NaverProductApiCandidates> {
  const pid = encodeURIComponent(productId);
  const slug = extractChannelSlugFromProductUrl(normalized);
  const urls: string[] = [];
  let channelUid: string | null = null;

  try {
    const u = new URL(normalized);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (slug && (h === "brand.naver.com" || h === "smartstore.naver.com")) {
      channelUid = await tryResolveBrandChannelUidBySlug(
        slug,
        signal,
        normalized,
        headerMode,
        naverCookie
      );
      if (channelUid) {
        urls.push(
          `https://brand.naver.com/n/v2/channels/${encodeURIComponent(channelUid)}/products/${pid}?withWindow=false`
        );
      }
    }
    if (slug) {
      const hn = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
      if (hn === "brand.naver.com") {
        urls.push(
          `https://brand.naver.com/n/v2/channels/${encodeURIComponent(slug)}/products/${pid}?withWindow=false`
        );
      } else if (hn === "smartstore.naver.com") {
        urls.push(
          `https://smartstore.naver.com/i/v2/channels/${encodeURIComponent(slug)}/products/${pid}?withWindow=false`
        );
        urls.push(
          `https://brand.naver.com/n/v2/channels/${encodeURIComponent(slug)}/products/${pid}?withWindow=false`
        );
      }
    }
  } catch {
    /* ignore */
  }

  urls.push(`https://brand.naver.com/n/v2/products/${pid}?withWindow=false`);

  if (headerMode === "serverLike") {
    try {
      const u = new URL(normalized);
      const h = u.hostname.toLowerCase().replace(/^www\./, "");
      if (slug && (h === "brand.naver.com" || h === "smartstore.naver.com")) {
        if (channelUid) {
          console.log(`${SMARTSTORE_TRACE_LOG} [meta] ③ channelUid`, channelUid);
        } else {
          console.log(`${SMARTSTORE_TRACE_LOG} [meta] ③ channelUid 추출 실패`, { slug });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { urls: dedupeStrings(urls), channelUid };
}

function joinCategoryBreadcrumb(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t
    .split(">")
    .map((p) => p.trim().replace(/\s*\/\s*/g, " / ").trim())
    .filter(Boolean)
    .join(" > ");
}

/** API 루트 JSON에서 상품 객체(로그·추출용 `data`에 해당) */
function resolveInnerProductFromApiRoot(data: Record<string, unknown>): Record<string, unknown> | null {
  const root = asRecord(data);
  const dataObj = asRecord(root?.data);
  const inner =
    asRecord(dataObj?.product) ??
    asRecord(dataObj?.simpleProduct) ??
    dataObj ??
    asRecord(root?.product) ??
    root;
  return inner ?? null;
}

function logResolvedApiProductSnapshot(
  inner: Record<string, unknown>,
  apiUrl: string
): void {
  const cat = asRecord(inner.category);
  const rep = asRecord(inner.representImage);
  const p0 = Array.isArray(inner.productImages) ? inner.productImages[0] : undefined;
  let p0url: string | null = null;
  if (typeof p0 === "string" && p0.trim()) p0url = p0.trim();
  else {
    const fo = asRecord(p0);
    if (typeof fo?.url === "string" && fo.url.trim()) p0url = fo.url.trim();
  }
  console.log(`${SMARTSTORE_TRACE_LOG} [meta] ⑥ 응답 JSON 주요 필드`, {
    apiUrl,
    "data.name": typeof inner.name === "string" ? inner.name : null,
    "data.dispName": typeof inner.dispName === "string" ? inner.dispName : null,
    "data.category?.wholeCategoryName":
      typeof cat?.wholeCategoryName === "string" ? cat.wholeCategoryName : null,
    "data.category?.categoryName":
      typeof cat?.categoryName === "string" ? cat.categoryName : null,
    "data.representImage?.url": typeof rep?.url === "string" ? rep.url : null,
    "data.productImages?.[0]?.url": p0url,
  });
}

/**
 * 최종 메타: name = dispName || name, category = category.wholeCategoryName || categoryName,
 * thumbnail = representImage.url || productImages[0].url → imageUrl 동일
 */
function extractProductFieldsFromJson(
  data: Record<string, unknown>
): SmartstoreProductFetchResult & { sources: MetaFieldSources } {
  const sources: MetaFieldSources = {
    name: null,
    imageUrl: null,
    category: null,
    imageUrlsSource: null,
  };

  const inner = resolveInnerProductFromApiRoot(data);
  if (!inner) {
    return {
      name: "",
      category: null,
      imageUrl: null,
      imageUrls: [],
      sources,
    };
  }

  const disp =
    typeof inner.dispName === "string" && inner.dispName.trim()
      ? trimName(inner.dispName)
      : "";
  const n =
    typeof inner.name === "string" && inner.name.trim() ? trimName(inner.name) : "";
  const nameStr = disp || n;
  if (disp) sources.name = "dispName";
  else if (n) sources.name = "name";

  const catObj = asRecord(inner.category);
  const wcRaw =
    typeof catObj?.wholeCategoryName === "string" && catObj.wholeCategoryName.trim()
      ? catObj.wholeCategoryName.trim()
      : "";
  const wc = wcRaw ? joinCategoryBreadcrumb(wcRaw) : "";
  const cn =
    typeof catObj?.categoryName === "string" && catObj.categoryName.trim()
      ? catObj.categoryName.trim()
      : "";
  const categoryStr = wc || cn ? wc || cn : null;
  if (wc) sources.category = "category.wholeCategoryName";
  else if (cn) sources.category = "category.categoryName";

  const rep = asRecord(inner.representImage);
  const repUrl =
    typeof rep?.url === "string" && rep.url.trim() ? rep.url.trim() : null;
  let p0: string | null = null;
  if (Array.isArray(inner.productImages) && inner.productImages.length > 0) {
    const first = inner.productImages[0];
    if (typeof first === "string" && first.trim()) p0 = first.trim();
    else {
      const fo = asRecord(first);
      if (typeof fo?.url === "string" && fo.url.trim()) p0 = fo.url.trim();
    }
  }
  const thumbnailLink = repUrl || p0 || null;
  const imageUrl = thumbnailLink;
  if (repUrl) sources.imageUrl = "representImage.url";
  else if (p0) sources.imageUrl = "productImages[0].url";

  const imageUrls = thumbnailLink ? [thumbnailLink] : [];

  return {
    name: nameStr,
    category: categoryStr,
    imageUrl,
    imageUrls,
    sources,
  };
}

type CoreResult = {
  result: SmartstoreProductFetchResult;
  productPageFetch: SmartstoreProductPageFetchDiag | null;
};

async function fetchSmartstoreProductCore(
  url: string,
  productIdOverride: string | null,
  signal: AbortSignal,
  headerMode: NaverSmartstoreMetaHeaderMode = "serverLike"
): Promise<CoreResult> {
  const empty: SmartstoreProductFetchResult = {
    name: "",
    category: null,
    imageUrl: null,
    imageUrls: [],
  };

  const normalized = normalizeProductUrl(url);
  
  let productPageFetch: SmartstoreProductPageFetchDiag | null = null;

  const productId = (productIdOverride?.trim() || extractProductId(normalized)) ?? null;

  if (!productId) {
    console.error("[smartstore] productId 추출 실패");
    return { result: empty, productPageFetch: null };
  }

  const naverCookie = await loadSystemConfigNaverCookie();

  let apiCandidates: string[] = [];
  try {
    const built = await buildNaverProductDetailApiUrlCandidates(
      normalized,
      productId,
      signal,
      headerMode,
      naverCookie
    );
    apiCandidates = built.urls;
  } catch {
    apiCandidates = [
      `https://brand.naver.com/n/v2/products/${encodeURIComponent(productId)}?withWindow=false`,
    ];
  }

  const htmlPlaceholder = "(HTML 미사용)";
  productPageFetch = {
    requestUrl: normalized,
    responseUrl: normalized,
    status: 0,
    responseOk: false,
    contentType: null,
    bodyHeadSample: htmlPlaceholder,
    htmlStatus: 0,
    htmlResponseUrl: normalized,
    htmlHeadSample: htmlPlaceholder,
    apiUrl: apiCandidates[0] ?? null,
    apiStatus: null,
    apiHeadSample: null,
  };

  let apiStatus = 0;
  let apiText = "";
  let lastApiUrl = apiCandidates[0] ?? "";

  const mergeField = (
    acc: SmartstoreProductFetchResult,
    extracted: SmartstoreProductFetchResult
  ): void => {
    if (!acc.name.trim() && extracted.name.trim()) acc.name = extracted.name;
    if (!acc.imageUrl && extracted.imageUrl) acc.imageUrl = extracted.imageUrl;
    if (!acc.category && extracted.category) acc.category = extracted.category;
    acc.imageUrls = mergeImageUrlsUnique(acc.imageUrls, extracted.imageUrls);
  };

  try {
    const merged: SmartstoreProductFetchResult = {
      name: "",
      category: null,
      imageUrl: null,
      imageUrls: [],
    };
    for (const apiUrl of apiCandidates) {
      lastApiUrl = apiUrl;
      if (productPageFetch) productPageFetch.apiUrl = apiUrl;

      try {
        if (headerMode === "serverLike") {
          console.log(`${SMARTSTORE_TRACE_LOG} [meta] ④ 요청 API URL`, apiUrl);
        }

        const requestHeaders = buildNaverMetaFetchHeaders(
          normalized,
          apiUrl,
          headerMode,
          naverCookie
        );

        await randomSmartstoreDelay("save");
        const apiRes = await fetch(apiUrl, {
          signal,
          redirect: "follow",
          headers: requestHeaders,
          cache: "no-store",
        });
        apiStatus = apiRes.status;
        apiText = await apiRes.text();
        const apiHeadSample = apiText.slice(0, 500);
        const apiCt = apiRes.headers.get("content-type");
        const finalUrl = apiRes.url || apiUrl;

        if (productPageFetch) {
          productPageFetch.apiStatus = apiStatus;
          productPageFetch.apiHeadSample =
            apiHeadSample.length > 0 ? apiHeadSample : "(빈 본문)";
          productPageFetch.responseUrl = finalUrl;
          productPageFetch.status = apiStatus;
          productPageFetch.responseOk = apiRes.ok;
          productPageFetch.contentType = apiCt;
          productPageFetch.bodyHeadSample =
            apiHeadSample.length > 0 ? apiHeadSample : "(빈 본문)";
        }

        if (headerMode === "serverLike") {
          console.log(`${SMARTSTORE_TRACE_LOG} [meta] ⑤ response status`, apiStatus);
        }

        if (apiStatus === 429) {
          const responseHeaders = Object.fromEntries(apiRes.headers.entries());
          console.error(`${SMARTSTORE_TRACE_LOG} API 429`, {
            apiUrl,
            productId,
            normalizedUrl: normalized,
            bodyHead500:
              apiHeadSample.length > 0 ? apiHeadSample : "(빈 본문)",
            responseHeaders,
          });
          await cooldownOn429();
          throw new SmartstoreNaverRateLimitedError(
            `네이버 상품 API가 일시적으로 제한(HTTP 429)되었습니다.`
          );
        }

        if (apiRes.status !== 200) {
          if (headerMode === "serverLike") {
            console.log(`${SMARTSTORE_TRACE_LOG} [meta] (비200) response body 일부`, {
              apiUrl,
              status: apiStatus,
              bodyHead: apiText.slice(0, 800),
            });
          }
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(apiText) as unknown;
        } catch (parseErr) {
          console.warn("[smartstore] JSON 파싱 실패 (다음 후보 시도)", apiUrl, parseErr);
          continue;
        }

        const rawRoot = asRecord(parsed);
        if (!rawRoot) {
          console.warn("[smartstore] API JSON 최상위가 객체 아님 (다음 후보)", { apiUrl });
          continue;
        }

        const innerSnap = resolveInnerProductFromApiRoot(rawRoot);
        if (headerMode === "serverLike" && innerSnap) {
          logResolvedApiProductSnapshot(innerSnap, apiUrl);
        } else if (headerMode === "serverLike") {
          console.log(`${SMARTSTORE_TRACE_LOG} [meta] ⑥ 응답 JSON 주요 필드`, {
            apiUrl,
            note: "상품 inner 객체를 찾지 못함",
          });
        }

        const extracted = extractProductFieldsFromJson(rawRoot);
        const { sources, ...slice } = extracted;
        void sources;
        mergeField(merged, slice);

        if (merged.name.trim() && merged.imageUrl && merged.category) {
          break;
        }
      } catch (loopErr) {
        console.warn("[smartstore] API 후보 요청 중 예외 (다음 후보)", apiUrl, loopErr);
        continue;
      }
    }

    if (
      !merged.name.trim() &&
      !merged.imageUrl &&
      !merged.category &&
      merged.imageUrls.length === 0
    ) {
      console.error("[smartstore] 모든 API 후보 실패 또는 빈 메타", {
        candidates: apiCandidates,
        lastStatus: apiStatus,
      });
      return { result: { ...empty }, productPageFetch };
    }

    return { result: merged, productPageFetch };
  } catch (e) {
    console.error("[smartstore] API fetch 예외", e);
    if (productPageFetch) {
      productPageFetch.apiStatus = apiStatus || null;
      productPageFetch.apiHeadSample =
        apiText.length > 0 ? apiText.slice(0, 500) : "(없음)";
      productPageFetch.apiUrl = lastApiUrl;
    }
    console.log(`${SMARTSTORE_TRACE_LOG} API fetch`, {
      apiUrl: lastApiUrl,
      apiStatus: apiStatus || "(없음)",
      note: "예외",
    });
    return { result: { ...empty }, productPageFetch };
  }
}

/** 네이버 상품 JSON API만 사용 (HTML 없음). */
export async function fetchSmartstoreProduct(url: string): Promise<SmartstoreProductFetchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const normalized = normalizeProductUrl(url);
    const productId = extractProductId(normalized);
    console.log(`${SMARTSTORE_TRACE_LOG} [meta] ① 입력 URL`, normalized);
    console.log(`${SMARTSTORE_TRACE_LOG} [meta] ② productId`, productId ?? "(없음)");
    const { result } = await fetchSmartstoreProductCore(url, null, ctrl.signal, "serverLike");
    console.log(`${SMARTSTORE_TRACE_LOG} [meta] ⑦ 최종 result`, {
      name: result.name.trim() ? result.name.trim() : null,
      category: result.category,
      thumbnailLink: result.imageUrl,
      imageUrl: result.imageUrl,
    });
    return result;
  } catch (e) {
    console.error("[fetchSmartstoreProduct]", e);
    return {
      name: "",
      category: null,
      imageUrl: null,
      imageUrls: [],
    };
  } finally {
    clearTimeout(t);
  }
}

const EMPTY_FETCH_RESULT: SmartstoreProductFetchResult = {
  name: "",
  category: null,
  imageUrl: null,
  imageUrls: [],
};

/**
 * 예전: 브라우저에서 네이버 JSON 직접 호출. 네이버는 CORS를 허용하지 않아 `TypeError: Failed to fetch`가 남.
 * **비활성화**: 네트워크 요청 없이 빈 결과만 반환(throw 없음). 호출부는 깨지지 않게 API 유지.
 */
export async function fetchSmartstoreProductInBrowser(
  _url: string,
  _externalSignal?: AbortSignal
): Promise<SmartstoreProductFetchResult> {
  void _url;
  void _externalSignal;
  return { ...EMPTY_FETCH_RESULT };
}

function toMeta(r: SmartstoreProductFetchResult): SmartstoreProductMeta {
  return {
    name: r.name.trim() ? r.name.trim() : null,
    imageUrl: r.imageUrl,
    category: r.category,
  };
}

/** 기존 저장 API 호환: meta + fetch 진단 (HTML 필드는 플레이스홀더) */
export async function fetchSmartstoreProductMeta(
  productUrl: string,
  naverProductId: string | null = null
): Promise<FetchSmartstoreProductMetaResult> {
  try {
    const normalized = normalizeProductUrl(productUrl);
    try {
      new URL(normalized);
    } catch {
      return { meta: { name: null, imageUrl: null, category: null }, productPageFetch: null };
    }

    console.log(`${SMARTSTORE_TRACE_LOG} [meta] (mobile) 입력 URL`, normalized);
    return await fetchSmartstoreProductMetaViaMobileHtml(normalized, naverProductId);
  } catch (e) {
    console.error("[fetchSmartstoreProductMeta]", e);
    return {
      meta: { name: null, imageUrl: null, category: null },
      productPageFetch: null,
    };
  }
}
