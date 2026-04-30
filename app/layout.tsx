import type { Metadata } from "next";
import localFont from "next/font/local"; // 🚨 localFont 불러오기
import "./globals.css";
import ScrollTracker from "./components/ScrollTracker";
import Providers from "./providers";

// 1️⃣ Poppins 폰트 설정 (영문용)
const poppins = localFont({
  src: "../public/fonts/Poppins-Medium.woff", // app 폴더 기준 public 폴더 경로
  variable: "--font-poppins",
  display: "swap",
});

// 2️⃣ Noto Sans KR 폰트 설정 (국문용)
const notoSansKR = localFont({
  src: "../public/fonts/NotoSansKR-Regular.woff",
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PostLabs",
  description: "내 매장의 노출 관리, 더 쉽게",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 3️⃣ html에 폰트 변수(variable) 주입
    <html lang="ko" suppressHydrationWarning className={`${poppins.variable} ${notoSansKR.variable}`}>
      {/* 4️⃣ 기존 inter 대신 Noto Sans KR을 기본 클래스로 적용 */}
      <body className={notoSansKR.className} suppressHydrationWarning>
        <ScrollTracker />

        {/* 실제 콘텐츠 */}
        <Providers>
          <div className="relative z-20">{children}</div>
        </Providers>
      </body>
    </html>
  );
}