import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ScrollTracker from "./components/ScrollTracker";
import Providers from "./providers";

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
        <ScrollTracker />

        {/* 실제 콘텐츠 */}
        <Providers>
          <div className="relative z-20">{children}</div>
        </Providers>
      </body>
    </html>
  );
}