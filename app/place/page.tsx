import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

import PlacePage from "./place-client";

const title = "네이버 플레이스 순위조회·키워드 추적 | 포스트랩스";
const description =
  "네이버 플레이스의 지역 키워드 검색 순위, 검색량, 순위 변화를 확인하고 매장별 노출 흐름을 지속적으로 관리하세요.";
const url = "https://postlabs.co.kr/place";

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
      <PlacePage />
      <PublicSeoContent
        eyebrow="Naver Place Analytics"
        title="네이버 플레이스 순위조회와 지역 키워드 추적"
        description={description}
        features={[
          "매장별 지역 키워드의 네이버 플레이스 노출 순위를 확인합니다.",
          "모바일·PC 검색량을 비교해 중요한 키워드를 선별합니다.",
          "최신 순위와 이전 순위의 변화를 매장 단위로 추적합니다.",
        ]}
        faqs={[
          {
            question: "네이버 플레이스 순위는 어떻게 조회하나요?",
            answer:
              "매장을 등록한 뒤 지역명과 업종이 포함된 키워드를 추가하면 해당 검색어의 플레이스 순위를 확인할 수 있습니다.",
          },
          {
            question: "여러 매장을 한 번에 관리할 수 있나요?",
            answer:
              "네. 여러 매장을 등록하고 매장별 키워드, 검색량, 최신 순위를 한 화면에서 관리할 수 있습니다.",
          },
          {
            question: "비로그인 상태에서도 화면을 확인할 수 있나요?",
            answer:
              "예시 데이터로 주요 화면을 둘러볼 수 있습니다. 실제 매장 등록, 저장, 자동 추적 기능은 로그인 후 사용할 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
