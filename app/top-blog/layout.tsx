import type { Metadata } from "next";

import PublicSeoContent from "@/components/public-seo-content";

const title = "네이버 블로그 상위노출 분석 | 포스트랩스";
const description =
  "네이버 블로그 키워드 상위노출 순위, 검색량, 콘텐츠 성과를 확인하고 블로그 운영 방향을 분석하세요.";
const url = "https://postlabs.co.kr/top-blog";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function TopBlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicSeoContent
        headingLevel="h2"
        eyebrow="Blog Ranking"
        title="네이버 블로그 상위노출 분석"
        description={description}
        features={[
          "블로그 최신 글의 키워드별 네이버 검색 노출 순위를 확인합니다.",
          "모바일·PC 검색량과 포스트 성과를 함께 비교합니다.",
          "상위노출 가능성이 높은 콘텐츠와 보완할 키워드를 찾습니다.",
        ]}
        faqs={[
          {
            question: "네이버 블로그 상위노출 순위는 어떻게 확인하나요?",
            answer:
              "블로그 주소를 입력하면 최신 포스트를 불러오고 각 글에 설정한 키워드의 검색 노출 순위를 확인할 수 있습니다.",
          },
          {
            question: "키워드 검색량도 함께 볼 수 있나요?",
            answer:
              "네. 포스트별 키워드의 전체·모바일·PC 월간 검색량을 함께 확인할 수 있습니다.",
          },
          {
            question: "비로그인 상태에서도 화면을 볼 수 있나요?",
            answer:
              "예시 데이터와 기능 설명은 공개되며, 실제 블로그 분석 기능은 서비스 정책에 따라 로그인 후 이용할 수 있습니다.",
          },
        ]}
      />
    </>
  );
}
