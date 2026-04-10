"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import UserMenu from "@/components/user-menu";
import { signOut, useSession } from "next-auth/react";

type NavKey =
  | "blog"
  | "place"
  | "place-review"
  | "place-analysis"
  | "kakao-ranking"
  | "kakao-place"
  | "kakao-analysis";

type TopNavProps = {
  active?: NavKey;
};

const SMARTSTORE_MENU: Array<{
  label: string;
  href: string;
  badge?: "NEW";
}> = [
  { label: "순위 추적  가격비교", href: "/" },
  { label: "순위 추적  플러스스토어", href: "/" },
  { label: "리뷰 추적", href: "/" },
  { label: "순위 분석", href: "/" },
  { label: "스마트스토어 분석", href: "/" },
  { label: "키워드 분석", href: "/" },
  { label: "키워드 추출기", href: "/" },
];

const NAVER_BLOG_MENU: Array<{ label: string; href: string; key: NavKey }> = [
  { label: "상위 블로그 찾기", href: "/top-blog", key: "blog" },
];

const NAVER_MAP_MENU: Array<{ label: string; href: string; key: NavKey }> = [
  { label: "플레이스 순위 추적", href: "/place", key: "place" },
  { label: "플레이스 리뷰 추적", href: "/place-review", key: "place-review" },
  { label: "플레이스 순위 분석", href: "/place-analysis", key: "place-analysis" },
];

const KAKAO_MAP_MENU: Array<{
  label: string;
  href: string;
  key: NavKey;
  badge?: "NEW";
}> = [
  { label: "랭킹추적", href: "/kakao-ranking", key: "kakao-ranking" },
  { label: "순위추적", href: "/kakao-place", key: "kakao-place" },
  { label: "순위분석", href: "/kakao-analysis", key: "kakao-analysis" },
];

