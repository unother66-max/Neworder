"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Noto_Sans_KR } from "next/font/google";
import { useSession, signOut } from "next-auth/react";
import {
  fetchUserQuotaCached,
  getUserQuotaSessionKey,
} from "@/lib/browser-user-quota-fetch"; 
import { ChevronDown, ChevronRight, LogOut, Menu, MessageCircle, Shield, User, X } from "lucide-react";

type TopNavProps = {
  active?: unknown;
  activeSmartstoreSub?: unknown;
  showBreadcrumb?: boolean;
};

type MobileMenuSectionKey = "smartstore" | "blog" | "place" | "kakao";

/** PC 메가메뉴 드롭다운·모바일 서브메뉴 공통 duration / easing */
const NAV_DROPDOWN_MS = 300;
const NAV_DROPDOWN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const getActiveMobileSectionKey = (path: string): MobileMenuSectionKey | null => {
  if (path.startsWith("/smartstore")) return "smartstore";
  if (path.startsWith("/top-blog") || path.startsWith("/blog-analysis")) return "blog";
  if (
    path.startsWith("/place") ||
    path.startsWith("/place-analysis") ||
    path.startsWith("/place-review")
  ) {
    return "place";
  }
  if (
    path.startsWith("/kakao-place") ||
    path.startsWith("/kakao-analysis") ||
    path.startsWith("/kakao-ranking")
  ) {
    return "kakao";
  }
  return null;
};

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["700", "900"],
});

const MobileServiceIcon = ({
  src,
  label,
  active,
}: {
  src: string;
  label: string;
  active: boolean;
}) => (
  <span
    className={`flex h-8 w-8 shrink-0 items-center justify-center ${
      active ? "opacity-100" : "opacity-80"
    }`}
  >
    <Image
      src={src}
      alt={label}
      width={32}
      height={32}
      className="h-8 w-8 object-contain"
    />
  </span>
);

