/**
 * 네이버 Developers 쇼핑 검색 API 종료 후, 네이버 쇼핑 검색 화면이 사용하는
 * 슬롯 응답을 NewOrder 가격 후보 계약으로 변환하는 격리 어댑터입니다.
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
const SHOPPING_PAGE_SIZE = 40;
const SEARCH_TIMEOUT_MS = 10_000;

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
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
  for (const page of pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.slots)) {
      continue;
    }
    for (const slot of page.slots) {
      if (!slot || typeof slot !== "object" || !slot.data) continue;
      const mapped = mapPortalProduct(slot.data);
      if (mapped) items.push(mapped);
    }
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
    return parseNaverShoppingSearchResponse(JSON.parse(responseText));
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
