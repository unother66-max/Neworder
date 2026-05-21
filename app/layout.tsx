import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import ScrollTracker from "./components/ScrollTracker";
import Providers from "./providers";
import KakaoChatButton from "@/components/kakao-chat-button";
import SiteFooter from "@/components/site-footer";

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

    google: "mauIvffyDV_eGgT0qI14KK1nY6BG0eC1px5NaTpYhoI",

    other: {
      "naver-site-verification":
        "ab01c328b075c3f3f917e876c6e683531c50344a",
    },
  },

  title: "포스트랩스 - 플레이스·스마트스토어 분석",
  description:
    "포스트랩스는 네이버 플레이스 순위 추적, 스마트스토어 순위 분석, 블로그 상위노출 분석을 한 곳에서 관리할 수 있는 마케팅 데이터 도구입니다.",

  openGraph: {
    title: "포스트랩스 - 플레이스·스마트스토어 분석",
    description:
      "포스트랩스는 네이버 플레이스 순위 추적, 스마트스토어 순위 분석, 블로그 상위노출 분석을 한 곳에서 관리할 수 있는 마케팅 데이터 도구입니다.",
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
    title: "포스트랩스 - 플레이스·스마트스토어 분석",
    description:
      "포스트랩스는 네이버 플레이스 순위 추적, 스마트스토어 순위 분석, 블로그 상위노출 분석을 한 곳에서 관리할 수 있는 마케팅 데이터 도구입니다.",
    images: ["https://postlabs.co.kr/images/og-image-v2.png"],
  },

  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
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

        {/* 실제 콘텐츠: flex-1로 주 영역을 채워 footer가 항상 뷰포트 하단에 고정되도록 함 */}
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <main className="relative z-20 flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>

        {/* 🚨 2. 여기에 톡상담 버튼 추가 (모든 페이지 공통 적용) */}
        <KakaoChatButton />

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "포스트랩스",
      url: "https://postlabs.co.kr",
      logo: "https://postlabs.co.kr/images/og-image-v2.png",
      description:
        "네이버 플레이스 순위조회, 스마트스토어 순위확인, 블로그 키워드 분석 서비스",
      sameAs: [
        "https://postlabs.co.kr/community",
      ],
    }),
  }}
/>

</body>
    </html>
  );
}
