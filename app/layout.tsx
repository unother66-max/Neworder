import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AnimatedBackground from "./components/AnimatedBackground";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AnimatedBackground />
        {/* 🖱️ 1. body가 열리자마자 실행되는 스크롤 감지 스크립트 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var timer;
                window.addEventListener('scroll', function() {
                  if (!document.body.classList.contains('is-scrolling')) {
                    document.body.classList.add('is-scrolling');
                  }
                  if (!document.documentElement.classList.contains('is-scrolling')) {
                    document.documentElement.classList.add('is-scrolling');
                  }
                  clearTimeout(timer);
                  timer = setTimeout(function() {
                    document.body.classList.remove('is-scrolling');
                    document.documentElement.classList.remove('is-scrolling');
                  }, 800);
                }, { passive: true });
              })();
            `,
          }}
        />

        {/* 2. 전역 그레인 레이어 (아까 Cursor가 추가해준 것) */}
        <div className="grain-overlay z-10" aria-hidden="true" />

        {/* 3. 실제 콘텐츠 */}
        <div className="relative z-20">{children}</div>
      </body>
    </html>
  );
}