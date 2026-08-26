import * as cheerio from "cheerio";

/**
 * 네이버 Developers 쇼핑 검색 API 종료 후, 네이버 쇼핑 검색 화면이 사용하는
 * 슬롯 응답과 통합검색 가격비교 응답을 NewOrder 가격 후보 계약으로 변환하는
 * 격리 어댑터입니다.
 */
export type NaverShoppingSearchItem = {
  title: string;
  link: string;
  image?: string;
  lprice: string;
  mallName?: string;
  productId?: string;
  shippingFee?: number;
  deliveryFee?: number;
  deliveryFeeContent?: string;
  shippingInfo?: string;
};

type PortalUrl = {
  pcUrl?: string | null;
  mobileUrl?: string | null;
};

type PortalImage = {
  imageUrl?: string | null;
};

type PortalProduct = {
  cardType?: string | null;
  nvMid?: string | number | null;
  channelProductId?: string | number | null;
  originalMallProductId?: string | number | null;
  productName?: string | null;
  productUrl?: PortalUrl | null;
  productClickUrl?: PortalUrl | null;
  images?: PortalImage[] | null;
  mallName?: string | null;
  salePrice?: string | number | null;
  discountedSalePrice?: string | number | null;
  discountedKRWSalePrice?: string | number | null;
  deliveryFeeContent?: string | null;
  shippingInfo?: string | null;
  productDeliveryInfo?: {
    deliveryFee?: string | number | null;
    deliveryFeeTypes?: string[] | null;
  } | null;
};

type PortalResponse = {
  data?: Array<{
    slots?: Array<{
      data?: PortalProduct | null;
    }> | null;
  }> | null;
};

const SHOPPING_SLOT_API =
  "https://ns-portal.shopping.naver.com/api/v2/shopping-paged-slot";
const NAVER_PRICE_COMPARISON_SEARCH =
  "https://search.naver.com/search.naver";
const NAVER_SEARCH_GATE_HOST = "cr3.shopping.naver.com";
const NAVER_SEARCH_GATE_PATH = "/v2/bridge/searchGate";
const PRICE_COMPARISON_SECTION = '[data-slog-container="shp_dui"]';
const SHOPPING_PAGE_SIZE = 40;
const SEARCH_TIMEOUT_MS = 10_000;

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function compactText(value: unknown): string {
  return stringValue(value).replace(/\s+/g, " ");
}

function positiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(
      typeof value === "string" ? value.replaceAll(",", "") : value
    );
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function nonNegativeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(
    typeof value === "string" ? value.replaceAll(",", "") : value
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function firstString(...values: Array<string | null | undefined>): string {
  return values.map(stringValue).find(Boolean) ?? "";
}

function firstWebUrl(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const candidate = stringValue(value);
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return "";
}

function deliveryText(product: PortalProduct, deliveryFee: number | null) {
  const explicitText = firstString(
    product.deliveryFeeContent,
    product.shippingInfo
  );
  if (explicitText) return explicitText;
  if (deliveryFee != null && deliveryFee > 0) {
    return `배송비 ${deliveryFee.toLocaleString("ko-KR")}원`;
  }
  const rawDeliveryTypes = product.productDeliveryInfo?.deliveryFeeTypes;
  const deliveryTypes = Array.isArray(rawDeliveryTypes)
    ? rawDeliveryTypes
    : [];
  return deliveryTypes.some((type) => /FREE/i.test(type))
    ? "무료배송"
    : undefined;
}

function mapPortalProduct(
  product: PortalProduct
): NaverShoppingSearchItem | null {
  const title = stringValue(product.productName);
  const price = positiveNumber(
    product.discountedKRWSalePrice,
    product.discountedSalePrice,
    product.salePrice
  );
  const nvMid = stringValue(product.nvMid);
  const link = firstWebUrl(
    product.productUrl?.pcUrl,
    product.productUrl?.mobileUrl,
    product.productClickUrl?.pcUrl,
    product.productClickUrl?.mobileUrl,
    product.cardType === "CATALOG_CARD" && nvMid
      ? `https://search.shopping.naver.com/catalog/${encodeURIComponent(nvMid)}`
      : null
  );
  if (!title || !price || !link) return null;

  const deliveryFee = nonNegativeNumber(
    product.productDeliveryInfo?.deliveryFee
  );
  const deliveryFeeContent = deliveryText(product, deliveryFee);
  const images = Array.isArray(product.images) ? product.images : [];
  const image = firstWebUrl(...images.map((row) => row.imageUrl));
  const mallName = stringValue(product.mallName);
  const productId = firstString(
    nvMid,
    stringValue(product.channelProductId),
    stringValue(product.originalMallProductId)
  );

  return {
    title,
    link,
    ...(image ? { image } : {}),
    lprice: String(price),
    ...(mallName ? { mallName } : {}),
    ...(productId ? { productId } : {}),
    ...(deliveryFee != null
      ? { shippingFee: deliveryFee, deliveryFee }
      : {}),
    ...(deliveryFeeContent
      ? { deliveryFeeContent }
      : {}),
  };
}

export function parseNaverShoppingSearchResponse(
  payload: unknown
): NaverShoppingSearchItem[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("네이버 쇼핑 검색 응답 형식이 올바르지 않습니다.");
  }

  const pages = (payload as PortalResponse).data;
  if (!Array.isArray(pages)) {
    throw new Error("네이버 쇼핑 검색 결과 목록이 없습니다.");
  }

  const items: NaverShoppingSearchItem[] = [];
  let slotListCount = 0;
  let rawProductCount = 0;
  for (const page of pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.slots)) {
      continue;
    }
    slotListCount += 1;
    for (const slot of page.slots) {
      if (!slot || typeof slot !== "object" || !slot.data) continue;
      rawProductCount += 1;
      const mapped = mapPortalProduct(slot.data);
      if (mapped) items.push(mapped);
    }
  }
  if (pages.length > 0 && slotListCount === 0) {
    throw new Error("네이버 쇼핑 검색 슬롯 구조가 변경되었습니다.");
  }
  if (rawProductCount > 0 && items.length === 0) {
    throw new Error(
      "네이버 쇼핑 검색 상품의 제목·가격·링크 구조가 변경되었습니다."
    );
  }
  return items;
}

