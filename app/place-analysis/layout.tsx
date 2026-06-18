import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "네이버 플레이스 순위 분석 | 포스트랩스";
const description =
  "네이버 플레이스 키워드 검색 결과의 매장 순위, 리뷰, 저장 수와 연관 키워드를 비교해 지역 경쟁 현황을 분석하세요.";
const url = "https://postlabs.co.kr/place-analysis";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function PlaceAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        headingLevel="h2"
        eyebrow="Place Analysis"
        title="네이버 플레이스 키워드 순위 분석"
        description={description}
        features={[
          "지역 키워드 검색 결과의 플레이스 노출 순위를 확인합니다.",
          "상위 매장의 리뷰 수, 저장 수, 카테고리를 비교합니다.",
          "연관 키워드 검색량으로 추가 노출 기회를 찾습니다.",
        ]}
        faqs={[
          {
            question: "플레이스 순위 분석은 어떤 데이터를 보여주나요?",
            answer:
              "입력한 키워드의 상위 매장 순위와 주소, 카테고리, 리뷰 및 저장 관련 지표를 함께 보여줍니다.",
          },
          {
            question: "지역 키워드도 분석할 수 있나요?",
            answer:
              "네. 지역명과 업종을 조합한 키워드를 입력해 해당 지역의 플레이스 경쟁 결과를 확인할 수 있습니다.",
          },
          {
            question: "연관 키워드는 어디에 활용하나요?",
            answer:
              "검색량이 있는 연관 키워드를 확인해 매장 소개, 콘텐츠, 순위 추적 키워드를 확장하는 데 활용할 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
