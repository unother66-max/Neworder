import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import ScrollTracker from "./components/ScrollTracker";
import Providers from "./providers";
import KakaoChatButton from "@/components/kakao-chat-button";

// 1️⃣ Poppins 폰트 설정
const poppins = localFont({
  src: "../public/fonts/Poppins-Medium.woff",
  variable: "--font-poppins",
  display: "swap",
});

// 2️⃣ Noto Sans KR 폰트 설정
const notoSansKR = localFont({
  src: "../public/fonts/NotoSansKR-Regular.woff",
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://postlabs.co.kr"),

  verification: {
    other: {
      "naver-site-verification":
        "ab01c328b075c3f3f917e876c6e683531c50344a",
    },
  },

  title:
    "포스트랩스 | 네이버 플레이스 순위조회 · 스마트스토어 순위확인 · 키워드 분석",
  description:
    "네이버 플레이스 순위조회, 스마트스토어 순위확인, 키워드 분석, 리뷰 추적, 자동 노출관리 기능 제공",

  openGraph: {
    title:
      "포스트랩스 | 네이버 플레이스 순위조회 · 스마트스토어 순위확인",
    description:
      "플레이스 순위조회, 스마트스토어 순위추적, 키워드 분석 기능 제공",
    url: "https://postlabs.co.kr",
    siteName: "포스트랩스",
    images: [
      {
        url: "https://postlabs.co.kr/images/og-image-v2.png",
        width: 1200,
        height: 630,
        alt: "포스트랩스",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title:
      "포스트랩스 | 네이버 플레이스 순위조회 · 스마트스토어 순위확인",
    description:
      "플레이스 순위조회, 스마트스토어 순위추적, 키워드 분석 기능 제공",
    images: ["https://postlabs.co.kr/images/og-image-v2.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${poppins.variable} ${notoSansKR.variable}`}
    >
      <body className={notoSansKR.className} suppressHydrationWarning>
        <Suspense fallback={null}>
          <ScrollTracker />
        </Suspense>

        {/* 실제 콘텐츠 */}
        <Providers>
          <div className="relative z-20">{children}</div>
        </Providers>

        {/* 🚨 2. 여기에 톡상담 버튼 추가 (모든 페이지 공통 적용) */}
        <KakaoChatButton />
      </body>
    </html>
  );
}