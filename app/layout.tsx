import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Post Labs",
  description: "플레이스 순위 추적",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}