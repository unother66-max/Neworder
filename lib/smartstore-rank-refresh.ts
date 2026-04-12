import { prisma } from "@/lib/prisma";
import {
  findProductRankViaNaverShopOpenApi,
  isNaverOpenApiConfiguredForShopping,
  type NaverOpenApiShopRankResult,
} from "@/lib/naver-openapi-shopping-rank";

export const SMARTSTORE_RANK_DEFAULT_MAX = 1000;

export const SMARTSTORE_RANK_NAVER_CONFIG_ERROR =
  "네이버 쇼핑 검색 API를 쓰려면 NAVER_CLIENT_ID·NAVER_CLIENT_SECRET을 설정하고, 개발자센터에서 검색 API(쇼핑) 사용을 켜주세요.";

export type KeywordRankRefreshOk = {
  ok: true;
  keywordId: string;
  keyword: string;
  history: {
    id: string;
    productId: string;
    keyword: string;
    rank: number | null;
    pageNum: number | null;
    position: number | null;
    rankLabel: string | null;
    createdAt: Date;
  };
  rankResult: NaverOpenApiShopRankResult;
};

export type KeywordRankRefreshFail = {
  ok: false;
  keywordId: string;
  keyword: string;
  error: string;
};

export type KeywordRankRefreshItem = KeywordRankRefreshOk | KeywordRankRefreshFail;

/**
 * /api/smartstore-keyword-check-rank 와 동일: OpenAPI 쇼핑 검색으로 순위 산출 후 SmartstoreRankHistory 저장.
 */
export async function refreshRanksForSmartstoreKeywords(opts: {
  /** console 로그 접두사 (예: [smartstore-product-save] 순위) */
  logPrefix: string;
  smartstoreProductId: string;
  naverProductId: string;
  keywords: { id: string; keyword: string }[];
  maxResults?: number;
}): Promise<{
  naverConfigured: boolean;
  configError: string | null;
  items: KeywordRankRefreshItem[];
}> {
  const maxResults = Math.min(
    Math.max(Number(opts.maxResults) || SMARTSTORE_RANK_DEFAULT_MAX, 10),
    1000
  );
  const { logPrefix, smartstoreProductId, naverProductId, keywords } = opts;

  console.log(`${logPrefix} keywords.length`, keywords.length);
  for (const k of keywords) {
    console.log(`${logPrefix} keyword`, { id: k.id, keyword: k.keyword });
  }

  if (!isNaverOpenApiConfiguredForShopping()) {
    console.warn(`${logPrefix} NAVER 쇼핑 API 미설정 → 순위 갱신 생략`);
    return {
      naverConfigured: false,
      configError: SMARTSTORE_RANK_NAVER_CONFIG_ERROR,
      items: [],
    };
  }

  const items: KeywordRankRefreshItem[] = [];

  for (const kw of keywords) {
    console.log(`${logPrefix} 순위 조회 시작`, {
      keywordId: kw.id,
      keyword: kw.keyword,
    });
    try {
      const rankResult = await findProductRankViaNaverShopOpenApi(
        kw.keyword,
        naverProductId,
        { maxResults, sort: "sim" }
      );
      const history = await prisma.smartstoreRankHistory.create({
        data: {
          productId: smartstoreProductId,
          keyword: kw.keyword,
          rank: rankResult.rank,
          pageNum: rankResult.pageNum,
          position: rankResult.position,
          rankLabel: rankResult.rankLabel,
        },
      });
      console.log(`${logPrefix} 순위 조회 성공`, {
        keywordId: kw.id,
        keyword: kw.keyword,
        rankLabel: rankResult.rankLabel,
        historyId: history.id,
      });
      items.push({
        ok: true,
        keywordId: kw.id,
        keyword: kw.keyword,
        history,
        rankResult,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.warn(`${logPrefix} 순위 조회 실패`, {
        keywordId: kw.id,
        keyword: kw.keyword,
        error,
      });
      items.push({
        ok: false,
        keywordId: kw.id,
        keyword: kw.keyword,
        error,
      });
    }
  }

  return { naverConfigured: true, configError: null, items };
}
