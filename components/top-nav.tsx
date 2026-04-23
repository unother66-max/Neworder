"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  /** 스마트스토어 하위 메뉴 선택 표시용 (항목의 subId와 일치) */
  activeSmartstoreSub?: string;
};

/** 드롭다운 Link는 <a>라 globals.css의 비레이어 `a { color: inherit }`가 유틸보다 우선할 수 있어 !text 로 고정 */
const SUBMENU_ACTIVE = "font-black !text-[#e11d2e]";
const SUBMENU_INACTIVE = "font-bold !text-[#111827]";

type SmartstoreMenuItem =
  | { variant: "rankNaverPrice"; href: string; subId: string; badge?: "NEW" }
  | { variant: "rankPlusStore"; href: string; subId: string; badge?: "NEW" }
  | { label: string; href: string; subId: string; badge?: "NEW" };

const SMARTSTORE_MENU: SmartstoreMenuItem[] = [
  { variant: "rankNaverPrice", href: "/smartstore", subId: "rank-naver-price" },
  {
    variant: "rankPlusStore",
    href: "/smartstore/plus-store-ranking-track",
    subId: "rank-plus-store",
  },
];

function smartstoreMenuKey(item: SmartstoreMenuItem) {
  return item.subId;
}

function SmartstoreMenuLabel({ item }: { item: SmartstoreMenuItem }) {
  if ("variant" in item && item.variant === "rankNaverPrice") {
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-inherit">
        <span className="shrink-0 font-inherit text-inherit">순위 추적</span>
        <img
          src={NAVER_PRICE_COMPARE_SVG_SRC}
          alt=""
          width={78}
          height={16}
          className="h-4 w-auto shrink-0"
        />
      </span>
    );
  }
  if ("variant" in item && item.variant === "rankPlusStore") {
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-inherit">
        <span className="shrink-0 font-inherit text-inherit">순위 추적</span>
        <img
          src={PLUS_STORE_SVG_SRC}
          alt=""
          width={79}
          height={16}
          className="h-4 w-auto shrink-0"
        />
      </span>
    );
  }
  return (
    <span className="truncate font-inherit text-inherit">
      {(item as { label: string }).label}
    </span>
  );
}

/**
 * base와 pathname 일치: 동일 세그먼트, /base/ 하위, /base- 로 시작하는 파생(/place-review-register 등)
 * /place 만 /place-review 와 헷갈리지 않게 예외 처리
 */
function pathMatchesNavBase(pathname: string, base: string): boolean {
  if (!pathname || !base) return false;
  if (base === "/place") {
    return pathname === "/place" || pathname.startsWith("/place/");
  }
  return (
    pathname === base ||
    pathname.startsWith(`${base}/`) ||
    pathname.startsWith(`${base}-`)
  );
}

function pathMatchesAnyBase(
  pathname: string,
  bases: readonly string[]
): boolean {
  return bases.some((b) => pathMatchesNavBase(pathname, b));
}

/** 하위 메뉴(NavKey)별 대표 경로 prefix */
const NAV_KEY_PATHS: Record<NavKey, readonly string[]> = {
  blog: ["/top-blog", "/blog"],
  place: ["/place"],
  "place-review": ["/place-review"],
  "place-analysis": ["/place-analysis"],
  "kakao-ranking": ["/kakao-ranking"],
  "kakao-place": ["/kakao-place"],
  "kakao-analysis": ["/kakao-analysis"],
};

function pathMatchesNavKey(pathname: string, key: NavKey): boolean {
  return pathMatchesAnyBase(pathname, NAV_KEY_PATHS[key]);
}

/** 상위 메뉴: 네이버 지도 섹션 */
const NAVER_MAP_SECTION_BASES = [
  "/place",
  "/place-review",
  "/place-analysis",
] as const;

/** 상위 메뉴: 네이버 블로그 섹션 */
const NAVER_BLOG_SECTION_BASES = ["/top-blog", "/blog"] as const;

