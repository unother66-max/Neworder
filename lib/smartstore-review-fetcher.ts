import {
  cooldownOn429,
  randomSmartstoreDelay,
  SmartstoreNaverRateLimitedError,
} from "@/lib/smartstore-bot-shield";
import {
  buildSmartstoreMobileDocumentFetchHeaders,
  loadSystemConfigNaverCookie,
} from "@/lib/naver-smartstore-unified-fetch-headers";

const LOG_P = "[smartstore-review-fetcher-lite]";

/**
 * 🎯 [스나이퍼 로직] HTML 원본에서 정규식으로 데이터를 낚아챕니다.
 * 브라우저를 띄우지 않아도 되기 때문에 Vercel에서 에러가 날 일이 없습니다.
 */
function extractDataByBulldozer(html: string) {
  const getNum = (regex: RegExp) => {
    const match = html.match(regex);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  };

  return {
    reviewCount: getNum(/"(?:reviewCount|totalReviewCount|totalElements)"\s*:\s*(\d+)/i),
    averageReviewScore: getNum(/"(?:averageReviewScore|ratingValue)"\s*:\s*"?([\d.]+)"?/i),
    photoReviewCount: getNum(/"(?:photoReviewCount|photoReviewCnt|photoVideoReviewCount)"\s*:\s*(\d+)/i),
    afterUseReviewCount: getNum(/"(?:afterUseReviewCount|monthlyUseReviewCount)"\s*:\s*(\d+)/i),
    repurchaseReviewCount: getNum(/"(?:repurchaseReviewCount|repurchaseCount)"\s*:\s*(\d+)/i),
    storePickReviewCount: getNum(/"(?:storePickReviewCount|storePickCount)"\s*:\s*(\d+)/i),
    // 별점 분포 (1~5점)
    score1Count: getNum(/"score1Count"\s*:\s*(\d+)/i),
    score2Count: getNum(/"score2Count"\s*:\s*(\d+)/i),
    score3Count: getNum(/"score3Count"\s*:\s*(\d+)/i),
    score4Count: getNum(/"score4Count"\s*:\s*(\d+)/i),
    score5Count: getNum(/"score5Count"\s*:\s*(\d+)/i),
  };
}

export async function fetchSmartstoreReviewSnapshot(input: {
  productUrl: string;
  productId: string;
}) {
  const productId = String(input.productId).trim();
  const pageUrl = `https://m.smartstore.naver.com/products/${productId}`;
  
  console.log(`${LOG_P} 무료 배포용 초경량 수집 시작`, { productId });

  // 1. 실제 사람처럼 보이게 딜레이 살짝 (봇 방패 우회)
  await randomSmartstoreDelay("ranking");

  // 2. 소장님의 네이버 신분증(쿠키) 로드
  const naverCookie = await loadSystemConfigNaverCookie();

  // 3. 네이버 서버에 "진짜 사람인 척" 요청 보내기
  const headers = buildSmartstoreMobileDocumentFetchHeaders({
    mobileUrl: pageUrl,
    normalizedProductUrl: input.productUrl,
    productId: productId,
    naverCookie: naverCookie,
  });

  const res = await fetch(pageUrl, { 
    method: "GET", 
    headers,
    cache: "no-store" 
  });

  if (res.status === 429) {
    await cooldownOn429();
    throw new SmartstoreNaverRateLimitedError("네이버 IP 차단 발생 (429)");
  }

  const html = await res.text();

  // 4. 불도저 로직으로 데이터 싹쓸이
  const data = extractDataByBulldozer(html);

  if (data.reviewCount === 0) {
    // 💡 만약 HTML에 데이터가 없다면, 네이버가 데이터를 숨긴 것입니다.
    // 무료 배포 버전에서는 여기서 "실패"를 띄우거나 사용자의 쿠키 갱신을 요청해야 합니다.
    throw new Error("데이터 추출 실패: 상품이 존재하지 않거나 네이버가 정보를 숨겼습니다.");
  }

  console.log(`${LOG_P} 🎯 수집 성공!`, { reviewCount: data.reviewCount });

  return {
    productPageUrl: input.productUrl,
    summary: {
      reviewCount: data.reviewCount,
      reviewRating: data.averageReviewScore,
      photoVideoReviewCount: data.photoReviewCount,
      monthlyUseReviewCount: data.afterUseReviewCount,
      repurchaseReviewCount: data.repurchaseReviewCount,
      storePickReviewCount: data.storePickReviewCount,
      starScoreSummary: {
        "1": data.score1Count,
        "2": data.score2Count,
        "3": data.score3Count,
        "4": data.score4Count,
        "5": data.score5Count,
      },
    },
    recentReviews: [],
  };
}