export default function TopNav({ active }: TopNavProps) {
  const [open, setOpen] = useState(false);
  const [smartstoreOpen, setSmartstoreOpen] = useState(false);
  const [kakaoMapOpen, setKakaoMapOpen] = useState(false);
  const [naverMapOpen, setNaverMapOpen] = useState(false);
  const [naverBlogOpen, setNaverBlogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();
  const closeTimerRef = useRef<number | null>(null);

  const closeAllDesktopMenus = () => {
    setSmartstoreOpen(false);
    setKakaoMapOpen(false);
    setNaverBlogOpen(false);
    setNaverMapOpen(false);
  };

  const openOnlyDesktopMenu = (
    key: "smartstore" | "kakao" | "naverBlog" | "naverMap"
  ) => {
    // 마우스를 빠르게 이동할 때 "잔상"이 생기는 원인:
    // 닫힘 딜레이 + 페이드아웃 동안 이전 메뉴가 남아있는 것.
    // 새 메뉴를 여는 순간 다른 메뉴는 즉시 닫아서 한 번에 하나만 보이게 한다.
    setSmartstoreOpen(key === "smartstore");
    setKakaoMapOpen(key === "kakao");
    setNaverBlogOpen(key === "naverBlog");
    setNaverMapOpen(key === "naverMap");
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleCloseMenus = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeAllDesktopMenus();
    }, 180);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest?.('[data-smartstore-menu="root"]')) return;
      if (target.closest?.('[data-kakao-map-menu="root"]')) return;
      if (target.closest?.('[data-naver-map-menu="root"]')) return;
      if (target.closest?.('[data-naver-blog-menu="root"]')) return;
      closeAllDesktopMenus();
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
      ? "block rounded-[12px] bg-[#fff1f2] px-4 py-3 text-[16px] font-black text-[#e11d2e]"
      : "block rounded-[12px] px-4 py-3 text-[16px] font-extrabold text-[#111827] hover:bg-[#f7f7fb] hover:font-black";

  const isNaverMapActive =
    active === "place" || active === "place-review" || active === "place-analysis";

  const isNaverBlogActive = active === "blog";

  const isKakaoMapActive =
    active === "kakao-ranking" || active === "kakao-place" || active === "kakao-analysis";

  const getBreadcrumbCategoryLabel = () => {
    if (isNaverBlogActive) return "네이버 블로그";
    if (isNaverMapActive) return "네이버지도";
    if (isKakaoMapActive) return "카카오맵";
    return "네이버지도";
  };

  const getBreadcrumbLabel = () => {
    if (active === "place") return "플레이스 순위 추적";
    if (active === "place-review") return "플레이스 리뷰 추적";
    if (active === "blog") return "상위 블로그 찾기";
    if (active === "place-analysis") return "플레이스 순위 분석";
    if (active === "kakao-ranking") return "랭킹 추적";
    if (active === "kakao-place") return "순위 추적";
    if (active === "kakao-analysis") return "순위 분석";
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
        className="inline-flex h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[#e11d2e] px-5 text-[13px] font-bold text-white transition hover:bg-[#c81624]"
      >
        <span
          className="text-[16px] leading-none [filter:brightness(0)_invert(1)]"
          aria-hidden
        >
          🔐
        </span>
        <span className="text-white">로그인/가입</span>
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
            <div
              className="relative"
              data-smartstore-menu="root"
              onMouseEnter={() => {
                clearCloseTimer();
                openOnlyDesktopMenu("smartstore");
              }}
              onMouseLeave={() => {
                scheduleCloseMenus();
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSmartstoreOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      openOnlyDesktopMenu("smartstore");
                      return true;
                    }
                    return false;
                  });
                }}
                className="inline-flex items-center gap-1 align-middle"
                aria-haspopup="menu"
                aria-expanded={smartstoreOpen}
              >
                <span className={getClassName()}>스마트스토어</span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {smartstoreOpen ? "▴" : "▾"}
                </span>
              </button>

              <div
                role="menu"
                aria-hidden={!smartstoreOpen}
                className={`absolute left-0 top-full mt-1.5 w-[160px] overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.10)] origin-top-left transition duration-150 ease-out ${
                  smartstoreOpen
                    ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                    : "pointer-events-none opacity-0 -translate-y-1 scale-[0.98]"
                }`}
              >
                <div className="absolute -top-6 left-0 h-6 w-full" />
                <div className="py-1">
                  {SMARTSTORE_MENU.map((item) => (
                    <Link
                      key={`${item.label}-${item.href}`}
                      href={item.href}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-[13px] font-bold text-[#111827] hover:bg-[#f8fafc]"
                      onClick={() => setSmartstoreOpen(false)}
                      role="menuitem"
                    >
                      <span className="truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="shrink-0 rounded-[10px] bg-[#ef4444] px-2.5 py-1 text-[12px] font-black text-white">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="relative"
              data-naver-blog-menu="root"
              onMouseEnter={() => {
                clearCloseTimer();
                openOnlyDesktopMenu("naverBlog");
              }}
              onMouseLeave={() => {
                scheduleCloseMenus();
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNaverBlogOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      openOnlyDesktopMenu("naverBlog");
                      return true;
                    }
                    return false;
                  });
                }}
                className="inline-flex items-center gap-1 align-middle"
                aria-haspopup="menu"
                aria-expanded={naverBlogOpen}
              >
                <span
                  className={
                    isNaverBlogActive
                      ? "whitespace-nowrap text-[15px] font-extrabold leading-[1.1] text-[#e11d2e]"
                      : getClassName("blog")
                  }
                >
                  네이버 블로그
                </span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {naverBlogOpen ? "▴" : "▾"}
                </span>
              </button>

              <div
                role="menu"
                aria-hidden={!naverBlogOpen}
                className={`absolute left-0 top-full mt-1.5 w-[160px] overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.10)] origin-top-left transition duration-150 ease-out ${
                  naverBlogOpen
                    ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                    : "pointer-events-none opacity-0 -translate-y-1 scale-[0.98]"
                }`}
              >
                <div className="absolute -top-6 left-0 h-6 w-full" />
                <div className="py-1">
                  {NAVER_BLOG_MENU.map((item) => (
                    <Link
                      key={`${item.key}-${item.href}`}
                      href={item.href}
                      className={`block px-4 py-2 text-[13px] font-bold hover:bg-[#f8fafc] ${
                        item.key && active === item.key ? "text-[#e11d2e]" : "text-[#111827]"
                      }`}
                      onClick={() => setNaverBlogOpen(false)}
                      role="menuitem"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="relative"
              data-naver-map-menu="root"
              onMouseEnter={() => {
                clearCloseTimer();
                openOnlyDesktopMenu("naverMap");
              }}
              onMouseLeave={() => {
                scheduleCloseMenus();
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNaverMapOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      openOnlyDesktopMenu("naverMap");
                      return true;
                    }
                    return false;
                  });
                }}
                className="inline-flex items-center gap-1 align-middle"
                aria-haspopup="menu"
                aria-expanded={naverMapOpen}
              >
                <span
                  className={
                    isNaverMapActive
                      ? "whitespace-nowrap text-[15px] font-extrabold leading-[1.1] text-[#e11d2e]"
                      : getClassName("blog")
                  }
                >
                  네이버 지도
                </span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {naverMapOpen ? "▴" : "▾"}
                </span>
              </button>

              <div
                role="menu"
                aria-hidden={!naverMapOpen}
                className={`absolute left-0 top-full mt-1.5 w-[160px] overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.10)] origin-top-left transition duration-150 ease-out ${
                  naverMapOpen
                    ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                    : "pointer-events-none opacity-0 -translate-y-1 scale-[0.98]"
                }`}
              >
                <div className="absolute -top-6 left-0 h-6 w-full" />
                <div className="py-1">
                  {NAVER_MAP_MENU.map((item) => (
                    <Link
                      key={`${item.key}-${item.href}`}
                      href={item.href}
                      className={`block px-4 py-2 text-[13px] font-bold hover:bg-[#f8fafc] ${
                        item.key && active === item.key ? "text-[#e11d2e]" : "text-[#111827]"
                      }`}
                      onClick={() => setNaverMapOpen(false)}
                      role="menuitem"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="relative"
              data-kakao-map-menu="root"
              onMouseEnter={() => {
                clearCloseTimer();
                openOnlyDesktopMenu("kakao");
              }}
              onMouseLeave={() => {
                scheduleCloseMenus();
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setKakaoMapOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      openOnlyDesktopMenu("kakao");
                      return true;
                    }
                    return false;
                  });
                }}
                className="inline-flex items-center gap-1 align-middle"
                aria-haspopup="menu"
                aria-expanded={kakaoMapOpen}
              >
                <span
                  className={
                    isKakaoMapActive
                      ? "whitespace-nowrap text-[15px] font-extrabold leading-[1.1] text-[#e11d2e]"
                      : getClassName()
                  }
                >카카오맵</span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {kakaoMapOpen ? "▴" : "▾"}
                </span>
              </button>

              <div
                role="menu"
                aria-hidden={!kakaoMapOpen}
                className={`absolute left-0 top-full mt-1.5 w-[160px] overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.10)] origin-top-left transition duration-150 ease-out ${
                  kakaoMapOpen
                    ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                    : "pointer-events-none opacity-0 -translate-y-1 scale-[0.98]"
                }`}
              >
                <div className="absolute -top-6 left-0 h-6 w-full" />
                <div className="py-1">
                  {KAKAO_MAP_MENU.map((item) => (
                    <Link
                      key={`${item.label}-${item.href}`}
                      href={item.href}
                      className={`flex items-center justify-between gap-2 px-4 py-2 text-[13px] font-bold hover:bg-[#f8fafc] ${
                        item.key && active === item.key ? "text-[#e11d2e]" : "text-[#111827]"
                      }`}
                      onClick={() => setKakaoMapOpen(false)}
                      role="menuitem"
                    >
                      <span className="truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="shrink-0 rounded-[10px] bg-[#ef4444] px-2.5 py-1 text-[12px] font-black text-white">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

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
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[70] flex h-full w-[290px] flex-col bg-white shadow-2xl transition-transform duration-300 xl:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
        aria-modal="true"
        aria-label="사이드 메뉴"
      >
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#e8ebf2] px-4">
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

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-[#9ca3af]">
            Menu
          </div>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => setSmartstoreOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-left text-[15px] font-extrabold text-[#111827] hover:bg-[#f7f7fb]"
              aria-expanded={smartstoreOpen}
            >
              <span>스마트스토어</span>
              <span className="text-[14px]">{smartstoreOpen ? "▴" : "▾"}</span>
            </button>

            {smartstoreOpen && (
              <div className="space-y-1 pl-2">
                {SMARTSTORE_MENU.map((item) => (
                  <Link
                    key={`${item.label}-${item.href}-mobile`}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setSmartstoreOpen(false);
                    }}
                    className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-[15px] font-semibold text-[#111827] hover:bg-[#f7f7fb]"
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="shrink-0 rounded-[10px] bg-[#ef4444] px-2 py-0.5 text-[11px] font-black text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setNaverBlogOpen((prev) => !prev)}
              className={
                isNaverBlogActive
                  ? "flex w-full items-center justify-between rounded-[12px] bg-[#fff1f2] px-4 py-3 text-left text-[15px] font-extrabold text-[#e11d2e]"
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
                  ? "flex w-full items-center justify-between rounded-[12px] bg-[#fff1f2] px-4 py-3 text-left text-[15px] font-extrabold text-[#e11d2e]"
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

            <button
              type="button"
              onClick={() => setKakaoMapOpen((prev) => !prev)}
              className={
                isKakaoMapActive
                  ? "flex w-full items-center justify-between rounded-[12px] bg-[#fff1f2] px-4 py-3 text-left text-[15px] font-extrabold text-[#e11d2e]"
                  : "flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-left text-[15px] font-extrabold text-[#111827] hover:bg-[#f7f7fb]"
              }
              aria-expanded={kakaoMapOpen}
            >
              <span>카카오맵</span>
              <span className="text-[14px]">{kakaoMapOpen ? "▴" : "▾"}</span>
            </button>

            {kakaoMapOpen && (
              <div className="space-y-1 pl-2">
                {KAKAO_MAP_MENU.map((item) => (
                  <Link
                    key={`${item.label}-${item.href}-mobile`}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setKakaoMapOpen(false);
                    }}
                    className={`flex items-center justify-between gap-3 ${getMobileClassName(item.key)}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="shrink-0 rounded-[10px] bg-[#ef4444] px-2 py-0.5 text-[11px] font-black text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}

          </nav>

          {session?.user && (
            <div className="mt-6 border-t border-[#e8ebf2] pt-4">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center rounded-[12px] px-4 py-3 text-[15px] font-extrabold text-[#111827] hover:bg-[#f7f7fb]"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}