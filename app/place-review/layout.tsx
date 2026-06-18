import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "네이버 플레이스 리뷰·저장 수 추적 | 포스트랩스";
const description =
  "네이버 플레이스의 방문자 리뷰, 블로그 리뷰, 전체 리뷰와 저장 수 변화를 확인하고 매장별 추이를 관리하세요.";
const url = "https://postlabs.co.kr/place-review";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function PlaceReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        headingLevel="h2"
        eyebrow="Review Tracking"
        title="네이버 플레이스 리뷰와 저장 수 추적"
        description={description}
        features={[
          "전체·방문자·블로그 리뷰 수의 변화를 구분해 확인합니다.",
          "플레이스 저장 수와 최근 업데이트 시점을 함께 관리합니다.",
          "여러 매장의 리뷰 성장 흐름을 한 화면에서 비교합니다.",
        ]}
        faqs={[
          {
            question: "어떤 리뷰 수를 추적할 수 있나요?",
            answer:
              "네이버 플레이스의 전체 리뷰, 방문자 리뷰, 블로그 리뷰 수와 각 지표의 변화를 확인할 수 있습니다.",
          },
          {
            question: "플레이스 저장 수도 확인할 수 있나요?",
            answer:
              "네. 매장별 저장 수와 이전 기록 대비 변화를 리뷰 지표와 함께 확인할 수 있습니다.",
          },
          {
            question: "실제 매장 기록을 저장하려면 로그인이 필요한가요?",
            answer:
              "공개 페이지에서 기능을 살펴볼 수 있으며, 개인 매장 등록과 지속적인 데이터 저장은 로그인 후 이용합니다.",
          },
        ]}
      />
    </>
  );
}
