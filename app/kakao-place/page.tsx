import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

import KakaoPlacePage from "./kakao-place-client";

const title = "카카오맵 매장 순위조회·키워드 추적 | 포스트랩스";
const description =
  "카카오맵 매장의 키워드 검색 순위와 노출 변화를 확인하고, 여러 매장의 지역 검색 성과를 한 곳에서 관리하세요.";
const url = "https://postlabs.co.kr/kakao-place";

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
      <KakaoPlacePage />
      <PublicSeoContent
        eyebrow="Kakao Map Analytics"
        title="카카오맵 매장 순위조회와 키워드 추적"
        description={description}
        features={[
          "카카오맵 매장별 지역 키워드 검색 순위를 확인합니다.",
          "여러 키워드의 검색량과 최신 노출 순위를 함께 비교합니다.",
          "자동 추적과 수동 업데이트를 매장별로 관리합니다.",
        ]}
        faqs={[
          {
            question: "카카오맵 매장 순위는 어떻게 확인하나요?",
            answer:
              "카카오맵 매장을 검색해 등록하고 키워드를 추가하면 해당 검색어에서의 최신 매장 순위를 확인할 수 있습니다.",
          },
          {
            question: "카카오맵 키워드를 여러 개 추적할 수 있나요?",
            answer:
              "네. 매장마다 여러 지역·업종 키워드를 등록해 순위와 검색량을 비교할 수 있습니다.",
          },
          {
            question: "실제 매장 데이터 저장에는 로그인이 필요한가요?",
            answer:
              "네. 비로그인 사용자는 예시 화면을 볼 수 있고, 실제 매장 등록과 지속적인 순위 추적은 로그인 후 이용할 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
