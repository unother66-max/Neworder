import type { Metadata } from "next";

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
  return children;
}
