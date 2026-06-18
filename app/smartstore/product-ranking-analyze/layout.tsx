import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "스마트스토어 상품 순위 분석 | 포스트랩스";
const description =
  "키워드별 네이버 쇼핑 상품 순위를 조회하고 상품명, 가격, 리뷰, 판매자 정보를 비교해 스마트스토어 노출 현황을 분석하세요.";
const url = "https://postlabs.co.kr/smartstore/product-ranking-analyze";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function ProductRankingAnalyzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        headingLevel="h2"
        eyebrow="Product Ranking"
        title="스마트스토어 상품 순위 분석"
        description={description}
        features={[
          "검색 키워드별 네이버 쇼핑 상품 노출 순위를 조회합니다.",
          "상품 가격, 리뷰 수, 판매자와 카테고리 정보를 함께 비교합니다.",
          "경쟁 상품의 검색 결과 구성을 빠르게 파악할 수 있습니다.",
        ]}
        faqs={[
          {
            question: "스마트스토어 상품 순위는 어떻게 조회하나요?",
            answer:
              "분석할 키워드를 입력하면 네이버 쇼핑 검색 결과에 노출되는 상품과 순위를 확인할 수 있습니다.",
          },
          {
            question: "상품 순위와 함께 어떤 정보를 볼 수 있나요?",
            answer:
              "상품명, 판매자, 가격, 배송비, 리뷰 수, 평점 등 노출 상품을 비교하는 데 필요한 정보를 함께 제공합니다.",
          },
          {
            question: "별도 상품 등록 없이 사용할 수 있나요?",
            answer:
              "네. 이 페이지에서는 키워드를 입력해 공개 검색 결과를 바로 분석할 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
