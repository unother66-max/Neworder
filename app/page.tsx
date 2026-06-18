import type { Metadata } from "next";

import HomePage from "./home-client";

const title = "포스트랩스 - 플레이스·스마트스토어 분석";
const description =
  "포스트랩스는 네이버 플레이스 순위 추적, 스마트스토어 순위 분석, 블로그 상위노출 분석을 한 곳에서 관리할 수 있는 마케팅 데이터 도구입니다.";
const url = "https://postlabs.co.kr";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  robots: { index: true, follow: true },
  openGraph: { title, description, url, type: "website" },
};

export default function Page() {
  return <HomePage />;
}
