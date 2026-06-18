import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "카카오맵 지역 인기 순위 조회 | 포스트랩스";
const description =
  "카카오맵 매장의 검색, 길찾기, 즐겨찾기, 친구공유 지역 순위를 확인하고 매장별 인기 흐름을 비교하세요.";
const url = "https://postlabs.co.kr/kakao-ranking";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function KakaoRankingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        eyebrow="Kakao Ranking"
        title="카카오맵 지역 인기 순위 조회"
        description={description}
        features={[
          "카카오맵 검색과 길찾기 기준의 지역 순위를 확인합니다.",
          "즐겨찾기와 친구공유 기준의 매장 인기 순위를 비교합니다.",
          "매장별 최신 순위와 자동 추적 상태를 관리합니다.",
        ]}
        faqs={[
          {
            question: "카카오맵 지역 순위에는 어떤 항목이 있나요?",
            answer:
              "검색, 길찾기, 즐겨찾기, 친구공유 기준의 전체 및 카테고리 순위를 확인할 수 있습니다.",
          },
          {
            question: "여러 매장의 순위를 비교할 수 있나요?",
            answer:
              "네. 등록된 여러 매장의 최신 지역 순위와 업데이트 상태를 한 화면에서 비교할 수 있습니다.",
          },
          {
            question: "비로그인 상태에서도 기능을 확인할 수 있나요?",
            answer:
              "예시 콘텐츠와 기능 설명은 공개되며, 개인 매장 저장과 지속적인 추적은 로그인 후 사용할 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
