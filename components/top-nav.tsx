"use client";

import React from "react";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";

type TopNavProps = {
  active?: unknown;
  activeSmartstoreSub?: unknown;
  showBreadcrumb?: boolean;
};

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["700", "900"],
});

const TopNav = (_props: TopNavProps) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-transparent transition-all">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png?v=20260429-2"
              alt="PostLabs"
              className="h-13 w-auto"
            />
            <span className="sr-only">PostLabs</span>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-10 text-base lg:text-lg text-slate-600">
            <Link
              href="#"
              className={`${notoSansKr.className} font-black tracking-tighter leading-none transition-colors decoration-2 underline-offset-[8px] decoration-transparent hover:text-slate-900 hover:underline hover:decoration-black aria-[current=page]:text-slate-900 aria-[current=page]:underline aria-[current=page]:decoration-black`}
            >
              스마트스토어
            </Link>
            <Link
              href="#"
              className={`${notoSansKr.className} font-black tracking-tighter leading-none transition-colors decoration-2 underline-offset-[8px] decoration-transparent hover:text-slate-900 hover:underline hover:decoration-black aria-[current=page]:text-slate-900 aria-[current=page]:underline aria-[current=page]:decoration-black`}
            >
              네이버 블로그
            </Link>
            <Link
              href="#"
              className={`${notoSansKr.className} font-black tracking-tighter leading-none transition-colors decoration-2 underline-offset-[8px] decoration-transparent hover:text-slate-900 hover:underline hover:decoration-black aria-[current=page]:text-slate-900 aria-[current=page]:underline aria-[current=page]:decoration-black`}
            >
              네이버 지도
            </Link>
            <Link
              href="#"
              className={`${notoSansKr.className} font-black tracking-tighter leading-none transition-colors decoration-2 underline-offset-[8px] decoration-transparent hover:text-slate-900 hover:underline hover:decoration-black aria-[current=page]:text-slate-900 aria-[current=page]:underline aria-[current=page]:decoration-black`}
            >
              카카오맵
            </Link>
        </div>

        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-600 hover:text-slate-900">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;