export function parseNaverPriceComparisonSearchResponse(
  html: string
): NaverShoppingSearchItem[] {
  if (!html.trim()) {
    throw new Error("네이버 가격비교 대체 검색 응답 본문이 비어 있습니다.");
  }

  const $ = cheerio.load(html);
  const pageText = compactText($("body").text());
  if (
    /보안 확인|접속이 일시적으로 제한|비정상적인 접근|captcha/i.test(
      pageText
    )
  ) {
    throw new Error("네이버 가격비교 검색 접근이 차단되었습니다.");
  }

  const section = $(PRICE_COMPARISON_SECTION);
  if (section.length === 0) {
    const isNormalSearchPage =
      /네이버 검색/.test(compactText($("title").text())) &&
      $("#container").length > 0;
    if (!isNormalSearchPage) {
      throw new Error("네이버 가격비교 대체 검색 응답 구조가 변경되었습니다.");
    }
    return [];
  }

  const items: NaverShoppingSearchItem[] = [];
  const seenProductIds = new Set<string>();
  let rawProductLinkCount = 0;

  section.find("a[href]").each((_index, element) => {
    const anchor = $(element);
    const link = stringValue(anchor.attr("href"));
    const title = compactText(anchor.text());
    if (!link || !title) return;

    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return;
    }
    if (
      url.hostname !== NAVER_SEARCH_GATE_HOST ||
      url.pathname !== NAVER_SEARCH_GATE_PATH
    ) {
      return;
    }

    rawProductLinkCount += 1;
    const productId = stringValue(url.searchParams.get("nv_mid"));
    if (!productId || seenProductIds.has(productId)) return;

    const card = anchor.closest("li");
    if (card.length === 0) return;
    const priceArea = anchor.next();
    const prices = priceArea
      .find("span")
      .toArray()
      .flatMap((priceElement) => {
        const price = compactText($(priceElement).text());
        const unit = compactText($(priceElement).next().text());
        return /^\d[\d,]*$/.test(price) && unit === "원"
          ? [Number(price.replaceAll(",", ""))]
          : [];
      })
      .filter((price) => Number.isFinite(price) && price > 0);
    const price = prices[prices.length - 1];
    if (!price) return;

    const image = firstWebUrl(card.find("img[src]").first().attr("src"));
    let mallName = "";
    for (const sellerElement of card.find("a[href]").toArray()) {
      const seller = $(sellerElement);
      const sellerName = compactText(seller.text());
      if (!sellerName) continue;
      try {
        if (
          new URL(stringValue(seller.attr("href"))).hostname !==
          NAVER_SEARCH_GATE_HOST
        ) {
          mallName = sellerName;
          break;
        }
      } catch {
        continue;
      }
    }

    let deliveryFee: number | null = null;
    let deliveryFeeContent: string | undefined;
    const shippingLabel = card
      .find("span")
      .toArray()
      .find((label) => compactText($(label).text()) === "배송비");
    if (shippingLabel) {
      const shippingText = compactText($(shippingLabel).parent().text());
      if (/무료/.test(shippingText)) {
        deliveryFee = 0;
        deliveryFeeContent = "무료배송";
      } else {
        const match = shippingText.match(/배송비\s*([\d,]+)\s*원/);
        deliveryFee = nonNegativeNumber(match?.[1]);
        if (deliveryFee != null) {
          deliveryFeeContent = `배송비 ${deliveryFee.toLocaleString("ko-KR")}원`;
        }
      }
    }

    seenProductIds.add(productId);
    items.push({
      title,
      link,
      ...(image ? { image } : {}),
      lprice: String(price),
      ...(mallName ? { mallName } : {}),
      productId,
      ...(deliveryFee != null
        ? { shippingFee: deliveryFee, deliveryFee }
        : {}),
      ...(deliveryFeeContent ? { deliveryFeeContent } : {}),
    });
  });

  if (rawProductLinkCount === 0 || items.length === 0) {
    throw new Error(
      "네이버 가격비교 상품의 제목·가격·링크 구조가 변경되었습니다."
    );
  }
  return items;
}

