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
  title: "포스트랩스 | 네이버 플레이스 분석",
  description: "내 매장의 노출 관리, 더 쉽게",

  openGraph: {
    title: "포스트랩스 | 네이버 플레이스 분석",
    description: "내 매장의 노출 관리, 더 쉽게",
    url: "https://postlabs.co.kr",
    siteName: "PostLabs",
    images: [
      {
        url: "https://postlabs.co.kr/images/og-image-v2.png",
        width: 1200,
        height: 630,
        alt: "PostLabs",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "포스트랩스 | 네이버 플레이스 분석",
    description: "내 매장의 노출 관리, 더 쉽게",
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
      <body
        className={notoSansKR.className}
        suppressHydrationWarning
      >
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