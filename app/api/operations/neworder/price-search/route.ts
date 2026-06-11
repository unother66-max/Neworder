import { NextResponse } from "next/server";

import { getNewOrderAccess } from "@/lib/neworder/auth";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";
import {
  calculatePriceMetrics,
  type PriceMetrics,
} from "@/lib/neworder/price-analysis";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NaverShopItem = {
  title?: string;
  link?: string;
  image?: string;
  lprice?: string;
  mallName?: string;
  productId?: string;
};

type ResponseContext = {
  searchedKeywords?: string[];
  coupangSearchUrl?: string;
};

function success(
  candidates: Array<Record<string, unknown>>,
  context: Required<ResponseContext>,
  warning: string | null = null
) {
  return NextResponse.json({
    ok: true,
    candidates,
    message: null,
    ...context,
    warning,
  });
}

function failure(
  status: number,
  message: string,
  reason: string,
  context: ResponseContext = {}
) {
  return NextResponse.json(
    {
      ok: false,
      candidates: [],
      message,
      reason,
      searchedKeywords: context.searchedKeywords ?? [],
      coupangSearchUrl: context.coupangSearchUrl ?? null,
    },
    { status }
  );
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replaceAll("&quot;", '"').trim();
}

function dedupeKey(item: NaverShopItem): string {
  const productId = String(item.productId ?? "").trim();
  if (productId) return `product:${productId}`;
  const link = String(item.link ?? "").trim();
  if (!link) return "";
  try {
    const url = new URL(link);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("NaPm") || key.startsWith("nt_")) {
        url.searchParams.delete(key);
      }
    }
    return `link:${url.toString()}`;
  } catch {
    return `link:${link}`;
  }
}

function fallbackMetrics(itemPrice: number, shippingFee: number): PriceMetrics {
  const totalPrice =
    Math.max(0, Number(itemPrice) || 0) +
    Math.max(0, Number(shippingFee) || 0);
  return {
    unitCount: 1,
    packageUnit: "개",
    volumePerUnit: null,
    volumeUnit: null,
    totalPrice,
    unitPrice: totalPrice,
    totalVolume: null,
    pricePer100: null,
    pricePerMeasure: null,
  };
}

function safePriceMetrics(
  title: string,
  itemPrice: number,
  shippingFee: number
): PriceMetrics {
  try {
    return calculatePriceMetrics({ title, itemPrice, shippingFee });
  } catch (cause) {
    console.warn("[neworder/price-search] 상품 규격 분석 실패", {
      title,
      cause,
    });
    return fallbackMetrics(itemPrice, shippingFee);
  }
}

async function readNaverItems(
  response: Response,
  keyword: string
): Promise<NaverShopItem[]> {
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `${keyword}: 네이버 쇼핑 API HTTP ${response.status}${
        responseText ? ` - ${responseText.slice(0, 200)}` : ""
      }`
    );
  }
  if (!responseText.trim()) {
    throw new Error(`${keyword}: 네이버 쇼핑 API 응답 본문이 비어 있습니다.`);
  }

  try {
    const data = JSON.parse(responseText) as { items?: NaverShopItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    throw new Error(`${keyword}: 네이버 쇼핑 API 응답이 JSON 형식이 아닙니다.`);
  }
}