export function buildNaverShoppingSearchUrl(keyword: string): string {
  const url = new URL(SHOPPING_SLOT_API);
  url.searchParams.set("query", keyword.trim());
  url.searchParams.set("source", "shp_gui");
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", String(SHOPPING_PAGE_SIZE));
  return url.toString();
}

export function buildNaverPriceComparisonSearchUrl(keyword: string): string {
  const url = new URL(NAVER_PRICE_COMPARISON_SEARCH);
  url.searchParams.set("where", "shop");
  url.searchParams.set("query", keyword.trim());
  return url.toString();
}

async function searchNaverPriceComparison(
  keyword: string
): Promise<NaverShoppingSearchItem[]> {
  const requestUrl = buildNaverPriceComparisonSearchUrl(keyword);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut =
      cause instanceof Error &&
      (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw new Error(
      timedOut
        ? "네이버 가격비교 대체 검색 응답 시간이 초과되었습니다."
        : "네이버 가격비교 대체 검색 서버에 연결하지 못했습니다."
    );
  }

  const responseText = await response.text();
  if (!response.ok) {
    console.warn("[neworder/naver-shopping-search] 대체 검색 응답 실패", {
      keyword,
      status: response.status,
      responseBytes: responseText.length,
    });
    throw new Error(
      `네이버 가격비교 대체 검색 요청에 실패했습니다. (HTTP ${response.status})`
    );
  }
  return parseNaverPriceComparisonSearchResponse(responseText);
}

export async function searchNaverShopping(
  keyword: string
): Promise<NaverShoppingSearchItem[]> {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return [];

  const requestUrl = buildNaverShoppingSearchUrl(normalizedKeyword);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: `https://search.shopping.naver.com/ns/search?query=${encodeURIComponent(normalizedKeyword)}`,
        Origin: "https://search.shopping.naver.com",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut =
      cause instanceof Error &&
      (cause.name === "TimeoutError" || cause.name === "AbortError");
    throw new Error(
      `${normalizedKeyword}: ${
        timedOut
          ? "네이버 쇼핑 검색 응답 시간이 초과되었습니다."
          : "네이버 쇼핑 검색 서버에 연결하지 못했습니다."
      }`
    );
  }
  const responseText = await response.text();

  if (!response.ok) {
    console.warn("[neworder/naver-shopping-search] 검색 응답 실패", {
      keyword: normalizedKeyword,
      status: response.status,
      responsePreview: responseText.slice(0, 200),
    });
    throw new Error(
      `${normalizedKeyword}: 네이버 쇼핑 검색 요청에 실패했습니다. (HTTP ${response.status})`
    );
  }
  if (!responseText.trim()) {
    throw new Error(
      `${normalizedKeyword}: 네이버 쇼핑 검색 응답 본문이 비어 있습니다.`
    );
  }

  try {
    const items = parseNaverShoppingSearchResponse(JSON.parse(responseText));
    return items.length > 0
      ? items
      : await searchNaverPriceComparison(normalizedKeyword);
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new Error(
        `${normalizedKeyword}: 네이버 쇼핑 검색 응답이 JSON 형식이 아닙니다.`
      );
    }
    throw new Error(
      `${normalizedKeyword}: ${
        cause instanceof Error
          ? cause.message
          : "네이버 쇼핑 검색 응답을 해석하지 못했습니다."
      }`
    );
  }
}