/** 상위 메뉴: 스마트스토어 섹션 (하위 라우트 추가 시 여기만 확장) */
const SMARTSTORE_SECTION_BASES = ["/smartstore", "/smart-store"] as const;

function pathMatchesNaverMapSection(pathname: string): boolean {
  return pathMatchesAnyBase(pathname, NAVER_MAP_SECTION_BASES);
}

function pathMatchesNaverBlogSection(pathname: string): boolean {
  return pathMatchesAnyBase(pathname, NAVER_BLOG_SECTION_BASES);
}

/** 카카오맵 관련 경로 전체 (/kakao-...) */
function pathMatchesKakaoMapSection(pathname: string): boolean {
  return pathname.startsWith("/kakao");
}

function pathMatchesSmartstoreSection(pathname: string): boolean {
  return pathMatchesAnyBase(pathname, SMARTSTORE_SECTION_BASES);
}

function isSubmenuKeyActive(
  key: NavKey,
  pathname: string,
  activeProp?: NavKey
): boolean {
  if (activeProp === key) return true;
  return pathMatchesNavKey(pathname, key);
}

/** 끝 슬래시 제거해 /place/ ↔ /place 일치 */
function trimPathnameSegments(p: string): string {
  if (!p) return "";
  let s = p.trim();
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/**
 * usePathname()이 클라이언트에서 잠깐 또는 잘못 `"/"`로 남는 경우가 있어
 * (실제 location은 이미 `/smartstore` 등). 이때는 location을 우선해 active가 틀어지지 않게 한다.
 * SSR에서는 훅 값만 사용.
 */
function resolveTopNavPathname(fromHook: string | null | undefined): string {
  const h = trimPathnameSegments(fromHook ?? "");
  if (typeof window === "undefined") {
    return h;
  }
  const w = trimPathnameSegments(window.location.pathname);
  if (h === "/" && w !== "" && w !== "/") {
    return w;
  }
  if (h !== "") return h;
  return w;
}

/** 한글 파일명은 내부 fetch/프리페치 시 ByteString 제약에 걸릴 수 있어 경로만 퍼센트 인코딩 */
const NAVER_PRICE_COMPARE_SVG_SRC = encodeURI("/naver_가격비교.svg");
const PLUS_STORE_SVG_SRC = "/download.svg";

const NAVER_BLOG_MENU: Array<{ label: string; href: string; key: NavKey }> = [
  { label: "상위 블로그 찾기", href: "/top-blog", key: "blog" },
];

const NAVER_MAP_MENU: Array<{ label: string; href: string; key: NavKey }> = [
  { label: "매장 순위 추적", href: "/place", key: "place" },
  { label: "매장 리뷰 추적", href: "/place-review", key: "place-review" },
  { label: "매장 순위 분석", href: "/place-analysis", key: "place-analysis" },
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

export default function TopNav({
  active,
  activeSmartstoreSub,
}: TopNavProps) {
  const pathnameFromHook = usePathname();
  const [pathSyncTick, setPathSyncTick] = useState(0);
  const pathname = useMemo(
    () => resolveTopNavPathname(pathnameFromHook),
    [pathnameFromHook, pathSyncTick]
  );
  const [open, setOpen] = useState(false);
  const [smartstoreOpen, setSmartstoreOpen] = useState(false);
  const [kakaoMapOpen, setKakaoMapOpen] = useState(false);
  const [naverMapOpen, setNaverMapOpen] = useState(false);
  const [naverBlogOpen, setNaverBlogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();
  const closeTimerRef = useRef<number | null>(null);

  const submenuKeyActive = (key: NavKey) =>
    isSubmenuKeyActive(key, pathname, active);

  const getMobileSubmenuClassName = (
    key?: NavKey,
    layout: "block" | "row" = "block"
  ) => {
    const rowClasses =
      key && submenuKeyActive(key)
        ? "rounded-[12px] bg-[#fff1f2] px-4 py-3 text-[16px] font-black !text-[#e11d2e]"
        : "rounded-[12px] px-4 py-3 text-[16px] font-extrabold !text-[#111827] hover:bg-[#f7f7fb] hover:font-black";
    return layout === "row"
      ? `flex items-center justify-between gap-3 ${rowClasses}`
      : `block ${rowClasses}`;
  };

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
    if (typeof window === "undefined") return;
    const bump = () => setPathSyncTick((t) => t + 1);
    window.addEventListener("popstate", bump);
    return () => window.removeEventListener("popstate", bump);
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
    const keyActive =
      Boolean(key) &&
      (active === key || pathMatchesNavKey(pathname, key as NavKey));

    return `${base} ${keyActive ? activeClass : inactive}`;
  };

  const isNaverMapActive = pathMatchesNaverMapSection(pathname);

  const isNaverBlogActive = pathMatchesNaverBlogSection(pathname);

  const isKakaoMapActive = pathMatchesKakaoMapSection(pathname);

  const isSmartstoreSectionActive =
    pathMatchesSmartstoreSection(pathname) || Boolean(activeSmartstoreSub);

  const isSmartstoreSubActive = (item: SmartstoreMenuItem) => {
    if (activeSmartstoreSub && item.subId === activeSmartstoreSub) return true;
    const p = trimPathnameSegments(pathname);
    if (item.subId === "rank-naver-price") {
      // 가격비교 페이지는 /smartstore "정확히" 일치할 때만 활성화
      return p === "/smartstore";
    }
    if (item.subId === "rank-plus-store") {
      // 플러스스토어는 해당 경로 prefix 매칭
      return p === item.href || p.startsWith(`${item.href}/`);
    }
    return p === item.href || p.startsWith(`${item.href}/`);
  };

  const getBreadcrumbCategoryLabel = () => {
    if (isNaverBlogActive) return "네이버 블로그";
    if (isNaverMapActive) return "네이버지도";
    if (isKakaoMapActive) return "카카오맵";
    if (pathMatchesSmartstoreSection(pathname)) return "스마트스토어";
    return "네이버지도";
  };

  const getBreadcrumbLabel = () => {
    if (active === "place-review" || pathMatchesNavKey(pathname, "place-review")) {
      return "매장 리뷰 추적";
    }
    if (active === "place-analysis" || pathMatchesNavKey(pathname, "place-analysis")) {
      return "매장 순위 분석";
    }
    if (active === "place" || pathMatchesNavKey(pathname, "place")) {
      return "매장 순위 추적";
    }
    if (active === "blog" || pathMatchesNavKey(pathname, "blog")) {
      return "상위 블로그 찾기";
    }
    if (active === "kakao-ranking" || pathMatchesNavKey(pathname, "kakao-ranking")) {
      return "랭킹 추적";
    }
    if (active === "kakao-place" || pathMatchesNavKey(pathname, "kakao-place")) {
      return "순위 추적";
    }
    if (active === "kakao-analysis" || pathMatchesNavKey(pathname, "kakao-analysis")) {
      return "순위 분석";
    }
    if (pathMatchesSmartstoreSection(pathname)) {
      return "순위 추적(가격비교)";
    }
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
                <span
                  className={
                    isSmartstoreSectionActive
                      ? "whitespace-nowrap text-[15px] font-extrabold leading-[1.1] text-[#e11d2e]"
                      : getClassName()
                  }
                >
                  스마트스토어
                </span>
                <span className="text-[11px] font-black leading-none text-[#6b7280] translate-y-[-1px]">
                  {smartstoreOpen ? "▴" : "▾"}
                </span>
              </button>

              <div
                role="menu"
                aria-hidden={!smartstoreOpen}
                className={`absolute left-0 top-full mt-1.5 w-[230px] overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.10)] origin-top-left transition duration-150 ease-out ${
                  smartstoreOpen
                    ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                    : "pointer-events-none opacity-0 -translate-y-1 scale-[0.98]"
                }`}
              >
                <div className="absolute -top-6 left-0 h-6 w-full" />
                <div className="py-1">
                  {SMARTSTORE_MENU.map((item) => (
                    <Link
                      key={smartstoreMenuKey(item)}
                      href={item.href}
                      className={`flex items-center justify-between gap-2 px-4 py-2 text-[13px] hover:bg-[#f8fafc] ${
                        isSmartstoreSubActive(item)
                          ? SUBMENU_ACTIVE
                          : SUBMENU_INACTIVE
                      }`}
                      onClick={() => setSmartstoreOpen(false)}
                      role="menuitem"
                      aria-label={
                        "variant" in item && item.variant === "rankNaverPrice"
                          ? "Rank tracking, Naver price compare"
                          : undefined
                      }
                    >
                      <SmartstoreMenuLabel item={item} />
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
                      className={`block px-4 py-2 text-[13px] hover:bg-[#f8fafc] ${
                        submenuKeyActive(item.key)
                          ? SUBMENU_ACTIVE
                          : SUBMENU_INACTIVE
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
                      : getClassName()
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
                  {NAVER_MAP_MENU.map((item) => {
                    const subActive = isSubmenuKeyActive(
                      item.key,
                      pathname,
                      active
                    );
                    return (
                      <Link
                        key={`${item.key}-${item.href}`}
                        href={item.href}
                        className={`block px-4 py-2 text-[13px] hover:bg-[#f8fafc] ${
                          subActive ? SUBMENU_ACTIVE : SUBMENU_INACTIVE
                        }`}
                        onClick={() => setNaverMapOpen(false)}
                        role="menuitem"
                      >
                        {item.label}
                      </Link>
                    );
                  })}
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
                      className={`flex items-center justify-between gap-2 px-4 py-2 text-[13px] hover:bg-[#f8fafc] ${
                        submenuKeyActive(item.key)
                          ? SUBMENU_ACTIVE
                          : SUBMENU_INACTIVE
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
              className={
                isSmartstoreSectionActive
                  ? "flex w-full items-center justify-between rounded-[12px] bg-[#fff1f2] px-4 py-3 text-left text-[15px] font-extrabold text-[#e11d2e]"
                  : "flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-left text-[15px] font-extrabold text-[#111827] hover:bg-[#f7f7fb]"
              }
              aria-expanded={smartstoreOpen}
            >
              <span>스마트스토어</span>
              <span className="text-[14px]">{smartstoreOpen ? "▴" : "▾"}</span>
            </button>

            {smartstoreOpen && (
              <div className="space-y-1 pl-2">
                {SMARTSTORE_MENU.map((item) => (
                  <Link
                    key={`${smartstoreMenuKey(item)}-mobile`}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setSmartstoreOpen(false);
                    }}
                    className={`flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-[15px] hover:bg-[#f7f7fb] ${
                      isSmartstoreSubActive(item)
                        ? "font-black text-[#e11d2e] bg-[#fff1f2]"
                        : "font-semibold text-[#111827]"
                    }`}
                    aria-label={
                      "variant" in item && item.variant === "rankNaverPrice"
                        ? "Rank tracking, Naver price compare"
                        : undefined
                    }
                  >
                    <SmartstoreMenuLabel item={item} />
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
                    className={getMobileSubmenuClassName(item.key)}
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
                {NAVER_MAP_MENU.map((item) => {
                  const subActive = isSubmenuKeyActive(
                    item.key,
                    pathname,
                    active
                  );
                  return (
                    <Link
                      key={`${item.key}-${item.href}-mobile`}
                      href={item.href}
                      onClick={() => {
                        setOpen(false);
                        setNaverMapOpen(false);
                      }}
                      className={getMobileSubmenuClassName(item.key)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
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
                    className={getMobileSubmenuClassName(item.key, "row")}
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