const TopNav = (_props: TopNavProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession(); 
  
  const [isScrolled, setIsScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<
    "smartstore" | "blog" | "place" | "kakao" | null
  >(null);
  const closeTimerRef = useRef<number | null>(null);

  const [quota, setQuota] = useState<{
    totalItems: number;
    maxLimit: number;
    tier: string;
    isAdmin?: boolean;
  } | null>(null);

  // 🚨 [추가] 로그인 버튼 호버 및 마우스 위치 추적 상태
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [loginMousePos, setLoginMousePos] = useState({ x: 0, y: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerAnimatingOpen, setDrawerAnimatingOpen] = useState(false);
  const [mobileExpandedSection, setMobileExpandedSection] =
    useState<MobileMenuSectionKey | null>(() => getActiveMobileSectionKey(pathname));
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuFrameRef = useRef<number | null>(null);
  const mobileMenuCloseTimerRef = useRef<number | null>(null);

  const handleLoginMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setLoginMousePos({ x, y });
  };

  const sessionKey = session ? getUserQuotaSessionKey(session) : null;

  useEffect(() => {
    if (!sessionKey) {
      const clearQuotaTimer = window.setTimeout(() => setQuota(null), 0);
      return () => window.clearTimeout(clearQuotaTimer);
    }

    let cancelled = false;
    (async () => {
      const data = await fetchUserQuotaCached(sessionKey);
      if (cancelled || !data) return;
      setQuota({
        totalItems: data.totalItems,
        maxLimit: data.maxLimit,
        tier: data.tier,
        isAdmin: data.isAdmin,
      });
    })().catch(() => {
      console.error("사용량 조회 실패");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (accountMenuRef.current?.contains(e.target as Node)) return;
      setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    return () => {
      if (mobileMenuFrameRef.current) {
        window.cancelAnimationFrame(mobileMenuFrameRef.current);
      }
      if (mobileMenuCloseTimerRef.current) {
        window.clearTimeout(mobileMenuCloseTimerRef.current);
      }
    };
  }, []);

  const openMobileMenu = () => {
    if (mobileMenuCloseTimerRef.current) {
      window.clearTimeout(mobileMenuCloseTimerRef.current);
      mobileMenuCloseTimerRef.current = null;
    }
    if (mobileMenuFrameRef.current) {
      window.cancelAnimationFrame(mobileMenuFrameRef.current);
      mobileMenuFrameRef.current = null;
    }

    setDrawerAnimatingOpen(false);
    setMobileExpandedSection(getActiveMobileSectionKey(pathname));
    setMobileMenuOpen(true);

    mobileMenuFrameRef.current = window.requestAnimationFrame(() => {
      setDrawerAnimatingOpen(true);
      mobileMenuFrameRef.current = null;
    });
  };

  const closeMobileMenu = () => {
    if (mobileMenuFrameRef.current) {
      window.cancelAnimationFrame(mobileMenuFrameRef.current);
      mobileMenuFrameRef.current = null;
    }
    if (mobileMenuCloseTimerRef.current) {
      window.clearTimeout(mobileMenuCloseTimerRef.current);
    }

    setDrawerAnimatingOpen(false);
    mobileMenuCloseTimerRef.current = window.setTimeout(() => {
      setMobileMenuOpen(false);
      mobileMenuCloseTimerRef.current = null;
    }, NAV_DROPDOWN_MS);
  };

  const handleLogout = async () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      await signOut({ callbackUrl: "/login" });
    }
  };

  const isWhiteBg = pathname !== "/" || isScrolled;
  
  const isSmartStoreActive = pathname.startsWith("/smartstore");
  const isBlogActive = pathname.startsWith("/top-blog") || pathname.startsWith("/blog-analysis");
  const isPlaceActive = pathname.startsWith("/place");
  const isKakaoActive =
    pathname.startsWith("/kakao-place") ||
    pathname.startsWith("/kakao-analysis") ||
    pathname.startsWith("/kakao-ranking");
  
  const isCommunityActive = pathname.startsWith("/community");
  const isProfileActive = pathname.startsWith("/profile");
  const sessionIsEnvAdmin = session?.user?.isAdmin === true;
  const isAdminUsersPageActive = pathname.startsWith("/admin");

  const isPlaceRankActive = pathname === "/place" || pathname.startsWith("/place/");
  const isPlaceAnalysisActive = pathname.startsWith("/place-analysis");
  const isPlaceReviewActive = pathname.startsWith("/place-review");

  const isSmartstorePriceActive = pathname === "/smartstore";
  const isSmartstoreReviewActive = pathname.startsWith("/smartstore/review-track");
  const isSmartstorePlusActive = pathname.startsWith("/smartstore/plus-store-ranking-track");
  const isSmartstoreProductRankingAnalyzeActive = pathname.startsWith(
    "/smartstore/product-ranking-analyze"
  );
  const isSmartstoreStoreAnalyzeActive = pathname.startsWith("/smartstore/store-analyze");
  const isSmartstoreKeywordAnalyzeActive = pathname.startsWith("/smartstore/keyword-analyze");
  const isAdminUser = Boolean(quota?.isAdmin);
  const isDeveloperBuild = process.env.NODE_ENV !== "production";
  const canAccessPlusStore =
    status === "authenticated" && (isAdminUser || isDeveloperBuild);
  const canAccessBlogAnalysis = sessionIsEnvAdmin || isAdminUser;
  const canAccessSmartstoreAdminOnly = sessionIsEnvAdmin || isAdminUser;

  const isBlogTopActive = pathname.startsWith("/top-blog");
  const isBlogAnalysisActive = pathname.startsWith("/blog-analysis"); 
  
  const isKakaoPlaceActive = pathname.startsWith("/kakao-place");
  const isKakaoAnalysisActive = pathname.startsWith("/kakao-analysis");
  const isKakaoRankingActive = pathname.startsWith("/kakao-ranking");

  const dropdownBase = "absolute top-full left-0 mt-4 w-64 z-50";
  /** 닫힐 때 visibility를 opacity/transform 이후로 미뤄 exit 애니메이션이 끊기지 않게 함 */
  const dropdownStyle = (open: boolean): React.CSSProperties => {
    const visDelay = open ? 0 : NAV_DROPDOWN_MS;
    return {
      opacity: open ? 1 : 0,
      visibility: open ? "visible" : "hidden",
      transform: open ? "translateY(0) scale(1)" : "translateY(-12px) scale(0.96)",
      transition: [
        `opacity ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
        `transform ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
        // duration 0 + delay: 닫힘 시 hidden은 애니메이션 끝난 뒤 적용
        `visibility 0ms linear ${visDelay}ms`,
      ].join(", "),
      pointerEvents: open ? "auto" : "none",
      willChange: "opacity, transform",
    };
  };

  const cancelScheduledClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openMenu = (key: "smartstore" | "blog" | "place" | "kakao") => {
    cancelScheduledClose();
    setOpenDropdown(key);
  };

  const scheduleClose = (key: "smartstore" | "blog" | "place" | "kakao") => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpenDropdown((cur) => (cur === key ? null : cur));
    }, 140);
  };

  const mobileDrawerTransform = drawerAnimatingOpen
    ? "translate3d(0, 0, 0)"
    : "translate3d(100%, 0, 0)";
  const mobileDrawerClassName =
    "fixed right-0 top-0 z-[10000] flex h-dvh w-[78%] max-w-[340px] flex-col shadow-2xl backdrop-blur-xl";
  const mobileDrawerStyle: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.78)",
    transform: mobileDrawerTransform,
    transition: `transform ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
    willChange: "transform",
  };

  const mobileMenuSections = [
    {
      key: "smartstore" as const,
      label: "스마트스토어",
      iconSrc: "/icons/smartstore-icon.png",
      active: isSmartStoreActive,
      links: [
        { href: "/smartstore", label: "순위 추적", active: isSmartstorePriceActive },
        ...(canAccessPlusStore
          ? [{ href: "/smartstore/plus-store-ranking-track", label: "플러스스토어 순위 추적", active: isSmartstorePlusActive }]
          : []),
        {
          href: "/smartstore/product-ranking-analyze",
          label: "상품 순위 분석",
          active: isSmartstoreProductRankingAnalyzeActive,
        },
        ...(canAccessSmartstoreAdminOnly
          ? [
              {
                href: "/smartstore/store-analyze",
                label: "스마트스토어 분석",
                active: isSmartstoreStoreAnalyzeActive,
              },
            ]
          : []),
        {
          href: "/smartstore/keyword-analyze",
          label: "상품 키워드 분석",
          active: isSmartstoreKeywordAnalyzeActive,
        },
        ...(canAccessSmartstoreAdminOnly
          ? [{ href: "/smartstore/review-track", label: "리뷰 분석", active: isSmartstoreReviewActive }]
          : []),
      ],
    },
    {
      key: "blog" as const,
      label: "네이버 블로그",
      iconSrc: "/icons/blog-icon.png",
      active: isBlogActive,
      links: [
        { href: "/top-blog", label: "상위 블로그 찾기", active: isBlogTopActive },
        ...(canAccessBlogAnalysis
          ? [{ href: "/blog-analysis", label: "블로그 분석", active: isBlogAnalysisActive }]
          : []),
      ],
    },
    {
      key: "place" as const,
      label: "네이버 지도",
      iconSrc: "/icons/map-icon.png",
      active: isPlaceActive || isPlaceAnalysisActive || isPlaceReviewActive,
      links: [
        { href: "/place", label: "순위 추적", active: isPlaceRankActive },
        { href: "/place-review", label: "리뷰 분석", active: isPlaceReviewActive },
        { href: "/place-analysis", label: "키워드 분석", active: isPlaceAnalysisActive },
      ],
    },
    {
      key: "kakao" as const,
      label: "카카오맵",
      iconSrc: "/icons/kakaomap-icon.png",
      active: isKakaoActive,
      links: [
        { href: "/kakao-place", label: "키워드 순위 추적", active: isKakaoPlaceActive },
        { href: "/kakao-ranking", label: "지역 순위 추적", active: isKakaoRankingActive },
        { href: "/kakao-analysis", label: "키워드 분석", active: isKakaoAnalysisActive },
      ],
    },
  ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex h-11 items-center transition-all duration-300 ease-in-out sm:h-16 ${
          isWhiteBg
            ? "bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100"
            : "bg-transparent border-b border-transparent shadow-none"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png?v=20260429-2"
              alt="PostLabs"
              className="h-10 w-auto sm:h-13"
            />
            <span className="sr-only">PostLabs</span>
            </Link>
          </div>

        <div className="hidden md:flex items-center gap-10 text-base lg:text-lg text-slate-600">
          
          {/* ========================================================= */}
          {/* 스마트스토어 */}
          {/* ========================================================= */}
          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => openMenu("smartstore")}
            onMouseLeave={() => scheduleClose("smartstore")}
          >
            <Link
              href="/smartstore"
              aria-current={isSmartStoreActive ? "page" : undefined}
              className={`${notoSansKr.className} flex items-center py-2 text-base lg:text-lg tracking-tighter leading-none transition-colors ${
                isSmartStoreActive
                  ? "!text-black font-black"
                  : "text-slate-500 font-extrabold hover:!text-black hover:font-black hover:[text-shadow:0_6px_18px_rgba(0,41,255,0.22)]"
              }`}
            >
              스마트스토어
            </Link>

            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[#86A9C6] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isSmartStoreActive ? "scale-x-100" : "scale-x-0"
              }`}
            />

            <div
              className={dropdownBase}
              style={dropdownStyle(openDropdown === "smartstore")}
              onMouseEnter={() => openMenu("smartstore")}
              onMouseLeave={() => scheduleClose("smartstore")}
            >
              <div className="rounded-[32px] border border-white/70 bg-white/90 backdrop-blur-2xl p-3 shadow-[0_30px_70px_-18px_rgba(0,0,0,0.22)]">
                <div className="flex flex-col gap-1">
                  <Link
                    href="/smartstore"
                    aria-current={isSmartstorePriceActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isSmartstorePriceActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`text-sm font-bold ${
                          isSmartstorePriceActive
                            ? "text-[#0051FF]"
                            : "text-slate-800 group-hover/item:text-[#0051FF]"
                        }`}
                      >
                        순위 추적
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 shadow-sm ring-1 ring-black/5">
                        <span className="text-[11px] font-black leading-none text-[#03c75a]">
                          N
                        </span>
                        <img
                          src="/naver_price.svg"
                          alt="가격비교"
                          width={64}
                          height={14}
                          className="h-3.5 w-auto"
                        />
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                     실시간 키워드 순위 확인
                    </span>
                  </Link>
                  {canAccessPlusStore ? (
                    <Link
                      href="/smartstore/plus-store-ranking-track"
                      aria-current={isSmartstorePlusActive ? "page" : undefined}
                      className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                        isSmartstorePlusActive ? "bg-blue-50/40 pl-6" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`text-sm font-bold ${
                            isSmartstorePlusActive
                              ? "text-[#0051FF]"
                              : "text-slate-800 group-hover/item:text-[#0051FF]"
                          }`}
                        >
                          순위 추적
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 shadow-sm ring-1 ring-black/5">
                          <span className="text-[11px] font-black leading-none text-[#03c75a]">
                            N
                          </span>
                          <img
                            src="/naver_plus.svg"
                            alt="플러스스토어"
                            width={64}
                            height={14}
                            className="h-3.5 w-auto"
                          />
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        실시간 키워드 순위 확인
                      </span>
                    </Link>
                  ) : null}
                  <Link
                    href="/smartstore/product-ranking-analyze"
                    aria-current={isSmartstoreProductRankingAnalyzeActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isSmartstoreProductRankingAnalyzeActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isSmartstoreProductRankingAnalyzeActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      상품 순위 분석
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      키워드별 쇼핑 1~40위 조회
                    </span>
                  </Link>
                  {canAccessSmartstoreAdminOnly ? (
                    <Link
                      href="/smartstore/store-analyze"
                      aria-current={isSmartstoreStoreAnalyzeActive ? "page" : undefined}
                      className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                        isSmartstoreStoreAnalyzeActive ? "bg-blue-50/40 pl-6" : ""
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          isSmartstoreStoreAnalyzeActive
                            ? "text-[#0051FF]"
                            : "text-slate-800 group-hover/item:text-[#0051FF]"
                        }`}
                      >
                        스마트스토어 분석
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        스토어 상품 목록 분석
                      </span>
                    </Link>
                  ) : null}
                  <Link
                    href="/smartstore/keyword-analyze"
                    aria-current={isSmartstoreKeywordAnalyzeActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isSmartstoreKeywordAnalyzeActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isSmartstoreKeywordAnalyzeActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      상품 키워드 분석
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      검색량/상품량 경쟁률 분석
                    </span>
                  </Link>
                  {canAccessSmartstoreAdminOnly ? (
                    <Link
                      href="/smartstore/review-track"
                      aria-current={isSmartstoreReviewActive ? "page" : undefined}
                      className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                        isSmartstoreReviewActive ? "bg-blue-50/40 pl-6" : ""
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          isSmartstoreReviewActive
                            ? "text-[#0051FF]"
                            : "text-slate-800 group-hover/item:text-[#0051FF]"
                        }`}
                      >
                        리뷰 분석
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        리뷰 변화/알림 관리
                      </span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 네이버 블로그 */}
          {/* ========================================================= */}
          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => openMenu("blog")}
            onMouseLeave={() => scheduleClose("blog")}
          >
            <Link
              href="/top-blog"
              aria-current={isBlogActive ? "page" : undefined}
              className={`${notoSansKr.className} flex items-center py-2 text-base lg:text-lg tracking-tighter leading-none transition-colors ${
                isBlogActive
                  ? "!text-black font-black"
                  : "text-slate-500 font-extrabold hover:!text-black hover:font-black hover:[text-shadow:0_6px_18px_rgba(0,41,255,0.22)]"
              }`}
            >
              네이버 블로그
            </Link>

            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[#86A9C6] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isBlogActive ? "scale-x-100" : "scale-x-0"
              }`}
            />

            <div
              className={dropdownBase}
              style={dropdownStyle(openDropdown === "blog")}
              onMouseEnter={() => openMenu("blog")}
              onMouseLeave={() => scheduleClose("blog")}
            >
              <div className="rounded-[32px] border border-white/70 bg-white/90 backdrop-blur-2xl p-3 shadow-[0_30px_70px_-18px_rgba(0,0,0,0.22)]">
                <div className="flex flex-col gap-1">
                  <Link
                    href="/top-blog"
                    aria-current={isBlogTopActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isBlogTopActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isBlogTopActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      상위 블로그 찾기
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      체험단 / 상위 블로그 확인
                    </span>
                  </Link>
                  {canAccessBlogAnalysis ? (
                    <Link
                      href="/blog-analysis"
                      aria-current={isBlogAnalysisActive ? "page" : undefined}
                      className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                        isBlogAnalysisActive ? "bg-blue-50/40 pl-6" : ""
                      }`}
                    >
                      <span
                        className={`text-sm font-bold ${
                          isBlogAnalysisActive
                            ? "text-[#0051FF]"
                            : "text-slate-800 group-hover/item:text-[#0051FF]"
                        }`}
                      >
                        블로그 분석
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        내 블로그 지수 및 채널 정밀 분석
                      </span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 네이버 지도 */}
          {/* ========================================================= */}
          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => openMenu("place")}
            onMouseLeave={() => scheduleClose("place")}
          >
            <Link
              href="/place"
              aria-current={isPlaceActive ? "page" : undefined}
              className={`${notoSansKr.className} flex items-center py-2 text-base lg:text-lg tracking-tighter leading-none transition-colors ${
                isPlaceActive
                  ? "!text-black font-black"
                  : "text-slate-500 font-extrabold hover:!text-black hover:font-black hover:[text-shadow:0_6px_18px_rgba(0,41,255,0.22)]"
              }`}
            >
              네이버 지도
            </Link>

            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[#86A9C6] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isPlaceActive ? "scale-x-100" : "scale-x-0"
              }`}
            />

            <div
              className={dropdownBase}
              style={dropdownStyle(openDropdown === "place")}
              onMouseEnter={() => openMenu("place")}
              onMouseLeave={() => scheduleClose("place")}
            >
              <div className="rounded-[32px] border border-white/70 bg-white/90 backdrop-blur-2xl p-3 shadow-[0_30px_70px_-18px_rgba(0,0,0,0.22)]">
                <div className="flex flex-col gap-1">
                  <Link
                    href="/place"
                    aria-current={isPlaceRankActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isPlaceRankActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isPlaceRankActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      순위 추적
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      실시간 키워드 순위 확인
                    </span>
                  </Link>
                  <Link
                    href="/place-review"
                    aria-current={isPlaceReviewActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isPlaceReviewActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isPlaceReviewActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      리뷰 분석
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      리뷰 변화/알림 관리
                    </span>
                  </Link>
                  <Link
                    href="/place-analysis"
                    aria-current={isPlaceAnalysisActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isPlaceAnalysisActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isPlaceAnalysisActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      키워드 분석
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      황금 키워드 발굴 도구
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 카카오맵 */}
          {/* ========================================================= */}
          <div
            className="group relative flex h-full items-center"
            onMouseEnter={() => openMenu("kakao")}
            onMouseLeave={() => scheduleClose("kakao")}
          >
            <Link
              href="/kakao-place"
              aria-current={isKakaoActive ? "page" : undefined}
              className={`${notoSansKr.className} flex items-center py-2 text-base lg:text-lg tracking-tighter leading-none transition-colors ${
                isKakaoActive
                  ? "!text-black font-black"
                  : "text-slate-500 font-extrabold hover:!text-black hover:font-black hover:[text-shadow:0_6px_18px_rgba(0,41,255,0.22)]"
              }`}
            >
              카카오맵
            </Link>

            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[#86A9C6] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isKakaoActive ? "scale-x-100" : "scale-x-0"
              }`}
            />

            <div
              className={dropdownBase}
              style={dropdownStyle(openDropdown === "kakao")}
              onMouseEnter={() => openMenu("kakao")}
              onMouseLeave={() => scheduleClose("kakao")}
            >
              <div className="rounded-[32px] border border-white/70 bg-white/90 backdrop-blur-2xl p-3 shadow-[0_30px_70px_-18px_rgba(0,0,0,0.22)]">
                <div className="flex flex-col gap-1">
                  <Link
                    href="/kakao-place"
                    aria-current={isKakaoPlaceActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isKakaoPlaceActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isKakaoPlaceActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      키워드 순위 추적
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      실시간 키워드 순위 확인
                    </span>
                  </Link>
                  <Link
                    href="/kakao-ranking"
                    aria-current={isKakaoRankingActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isKakaoRankingActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isKakaoRankingActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      지역 순위 추적
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                    해당 지역별 순위 확인
                    </span>
                  </Link>
                  <Link
                    href="/kakao-analysis"
                    aria-current={isKakaoAnalysisActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isKakaoAnalysisActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isKakaoAnalysisActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      키워드 분석
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      황금 키워드 발굴 도구
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 커뮤니티 메뉴 */}
          {/* ========================================================= */}
          <div className="group relative flex h-full items-center">
            <Link
              href="/community"
              aria-current={isCommunityActive ? "page" : undefined}
              className={`${notoSansKr.className} flex items-center py-2 text-base lg:text-lg tracking-tighter leading-none transition-colors ${
                isCommunityActive
                  ? "!text-black font-black [text-shadow:0_6px_18px_rgba(0,41,255,0.22)]"
                  : "text-slate-500 font-extrabold hover:!text-black hover:font-black hover:[text-shadow:0_6px_18px_rgba(0,41,255,0.22)]"
              }`}
            >
              커뮤니티
            </Link>

            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[#86A9C6] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isCommunityActive ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </div>

        </div>

        {/* 🚨 우측 상단 (로그인 / 사용자 정보 분기) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {status === "loading" ? (
            <div className="h-8 w-8"></div>
          ) : session ? (
            // ✅ 로그인 된 상태
            <>
              {quota && (
                <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-[12px] font-bold shadow-sm ring-1 ring-slate-200 backdrop-blur-sm">
                  {quota.isAdmin ? (
                    <>
                      <span className="text-[#0051FF]">운영자</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-slate-800">무제한</span>
                    </>
                  ) : (
                    <>
                      <span className={quota.tier === "PRO" ? "text-[#0051FF]" : "text-emerald-500"}>
                        {quota.tier}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="flex items-center gap-0.5 text-slate-700">
                        <span className={quota.totalItems >= quota.maxLimit ? "text-red-500" : ""}>
                          {quota.totalItems}
                        </span>
                        <span className="text-slate-400 font-medium">/ {quota.maxLimit}</span>
                      </span>
                    </>
                  )}
                </div>
              )}

              <div ref={accountMenuRef} className="relative hidden md:block">
                <button
                  type="button"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:h-auto sm:w-auto sm:p-2 ${
                    accountMenuOpen || isProfileActive || isAdminUsersPageActive
                      ? "bg-slate-100 text-slate-900"
                      : ""
                  }`}
                  title="프로필 메뉴"
                >
                  <svg
                    className="h-4.5 w-4.5 sm:h-5 sm:w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </button>
                <div
                  role="menu"
                  aria-hidden={!accountMenuOpen}
                  className={`absolute right-0 top-full z-[130] mt-2 min-w-[12.5rem] rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-lg ring-1 ring-black/[0.04] transition-all duration-150 ${
                    accountMenuOpen
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-1 opacity-0"
                  }`}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      router.push("/profile");
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-slate-50 ${
                      isProfileActive ? "text-[#0051FF]" : "text-slate-700"
                    }`}
                  >
                    <User className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                    마이페이지
                  </button>
                  {sessionIsEnvAdmin && (
                    <Link
                      role="menuitem"
                      href="/admin/users"
                      aria-current={isAdminUsersPageActive ? "page" : undefined}
                      onClick={() => setAccountMenuOpen(false)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-slate-50 ${
                        isAdminUsersPageActive ? "text-[#0051FF]" : "text-slate-700"
                      }`}
                    >
                      <Shield className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                      관리자
                    </Link>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push("/profile")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:hidden sm:h-auto sm:w-auto sm:p-2"
                title="내 정보"
              >
                <svg className="h-4.5 w-4.5 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
              
              <button
                onClick={handleLogout}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-red-500 sm:h-auto sm:w-auto sm:p-2"
                title="로그아웃"
              >
                  <svg className="h-4.5 w-4.5 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </>
          ) : (
           // 🚨 [여기를 교체해주세요] 파란색 스와이프 로그인 버튼
           <button
           onClick={() => router.push("/login")}
           onMouseEnter={() => setIsLoginHovered(true)}
           onMouseLeave={() => setIsLoginHovered(false)}
           onMouseMove={handleLoginMouseMove}
           className={`
		             relative isolate z-20 inline-flex min-h-10 items-center rounded-full px-3 py-1.5 text-xs font-bold tracking-wide sm:min-h-0 sm:px-6 sm:py-2 sm:text-[13px]
             bg-transparent border-2 transition-colors duration-300 ease-in-out overflow-hidden
             ${isLoginHovered ? 'border-[#2563EB]' : 'border-black'}
           `}
         >
           {/* 글씨 (호버 시 흰색) */}
           <span className="relative z-30 transition-colors duration-300" style={{ color: isLoginHovered ? "#FFFFFF" : "#000000" }}>
             로그인
           </span>

           {/* 🌊 파란색 스와이프 배경 (#2563EB) */}
           <div
             className="pointer-events-none absolute inset-0 w-full h-full z-0"
             style={{
               transformOrigin: "left",
               transform: isLoginHovered ? "scaleX(1)" : "scaleX(0)",
               transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
               backgroundColor: "#2563EB",
             }}
           />

           {/* ✨ 무료로 시작하기 버튼과 100% 동일한 빛 효과 */}
           <div
             className={`
               absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
               transition-opacity duration-200 ease-out
               ${isLoginHovered ? "opacity-100" : "opacity-0"}
             `}
             style={{
               left: `${loginMousePos.x}px`,
               top: `${loginMousePos.y}px`,
               pointerEvents: "none",
               zIndex: 25,
               backgroundImage:
                 "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
               mixBlendMode: "soft-light",
               filter: "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.15))",
             }}
           />
         </button>
          )}
          <button
            type="button"
            data-testid="mobile-menu-open"
            aria-label="모바일 메뉴 열기"
            aria-expanded={mobileMenuOpen}
            onClick={openMobileMenu}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors md:hidden ${
              isWhiteBg
                ? "text-slate-800 hover:bg-slate-100"
                : "text-slate-900 hover:bg-white/40"
            }`}
          >
            <Menu className="h-6 w-6" strokeWidth={2.2} />
          </button>
        </div>
        </div>
      </nav>

      <div
        className="fixed inset-0 z-[9999] md:hidden"
        style={{ pointerEvents: mobileMenuOpen ? "auto" : "none" }}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={closeMobileMenu}
          className="absolute inset-0 bg-black/45"
          style={{
            opacity: mobileMenuOpen ? 0.72 : 0,
            transition: `opacity ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
          }}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-label="모바일 메뉴"
          data-testid="mobile-drawer"
          className={mobileDrawerClassName}
          style={mobileDrawerStyle}
        >
          <div className="flex h-[58px] items-center justify-between px-5 pt-1">
            <div className="text-[22px] font-black tracking-[-0.03em] text-slate-950">
              PostLabs
            </div>
            <button
              type="button"
              data-testid="mobile-menu-close"
              aria-label="메뉴 닫기"
              onClick={closeMobileMenu}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-800 transition-colors hover:bg-white"
            >
              <X className="h-6 w-6" strokeWidth={2.2} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-5 pb-4 pt-0">
            <div className="flex flex-col gap-0.5">
              {mobileMenuSections.map((section) => {
                const isOpen = mobileExpandedSection === section.key;

                return (
                <section key={section.key} className="pb-1">
                  <button
                    type="button"
                    onClick={() =>
                      setMobileExpandedSection((current) =>
                        current === section.key ? null : section.key
                      )
                    }
                    className={[
                      "flex w-full items-center gap-3 rounded-[14px] py-1.5 text-left transition-colors",
                      section.active ? "text-[#0F172A]" : "text-slate-600 hover:text-slate-900",
                    ].join(" ")}
                    aria-expanded={mobileExpandedSection === section.key}
                  >
                    <MobileServiceIcon
                      src={section.iconSrc}
                      label={section.label}
                      active={section.active}
                    />
                    <span
                      className={[
                        "min-w-0 flex-1 text-[15px] tracking-[-0.02em]",
                        section.active ? "font-bold text-[#0F172A]" : "font-semibold text-slate-600",
                      ].join(" ")}
                    >
                      {section.label}
                    </span>
                    <ChevronDown
                      className={[
                        "h-4 w-4 shrink-0 transition-transform duration-300",
                        section.active ? "text-[#0F172A]" : "text-slate-500",
                        isOpen ? "rotate-180" : "rotate-0",
                      ].join(" ")}
                      strokeWidth={2.5}
                    />
                  </button>

                  <div
                    data-testid={`mobile-submenu-${section.key}`}
                    style={{
                      maxHeight: isOpen ? 180 : 0,
                      opacity: isOpen ? 1 : 0,
                      transform: isOpen ? "translateY(0)" : "translateY(-8px)",
                      overflow: "hidden",
                      transition: [
                        `max-height ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
                        `opacity ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
                        `transform ${NAV_DROPDOWN_MS}ms ${NAV_DROPDOWN_EASE}`,
                      ].join(", "),
                    }}
                  >
                    <div className="ml-11 flex flex-col gap-1 pb-0.5 pt-1">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-current={link.active ? "page" : undefined}
                        onClick={closeMobileMenu}
                        className={`flex items-center gap-2 rounded-[10px] px-1.5 py-0.5 text-[14px] transition-colors ${
                          link.active
                            ? "font-semibold text-[#0051FF]"
                            : "text-slate-600 hover:bg-white/70 hover:text-slate-950"
                        }`}
                      >
                        <span
                          className={`text-[13px] leading-none ${
                            link.active ? "text-[#0051FF]" : "text-slate-400"
                          }`}
                        >
                          •
                        </span>
                        <span>{link.label}</span>
                      </Link>
                    ))}
                    </div>
                  </div>
                </section>
                );
              })}

              <Link
                href="/community"
                aria-current={isCommunityActive ? "page" : undefined}
                onClick={closeMobileMenu}
                className={`flex min-h-9 items-center gap-3 rounded-[14px] py-1.5 transition-colors ${
                  isCommunityActive
                    ? "text-[#0F172A]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                  <MessageCircle
                    className={`h-6 w-6 object-contain text-current ${
                      isCommunityActive ? "opacity-100" : "opacity-80"
                    }`}
                    strokeWidth={1.8}
                  />
                </span>
                <span
                  className={`min-w-0 flex-1 text-[15px] ${
                    isCommunityActive ? "font-bold text-[#0F172A]" : "font-semibold text-slate-600"
                  }`}
                >
                  커뮤니티
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-current" strokeWidth={2.4} />
              </Link>
            </div>

            <div className="my-2 pt-1">
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    router.push("/profile");
                  }}
                  className="flex min-h-9 items-center gap-3 rounded-[14px] py-1.5 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <User
                      className={`h-6 w-6 object-contain ${
                        isProfileActive ? "text-[#0F172A]" : "text-slate-600"
                      } ${isProfileActive ? "opacity-100" : "opacity-80"}`}
                      strokeWidth={1.8}
                    />
                  </span>
                  <span
                    className={`text-[15px] ${
                      isProfileActive ? "font-bold text-[#0F172A]" : "font-semibold text-slate-600"
                    }`}
                  >
                    마이페이지
                  </span>
                </button>

                {sessionIsEnvAdmin && (
                  <Link
                    href="/admin/users"
                    aria-current={isAdminUsersPageActive ? "page" : undefined}
                    onClick={closeMobileMenu}
                    className={`flex min-h-9 items-center gap-3 rounded-[14px] py-1.5 transition-colors ${
                      isAdminUsersPageActive ? "text-[#0F172A]" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <Shield
                        className={`h-6 w-6 object-contain ${isAdminUsersPageActive ? "opacity-100" : "opacity-80"}`}
                        strokeWidth={1.8}
                        aria-hidden
                      />
                    </span>
                    <span
                      className={`flex-1 text-[15px] ${
                        isAdminUsersPageActive ? "font-bold text-[#0F172A]" : "font-semibold text-slate-600"
                      }`}
                    >
                      관리자
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-current" strokeWidth={2.4} />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    closeMobileMenu();
                    handleLogout();
                  }}
                  className="flex min-h-9 items-center gap-3 rounded-[14px] py-1.5 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <LogOut
                      className="h-6 w-6 object-contain text-slate-600 opacity-80"
                      strokeWidth={1.8}
                    />
                  </span>
                  <span className="text-[15px] font-semibold text-slate-600">로그아웃</span>
                </button>
              </div>
            </div>
          </nav>
        </aside>
      </div>
    </>
  );
};

export default TopNav;
