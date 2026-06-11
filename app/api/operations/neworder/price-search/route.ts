import { NextResponse } from "next/server";

import { getNewOrderAccess } from "@/lib/neworder/auth";
import { normalizeStringArray } from "@/lib/neworder/item-keywords";
import {
  enrichNaverShipping,
  enrichNaverShippingCandidates,
  type NaverShippingEnrichment,
} from "@/lib/neworder/naver-shipping";
import {
  calculatePriceMetrics,
  getRecommendationMetric,
  metricValue,
  parseShippingCondition,
  type PriceMetrics,
  type ShippingStatus,
} from "@/lib/neworder/price-analysis";
import {
  compareKeywordMatches,
  matchProductKeywords,
} from "@/lib/neworder/product-matching";
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
  shippingFee?: string | number;
  deliveryFee?: string | number;
  deliveryFeeContent?: string;
  shippingInfo?: string;
};

type NaverCandidate = NaverShopItem & {
  matchedKeyword: string;
  shippingEnrichment?: NaverShippingEnrichment;
};

type ResponseContext = {
  searchedKeywords?: string[];
  coupangSearchUrl?: string;
  directSearch?: boolean;
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
      directSearch: context.directSearch ?? false,
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
    productPrice: Math.max(0, Number(itemPrice) || 0),
    shippingFee: Math.max(0, Number(shippingFee) || 0),
    shippingUnitCount: 1,
    effectiveShippingFee: Math.max(0, Number(shippingFee) || 0),
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
  shippingFee: number,
  shippingUnitCount = 1,
  shippingNeedsConfirmation = false,
  shippingStatus: ShippingStatus = "UNKNOWN"
): PriceMetrics {
  try {
    return calculatePriceMetrics({
      title,
      itemPrice,
      shippingFee,
      shippingUnitCount,
      shippingNeedsConfirmation,
      shippingStatus,
    });
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

    const searchParams = new URL(request.url).searchParams;
    const itemId = searchParams.get("itemId")?.trim() ?? "";
    const directQuery = searchParams.get("query")?.trim().slice(0, 200) ?? "";
    const directSearch = Boolean(directQuery);
    if (!itemId && !directSearch) {
      return failure(
        400,
        "품목을 선택하거나 직접 검색어를 입력해 주세요.",
        "itemId 또는 query가 필요합니다."
      );
    }

    const item = itemId
      ? await prisma.newOrderItem.findUnique({
          where: { id: itemId },
          select: {
            name: true,
            category: true,
            naverSearchKeyword: true,
            naverSearchKeywords: true,
            coupangSearchKeyword: true,
            coupangSearchKeywords: true,
            requiredKeywords: true,
            optionalKeywords: true,
            preferredKeywords: true,
            excludedKeywords: true,
          },
        })
      : null;
    if (itemId && !item) {
      return failure(
        404,
        "품목을 찾을 수 없습니다.",
        "선택한 품목이 존재하지 않습니다."
      );
    }

    const naverSearchKeywords = normalizeStringArray(
      item?.naverSearchKeywords
    );
    const coupangSearchKeywords = normalizeStringArray(
      item?.coupangSearchKeywords
    );
    const requiredKeywords = directSearch
      ? []
      : normalizeStringArray(item?.requiredKeywords);
    const optionalKeywords = directSearch
      ? []
      : normalizeStringArray(item?.optionalKeywords);
    const preferredKeywords = directSearch
      ? []
      : normalizeStringArray(item?.preferredKeywords);
    const excludedKeywords = directSearch
      ? []
      : normalizeStringArray(item?.excludedKeywords);
    const naverKeywords = directSearch
      ? [directQuery]
      : naverSearchKeywords;
    const coupangKeyword = directSearch
      ? directQuery
      : coupangSearchKeywords[0] || "";
    const context = {
      searchedKeywords: naverKeywords,
      coupangSearchUrl: coupangKeyword
        ? `https://www.coupang.com/np/search?q=${encodeURIComponent(coupangKeyword)}`
        : "",
      directSearch,
    };
    if (naverKeywords.length === 0) {
      return failure(
        400,
        "네이버 정확 검색어를 등록해 주세요.",
        "품목 관리의 네이버 정확 검색어 목록이 비어 있습니다.",
        context
      );
    }
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

    const merged = new Map<string, NaverCandidate>();
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

    const recommendationMetric = getRecommendationMetric(
      directSearch ? directQuery : item?.name ?? "",
      directSearch ? "기타" : item?.category ?? ""
    );
    const rules = {
      requiredKeywords,
      optionalKeywords,
      preferredKeywords,
      excludedKeywords,
    };
    const mergedCandidates = [...merged.values()];
    const detailTargets = mergedCandidates
      .filter((candidate) => {
        const title = stripHtml(candidate.title ?? "");
        const keywordMatch = matchProductKeywords(title, rules);
        return keywordMatch.passesRequired && keywordMatch.passesExcluded;
      })
      .slice(0, 15);
    await enrichNaverShippingCandidates(
      detailTargets,
      async (candidate) => {
        candidate.shippingEnrichment = await enrichNaverShipping(candidate);
      },
      3
    );

    const candidates = mergedCandidates
      .map((candidate) => {
        const title = stripHtml(
          candidate.title ?? (directSearch ? directQuery : item?.name ?? "")
        );
        const itemPrice = Number(candidate.lprice) || 0;
        const rawShippingFee =
          Number(candidate.shippingFee ?? candidate.deliveryFee) || 0;
        const shipping =
          candidate.shippingEnrichment ??
          parseShippingCondition(
            [candidate.deliveryFeeContent, candidate.shippingInfo]
              .filter(Boolean)
              .join(" "),
            rawShippingFee
          );
        const metrics = safePriceMetrics(
          title,
          itemPrice,
          shipping.shippingFee,
          shipping.shippingUnitCount,
          shipping.shippingNeedsConfirmation,
          shipping.shippingStatus ?? "UNKNOWN"
        );
        const keywordMatch = matchProductKeywords(title, rules);
        return {
          metrics,
          keywordMatch,
          candidate: {
            source: "NAVER",
            title,
            productUrl: candidate.link ?? "",
            productId: candidate.productId ?? null,
            image: candidate.image ?? null,
            mallName: candidate.mallName ?? "네이버 쇼핑",
            matchedKeyword: candidate.matchedKeyword,
            itemPrice,
            shippingFee: shipping.shippingFee,
            shippingUnitCount: shipping.shippingUnitCount,
            shippingStatus: shipping.shippingStatus ?? "UNKNOWN",
            shippingNote:
              shipping.shippingNote ??
              (shipping.shippingNeedsConfirmation
                ? "배송비 정보를 자동으로 확인하지 못했습니다."
                : null),
            shippingCondition: shipping.shippingCondition,
            shippingNeedsConfirmation:
              shipping.shippingNeedsConfirmation,
            shippingEnrichmentStatus:
              candidate.shippingEnrichment == null
                ? "NOT_CHECKED"
                : candidate.shippingEnrichment.source === "UNKNOWN"
                  ? "FAILED"
                  : "COMPLETED",
            effectiveShippingFee: metrics.effectiveShippingFee,
            totalPriceWithShipping: metrics.totalPrice,
            quantityPerPack: metrics.unitCount,
            volumePerUnit: metrics.volumePerUnit,
            volumeUnit: metrics.volumeUnit,
            packageUnit: metrics.packageUnit,
            unitPrice: metrics.unitPrice,
            pricePer100: metrics.pricePer100,
            pricePerMeasure: metrics.pricePerMeasure,
            passesRequired: keywordMatch.passesRequired,
            optionalMatchCount: keywordMatch.optionalMatchCount,
            preferredMatchCount: keywordMatch.preferredMatchCount,
            recommendationMetric,
            isDirectSearch: directSearch,
          },
        };
      })
      .filter(
        (candidate) =>
          candidate.keywordMatch.passesRequired &&
          candidate.keywordMatch.passesExcluded
      )
      .sort(
        (a, b) =>
          compareKeywordMatches(a.keywordMatch, b.keywordMatch) ||
          Number(a.candidate.shippingStatus === "UNKNOWN") -
            Number(b.candidate.shippingStatus === "UNKNOWN") ||
          metricValue(a.metrics, recommendationMetric) -
            metricValue(b.metrics, recommendationMetric) ||
          a.metrics.totalPrice - b.metrics.totalPrice
      )
      .map((result) => result.candidate);

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
