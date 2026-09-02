import type { Metadata } from "next";

import SeoExplainer from "@/components/seo-explainer";

const title = "네이버 플레이스 순위조회 TOP300 | 포스트랩스";
const description =
  "네이버 플레이스 검색 순위를 최대 300위까지 빠르게 확인하세요. 업체별 평점, 방문자리뷰, 블로그리뷰, 저장수와 네이버 지도 바로가기를 제공합니다.";
const url = "https://postlabs.co.kr/place-rank-analysis";
const imageUrl =
  "https://postlabs.co.kr/images/place-rank-analysis-og.jpg";
const imageAlt = "포스트랩스 네이버 플레이스 순위분석 TOP300 화면";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url,
    siteName: "포스트랩스",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: imageUrl,
        width: 1200,
        height: 630,
        alt: imageAlt,
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [
      {
        url: imageUrl,
        width: 1200,
        height: 630,
        alt: imageAlt,
        type: "image/jpeg",
      },
    ],
  },
};

export default function PlaceRankAnalysisLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <SeoExplainer
        id="place-rank-analysis-guide"
        title="네이버 플레이스 순위는 어떻게 확인하나요?"
        paragraphs={[
          "포스트랩스 순위분석 TOP300은 입력한 검색 키워드를 기준으로 네이버 PC 플레이스 검색 결과를 최대 300위까지 조회합니다. 업체명, 평점, 방문자리뷰, 블로그리뷰, 저장수 등을 한 화면에서 확인할 수 있습니다.",
          "음식점, 카페, 병원, 학원 등 지역 기반 매장이 특정 검색어에서 네이버 지도에 어느 위치로 노출되는지 빠르게 확인할 때 활용할 수 있습니다.",
        ]}
      />
    </>
  );
}
