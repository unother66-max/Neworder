import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "스마트스토어 키워드 분석 | 포스트랩스";
const description =
  "스마트스토어 키워드의 월간 검색량, 상품 수, 경쟁률과 연관 키워드를 분석해 상품명과 노출 전략에 활용하세요.";
const url = "https://postlabs.co.kr/smartstore/keyword-analyze";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function KeywordAnalyzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        headingLevel="h2"
        eyebrow="Keyword Analytics"
        title="스마트스토어 키워드 분석"
        description={description}
        features={[
          "키워드의 모바일·PC 월간 검색량을 확인합니다.",
          "검색량과 상품 수를 바탕으로 경쟁 정도를 비교합니다.",
          "함께 검색되는 연관 키워드를 찾아 상품 노출 전략에 활용합니다.",
        ]}
        faqs={[
          {
            question: "스마트스토어 키워드 경쟁률은 무엇인가요?",
            answer:
              "검색량과 노출 상품 수를 비교해 해당 키워드의 경쟁 정도를 판단할 수 있도록 제공하는 참고 지표입니다.",
          },
          {
            question: "모바일과 PC 검색량을 따로 볼 수 있나요?",
            answer:
              "네. 월간 전체 검색량과 함께 모바일 및 PC 검색량을 구분해 확인할 수 있습니다.",
          },
          {
            question: "연관 키워드도 확인할 수 있나요?",
            answer:
              "입력한 키워드와 관련된 검색어와 주요 지표를 함께 제공해 확장 키워드를 찾을 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