export async function GET(request: Request) {
  try {
    const access = await getNewOrderAccess();
    if (!access) {
      return failure(
        403,
        "활성 NewOrderOperator로 등록된 계정만 운영관리에 접근할 수 있습니다.",
        "활성 NewOrderOperator 권한이 없습니다."
      );
    }

    const itemId = new URL(request.url).searchParams.get("itemId")?.trim();
    if (!itemId) {
      return failure(400, "품목을 선택해 주세요.", "itemId가 필요합니다.");
    }

    const item = await prisma.newOrderItem.findUnique({
      where: { id: itemId },
      select: {
        name: true,
        naverSearchKeyword: true,
        naverSearchKeywords: true,
        coupangSearchKeyword: true,
        coupangSearchKeywords: true,
        excludedKeywords: true,
      },
    });
    if (!item) {
      return failure(
        404,
        "품목을 찾을 수 없습니다.",
        "선택한 품목이 존재하지 않습니다."
      );
    }

    const naverSearchKeywords = normalizeStringArray(
      item.naverSearchKeywords
    );
    const coupangSearchKeywords = normalizeStringArray(
      item.coupangSearchKeywords
    );
    const excludedKeywords = normalizeStringArray(item.excludedKeywords);
    const naverKeywords = [
      item.naverSearchKeyword?.trim(),
      ...naverSearchKeywords,
      item.name.trim(),
    ].filter(
      (keyword, index, all): keyword is string =>
        Boolean(keyword) &&
        all.findIndex(
          (candidate) => candidate?.toLowerCase() === keyword?.toLowerCase()
        ) === index
    );
    const coupangKeyword =
      item.coupangSearchKeyword?.trim() ||
      coupangSearchKeywords[0] ||
      item.name;
    const context = {
      searchedKeywords: naverKeywords,
      coupangSearchUrl: `https://www.coupang.com/np/search?q=${encodeURIComponent(coupangKeyword)}`,
    };
    const clientId = process.env.NAVER_CLIENT_ID?.trim();
    const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      const missingVariables = [
        !clientId ? "NAVER_CLIENT_ID" : null,
        !clientSecret ? "NAVER_CLIENT_SECRET" : null,
      ].filter(Boolean);
      return failure(
        503,
        "가격 후보 조회에 실패했습니다.",
        `네이버 API 키가 설정되지 않았습니다. 누락된 환경변수: ${missingVariables.join(", ")}`,
        context
      );
    }

    const results = await Promise.allSettled(
      naverKeywords.map(async (keyword) => {
        const url =
          "https://openapi.naver.com/v1/search/shop.json" +
          `?query=${encodeURIComponent(keyword)}&display=30&start=1&sort=sim`;
        const response = await fetch(url, {
          headers: {
            "X-Naver-Client-Id": clientId,
            "X-Naver-Client-Secret": clientSecret,
            Accept: "application/json",
          },
          cache: "no-store",
        });
        return { keyword, items: await readNaverItems(response, keyword) };
      })
    );

    const merged = new Map<
      string,
      NaverShopItem & { matchedKeyword: string }
    >();
    const failedKeywords: string[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        failedKeywords.push(
          result.reason instanceof Error
            ? result.reason.message
            : "알 수 없는 조회 오류"
        );
        continue;
      }
      for (const candidate of result.value.items) {
        const key = dedupeKey(candidate);
        if (!key || merged.has(key)) continue;
        merged.set(key, {
          ...candidate,
          matchedKeyword: result.value.keyword,
        });
      }
    }

    if (results.length > 0 && failedKeywords.length === results.length) {
      return failure(
        502,
        "가격 후보 조회에 실패했습니다.",
        failedKeywords.join(" / "),
        context
      );
    }

    const candidates = [...merged.values()]
      .filter((candidate) => {
        const title = stripHtml(candidate.title ?? "").toLowerCase();
        return !excludedKeywords.some((word) =>
          title.includes(word.toLowerCase())
        );
      })
      .map((candidate) => {
        const title = stripHtml(candidate.title ?? item.name);
        const itemPrice = Number(candidate.lprice) || 0;
        const metrics = safePriceMetrics(title, itemPrice, 0);
        return {
          source: "NAVER",
          title,
          productUrl: candidate.link ?? "",
          productId: candidate.productId ?? null,
          image: candidate.image ?? null,
          mallName: candidate.mallName ?? "네이버 쇼핑",
          matchedKeyword: candidate.matchedKeyword,
          itemPrice,
          shippingFee: 0,
          quantityPerPack: metrics.unitCount,
          volumePerUnit: metrics.volumePerUnit,
          volumeUnit: metrics.volumeUnit,
          packageUnit: metrics.packageUnit,
          unitPrice: metrics.unitPrice,
          pricePer100: metrics.pricePer100,
          pricePerMeasure: metrics.pricePerMeasure,
        };
      })
      .sort((a, b) => a.unitPrice - b.unitPrice);

    return success(
      candidates,
      context,
      failedKeywords.length > 0
        ? `일부 검색어 조회 실패: ${failedKeywords.join(", ")}`
        : null
    );
  } catch (cause) {
    console.warn("[neworder/price-search] 가격 후보 조회 실패", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    return failure(
      500,
      "가격 후보 조회에 실패했습니다.",
      process.env.NODE_ENV === "development" && cause instanceof Error
        ? cause.message
        : "서버에서 가격 조회 중 오류가 발생했습니다."
    );
  }
}
