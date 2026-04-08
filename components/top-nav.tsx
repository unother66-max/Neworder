"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import UserMenu from "@/components/user-menu";
import { useSession } from "next-auth/react";

type NavKey = "blog" | "place" | "place-review" | "place-analysis";

type TopNavProps = {
  active?: NavKey;
};

const NAVER_BLOG_MENU: Array<{ label: string; href: string; key: NavKey }> = [
  { label: "상위 블로그 찾기", href: "/top-blog", key: "blog" },
];

const NAVER_MAP_MENU: Array<{ label: string; href: string; key: NavKey }> = [
  { label: "플레이스 순위 추적", href: "/place", key: "place" },
  { label: "플레이스 리뷰 추적", href: "/place-review", key: "place-review" },
  { label: "플레이스 순위 분석", href: "/place-analysis", key: "place-analysis" },
];

export default function TopNav({ active }: TopNavProps) {
  const [open, setOpen] = useState(false);
  const [naverMapOpen, setNaverMapOpen] = useState(false);
  const [naverBlogOpen, setNaverBlogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest?.('[data-naver-map-menu="root"]')) return;
      if (target.closest?.('[data-naver-blog-menu="root"]')) return;
      setNaverMapOpen(false);
      setNaverBlogOpen(false);
    };

    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const getClassName = (key?: NavKey) => {
    const base =
      "whitespace-nowrap text-[15px] font-extrabold leading-[1.1] text-[#111827] transition";
    const inactive = "hover:font-black";
    const activeClass = "font-black";

    return `${base} ${key && active === key ? activeClass : inactive}`;
  };

  const getMobileClassName = (key?: NavKey) =>
    key && active === key
      ? "block rounded-[12px] bg-[#f5f3ff] px-4 py-3 text-[16px] font-black text-[#7c3aed]"
      : "block rounded-[12px] px-4 py-3 text-[16px] font-extrabold text-[#111827] hover:bg-[#f7f7fb] hover:font-black";

  const isNaverMapActive =
    active === "place" || active === "place-review" || active === "place-analysis";

  const isNaverBlogActive = active === "blog";

  const getBreadcrumbCategoryLabel = () => {
    if (isNaverBlogActive) return "네이버 블로그";
    if (isNaverMapActive) return "네이버지도";
    return "네이버지도";
  };

  const getBreadcrumbLabel = () => {
    if (active === "place") return "플레이스 순위 추적";
    if (active === "place-review") return "플레이스 리뷰 추적";
    if (active === "blog") return "상위 블로그 찾기";
    if (active === "place-analysis") return "플레이스 순위 분석";
    return "";
  };

  const renderAuthArea = () => {
    if (!mounted) {
      return (
        <div className="inline-flex h-[44px] items-center justify-center rounded-[12px] bg-[#f3f4f6] px-5 text-[13px] font-bold text-[#9ca3af]">
          불러오는 중
        </div>
      );
    }

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
  className="inline-flex h-[44px] items-center justify-center rounded-[12px] bg-[#e11d2e] px-5 text-[13px] font-bold text-white transition hover:bg-[#c81624]"
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

            <div
              className="relative"
              data-naver-blog-menu="root"
              onMouseEnter={() => setNaverBlogOpen(true)}
              onMouseLeave={() => setNaverBlogOpen(false)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNaverBlogOpen((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 align-middle"
                aria-haspopup="menu"
                aria-expanded={naverBlogOpen}
              >
                <span
                  className={
                    isNaverBlogActive
                      ? "whitespace-nowrap text-[14px] font-extrabold leading-[1.1] text-[#7c3aed]"
                      : getClassName("blog")
                  }
                >
                  네이버 블로그
                </span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {naverBlogOpen ? "▴" : "▾"}
                </span>
              </button>

              {naverBlogOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[40px] w-[220px] overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                >
                  <div className="pb-2">
                    {NAVER_BLOG_MENU.map((item) => (
                      <Link
                        key={`${item.key}-${item.href}`}
                        href={item.href}
                        className={`block px-4 py-3 hover:bg-[#f8fafc] ${getClassName(
                          item.key
                        )}`}
                        onClick={() => setNaverBlogOpen(false)}
                        role="menuitem"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="relative"
              data-naver-map-menu="root"
              onMouseEnter={() => setNaverMapOpen(true)}
              onMouseLeave={() => setNaverMapOpen(false)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNaverMapOpen((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 align-middle"
                aria-haspopup="menu"
                aria-expanded={naverMapOpen}
              >
                <span
                  className={
                    isNaverMapActive
                      ? "whitespace-nowrap text-[14px] font-extrabold leading-[1.1] text-[#7c3aed]"
                      : getClassName("blog")
                  }
                >
                  네이버 지도
                </span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {naverMapOpen ? "▴" : "▾"}
                </span>
              </button>

              {naverMapOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[40px] w-[220px] overflow-hidden rounded-[16px] border border-[#e5e7eb] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                >
                  <div className="pb-2">
                    {NAVER_MAP_MENU.map((item) => (
                      <Link
                        key={`${item.key}-${item.href}`}
                        href={item.href}
                        className={`block px-4 py-3 hover:bg-[#f8fafc] ${getClassName(item.key)}`}
                        onClick={() => setNaverMapOpen(false)}
                        role="menuitem"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
            {mounted ? (
              <div className="text-[20px]">👤</div>
            ) : (
              <div className="h-10 w-10 rounded-[10px] bg-[#f3f4f6]" />
            )}
          </div>
        </div>
      </header>

      <div className="border-b border-[#e8ebf2] bg-white/80">
        <div className="mx-auto max-w-[1280px] px-4 py-3 text-[13px] text-[#6b7280] md:px-6">
          <Link
            href="/"
            className="font-semibold text-[#111827] transition hover:underline"
          >
            홈
          </Link>
          {" > "}
          {getBreadcrumbCategoryLabel()}
          {getBreadcrumbLabel() && (
            <>
              {" > "}
              <span className="font-semibold text-[#111827]">
                {getBreadcrumbLabel()}
              </span>
            </>
          )}
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
          <Link href="/" onClick={() => setOpen(false)}>
            <img
              src="/logo.png"
              alt="logo"
              className="h-9 w-auto object-contain"
            />
          </Link>

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
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className={getMobileClassName()}
            >
              스마트스토어
            </Link>

            <button
              type="button"
              onClick={() => setNaverBlogOpen((prev) => !prev)}
              className={
                isNaverBlogActive
                  ? "flex w-full items-center justify-between rounded-[12px] bg-[#f5f3ff] px-4 py-3 text-left text-[15px] font-extrabold text-[#7c3aed]"
                  : "flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-left text-[15px] font-extrabold text-[#111827] hover:bg-[#f7f7fb]"
              }
              aria-expanded={naverBlogOpen}
            >
              <span>네이버 블로그</span>
              <span className="text-[14px]">{naverBlogOpen ? "▴" : "▾"}</span>
            </button>

            {naverBlogOpen && (
              <div className="space-y-1 pl-2">
                {NAVER_BLOG_MENU.map((item) => (
                  <Link
                    key={`${item.key}-${item.href}-mobile`}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setNaverBlogOpen(false);
                    }}
                    className={getMobileClassName(item.key)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setNaverMapOpen((prev) => !prev)}
              className={
                isNaverMapActive
                  ? "flex w-full items-center justify-between rounded-[12px] bg-[#f5f3ff] px-4 py-3 text-left text-[15px] font-extrabold text-[#7c3aed]"
                  : "flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-left text-[15px] font-extrabold text-[#111827] hover:bg-[#f7f7fb]"
              }
              aria-expanded={naverMapOpen}
            >
              <span>네이버 지도</span>
              <span className="text-[14px]">{naverMapOpen ? "▴" : "▾"}</span>
            </button>

            {naverMapOpen && (
              <div className="space-y-1 pl-2">
                {NAVER_MAP_MENU.map((item) => (
                  <Link
                    key={`${item.key}-${item.href}-mobile`}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setNaverMapOpen(false);
                    }}
                    className={getMobileClassName(item.key)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            <Link
              href="/"
              onClick={() => setOpen(false)}
              className={getMobileClassName()}
            >
              서비스 소개
            </Link>

            <Link
              href="/"
              onClick={() => setOpen(false)}
              className={getMobileClassName()}
            >
              공지사항
            </Link>
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