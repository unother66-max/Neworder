import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

import SmartstoreRankPage from "./smartstore-client";

const title = "스마트스토어 순위확인·상품 키워드 분석 | 포스트랩스";
const description =
  "스마트스토어 상품의 네이버 쇼핑 검색 순위와 키워드 검색량을 확인하고, 상품별 노출 변화를 한 곳에서 추적하세요.";
const url = "https://postlabs.co.kr/smartstore";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function Page() {
  return (
    <>
      <SmartstoreRankPage />
      <PublicSeoContent
        eyebrow="Smartstore Analytics"
        title="스마트스토어 순위확인과 상품 키워드 분석"
        description={description}
        features={[
          "상품별 핵심 키워드의 네이버 쇼핑 검색 순위를 확인합니다.",
          "모바일·PC 검색량을 비교해 우선 관리할 키워드를 찾습니다.",
          "순위 변동과 자동 추적 상태를 상품 단위로 관리합니다.",
        ]}
        faqs={[
          {
            question: "스마트스토어 순위는 어떻게 확인하나요?",
            answer:
              "스마트스토어 상품을 등록하고 추적할 키워드를 설정하면 해당 키워드의 네이버 쇼핑 검색 순위를 확인할 수 있습니다.",
          },
          {
            question: "상품마다 여러 키워드를 등록할 수 있나요?",
            answer:
              "네. 상품별로 여러 키워드를 등록하고 검색량과 최신 순위를 함께 비교할 수 있습니다.",
          },
          {
            question: "로그인하지 않아도 기능을 볼 수 있나요?",
            answer:
              "비로그인 상태에서는 예시 데이터를 통해 화면과 주요 기능을 살펴볼 수 있으며, 실제 상품 저장과 추적에는 로그인이 필요합니다.",
          },
        ]}
      />
    </>
  );
}
