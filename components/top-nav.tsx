"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import UserMenu from "@/components/user-menu";
import { useSession } from "next-auth/react";

type NavKey = "blog" | "place" | "place-review";

type TopNavProps = {
  active?: NavKey;
};

const menuItems: Array<{
  label: string;
  href: string;
  key?: NavKey;
}> = [
  { label: "스마트스토어", href: "/" },
  { label: "상위 블로그 찾기", href: "/", key: "blog" },
  { label: "플레이스 순위 추적", href: "/place", key: "place" },
  { label: "플레이스 리뷰 추적", href: "/place-review", key: "place-review" },
  { label: "경쟁 분석", href: "/" },
  { label: "서비스 소개", href: "/" },
  { label: "공지사항", href: "/" },
];

export default function TopNav({ active = "place" }: TopNavProps) {
  const [open, setOpen] = useState(false);
  

  const getClassName = (key?: NavKey) =>
    key && active === key
      ? "whitespace-nowrap text-[14px] font-extrabold text-[#7c3aed]"
      : "whitespace-nowrap text-[14px] font-semibold text-[#111827]";

  const getMobileClassName = (key?: NavKey) =>
    key && active === key
      ? "block rounded-[12px] bg-[#f5f3ff] px-4 py-3 text-[15px] font-bold text-[#7c3aed]"
      : "block rounded-[12px] px-4 py-3 text-[15px] font-semibold text-[#111827] hover:bg-[#f7f7fb]";

  const getBreadcrumbLabel = () => {
    if (active === "place") return "플레이스 순위 추적";
    if (active === "place-review") return "플레이스 리뷰 추적";
    return "상위 블로그 찾기";
  };

  const { data: session, status } = useSession();

const renderAuthArea = () => {
  if (status === "loading") {
    return (
      <div className="inline-flex h-[44px] items-center justify-center rounded-[12px] bg-[#f3f4f6] px-5 text-[13px] font-bold text-[#9ca3af]">
        불러오는 중
      </div>
    );
  }

  if (session?.user) {
    return <UserMenu />;
  }

  return (
    <Link
      href="/login"
      className="inline-flex h-[44px] items-center justify-center rounded-[12px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[13px] font-bold text-white"
    >
      로그인/가입
    </Link>
  );
};

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[#e8ebf2] bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mr-3 flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#111827] xl:hidden"
              aria-label="메뉴 열기"
            >
              ☰
            </button>

            <Link href="/" className="shrink-0">
              <img
                src="/logo.png"
                alt="logo"
                className="h-10 w-auto object-contain"
              />
            </Link>
          </div>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-5 xl:flex 2xl:gap-7">
            <Link href="/" className={getClassName()}>
              스마트스토어
            </Link>

            <Link href="/" className={getClassName("blog")}>
              상위 블로그 찾기
            </Link>

            <Link href="/place" className={getClassName("place")}>
              플레이스 순위 추적
            </Link>

            <Link href="/place-review" className={getClassName("place-review")}>
              플레이스 리뷰 추적
            </Link>

            <Link href="/" className={getClassName()}>
              경쟁 분석
            </Link>

            <Link href="/" className={getClassName()}>
              서비스 소개
            </Link>

            <Link href="/" className={getClassName()}>
              공지사항
            </Link>
          </nav>

          <div className="ml-auto hidden items-center gap-3 xl:flex">
            {renderAuthArea()}
          </div>

          <div className="ml-auto flex items-center gap-3 xl:hidden">
            <div className="text-[20px]">👤</div>
          </div>
        </div>
      </header>

      <div className="border-b border-[#e8ebf2] bg-white/80">
        <div className="mx-auto max-w-[1280px] px-4 py-3 text-[13px] text-[#6b7280] md:px-6">
          홈 &gt; 네이버지도 &gt;{" "}
          <span className="font-semibold text-[#111827]">
            {getBreadcrumbLabel()}
          </span>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/35 xl:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[70] h-full w-[290px] bg-white shadow-2xl transition-transform duration-300 xl:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[68px] items-center justify-between border-b border-[#e8ebf2] px-4">
          <img
            src="/logo.png"
            alt="logo"
            className="h-9 w-auto object-contain"
          />

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#e5e7eb] text-[18px] text-[#111827]"
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-5">
          <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-[#9ca3af]">
            Menu
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                onClick={() => setOpen(false)}
                className={getMobileClassName(item.key)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 rounded-[14px] bg-[#f6f7fb] px-4 py-4">
            <div className="text-[13px] font-semibold text-[#4b5563]">
              전체 1 / 사용 1 / <span className="text-[#7c3aed]">잔여 0</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}