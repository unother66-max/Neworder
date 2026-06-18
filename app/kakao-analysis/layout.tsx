import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "카카오맵 키워드 순위 분석 | 포스트랩스";
const description =
  "카카오맵 키워드 검색 결과의 매장 순위, 평점, 리뷰와 연관 검색어를 비교해 지역 경쟁 매장을 분석하세요.";
const url = "https://postlabs.co.kr/kakao-analysis";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function KakaoAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        eyebrow="Kakao Analysis"
        title="카카오맵 키워드 순위와 경쟁 매장 분석"
        description={description}
        features={[
          "키워드 검색 결과의 카카오맵 매장 순위를 조회합니다.",
          "상위 매장의 평점, 리뷰 수, 카테고리와 주소를 비교합니다.",
          "연관 키워드 검색량을 확인해 지역 검색 전략을 확장합니다.",
        ]}
        faqs={[
          {
            question: "카카오맵 키워드 분석은 어떤 정보를 제공하나요?",
            answer:
              "키워드별 상위 매장 순위와 매장명, 카테고리, 주소, 평점, 리뷰 수를 확인할 수 있습니다.",
          },
          {
            question: "경쟁 매장을 비교할 수 있나요?",
            answer:
              "네. 동일 키워드에 노출되는 상위 매장들의 주요 지표를 나란히 비교할 수 있습니다.",
          },
          {
            question: "연관 키워드 검색량도 볼 수 있나요?",
            answer:
              "관련 검색어의 전체·모바일·PC 검색량을 확인해 추가 분석 키워드를 찾을 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
