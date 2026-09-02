import type { Metadata } from "next";

import SeoExplainer from "@/components/seo-explainer";

const title = "네이버 웹문서 분석·검색 노출 확인 | 포스트랩스";
const description =
  "키워드별 네이버 웹검색 결과를 분석해 홈페이지, 블로그, SNS, 외부 사이트의 검색 노출 현황을 한눈에 확인하세요.";
const url = "https://postlabs.co.kr/web-analysis";
const imageUrl = "https://postlabs.co.kr/images/web-analysis-og.jpg";
const imageAlt = "포스트랩스 네이버 웹문서 분석 화면";

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

export default function WebAnalysisLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <SeoExplainer
        id="web-analysis-guide"
        title="네이버 웹문서 분석이란?"
        paragraphs={[
          "포스트랩스 웹 분석은 입력한 키워드의 네이버 웹검색 결과를 확인하여 어떤 홈페이지, 블로그, SNS, 외부 사이트가 검색에 노출되고 있는지 한 화면에서 분석할 수 있는 기능입니다.",
          "브랜드명이나 업체명을 검색했을 때 공식 홈페이지뿐 아니라 네이버 블로그, 인스타그램, 예약 플랫폼, 관광·정보 사이트 등 외부 웹문서가 어떻게 노출되는지 확인할 수 있습니다.",
        ]}
      />
    </>
  );
}
