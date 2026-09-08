import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "카카오맵 순위분석 TOP150 | 포스트랩스";
const description =
  "키워드별 카카오맵 장소 검색 순위를 최대 150위까지 확인하고 평점과 리뷰 지표를 함께 비교할 수 있습니다.";
const url = "https://postlabs.co.kr/kakao-analysis";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url,
    type: "website",
    images: [{ url: "/postlabs-preview-logo.png?v=20260824-3", width: 1254, height: 1254, alt: "PostLabs" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/postlabs-preview-logo.png?v=20260824-3"],
  },
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
        title="카카오맵 순위분석 TOP150"
        description={description}
        features={[
          "키워드 검색 결과의 카카오맵 장소 순위를 최대 150위까지 조회합니다.",
          "상위 매장의 평점, 리뷰 수, 카테고리와 주소를 비교합니다.",
          "검색 결과에서 업체명과 카카오 장소 ID를 바로 찾을 수 있습니다.",
        ]}
        faqs={[
          {
            question: "카카오맵 순위분석 TOP150은 어떤 정보를 제공하나요?",
            answer:
              "키워드별 카카오맵 장소 순위를 최대 150위까지 조회하고 매장명, 카테고리, 주소, 평점, 리뷰 수를 확인할 수 있습니다.",
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
