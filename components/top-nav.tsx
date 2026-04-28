"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

type TopNavProps = {
  active?: unknown;
  activeSmartstoreSub?: unknown;
  showBreadcrumb?: boolean;
};

const TopNav = (_props: TopNavProps) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between px-8 bg-transparent transition-all">
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="PostLabs"
            width={120}
            height={40}
            priority
            className="h-8 w-auto"
          />
          <span className="sr-only">PostLabs</span>
        </Link>
      </div>

          <div className="hidden md:flex items-center gap-10 text-sm font-medium text-slate-600">
            <Link href="#" className="hover:text-slate-900 transition-colors">
              스마트스토어
            </Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">
              네이버 블로그
            </Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">
              네이버 지도
            </Link>
            <Link href="#" className="hover:text-slate-900 transition-colors">
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
    </nav>
  );
};

export default TopNav;