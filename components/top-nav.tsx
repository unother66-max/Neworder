"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<
    "smartstore" | "blog" | "place" | "kakao" | null
  >(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      router.push("/login");
    }
  };

  const isWhiteBg = pathname !== "/" || isScrolled;
  const isSmartStoreActive = pathname.startsWith("/smartstore");
  const isBlogActive = pathname.startsWith("/top-blog");
  const isPlaceActive = pathname.startsWith("/place");
  const isKakaoActive =
    pathname.startsWith("/kakao-place") ||
    pathname.startsWith("/kakao-analysis") ||
    pathname.startsWith("/kakao-ranking");

  const isPlaceRankActive = pathname === "/place" || pathname.startsWith("/place/");
  const isPlaceAnalysisActive = pathname.startsWith("/place-analysis");
  const isPlaceReviewActive = pathname.startsWith("/place-review");

  // 가격비교(루트)만 활성. 하위 페이지는 각각의 메뉴에서 활성 처리.
  const isSmartstorePriceActive = pathname === "/smartstore";
  const isSmartstoreReviewActive = pathname.startsWith("/smartstore/review-track");
  const isSmartstorePlusActive = pathname.startsWith(
    "/smartstore/plus-store-ranking-track"
  );

  const isBlogTopActive = pathname.startsWith("/top-blog");

  const isKakaoPlaceActive = pathname.startsWith("/kakao-place");
  const isKakaoAnalysisActive = pathname.startsWith("/kakao-analysis");
  const isKakaoRankingActive = pathname.startsWith("/kakao-ranking");

  const dropdownBase = "absolute top-full left-0 mt-4 w-64 z-50";
  const dropdownStyle = (open: boolean): React.CSSProperties => ({
    opacity: open ? 1 : 0,
    visibility: open ? "visible" : "hidden",
    transform: open ? "translateY(0) scale(1)" : "translateY(-12px) scale(0.96)",
    transition:
      "opacity 300ms cubic-bezier(0.16,1,0.3,1), transform 300ms cubic-bezier(0.16,1,0.3,1)",
    pointerEvents: open ? "auto" : "none",
    willChange: "opacity, transform",
  });

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

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex h-16 items-center transition-all duration-300 ease-in-out ${
        isWhiteBg
          ? "bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100"
          : "bg-transparent border-b border-transparent shadow-none"
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 lg:px-8">
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

        <div className="hidden sm:flex items-center gap-10 text-base lg:text-lg text-slate-600">
          {/* 스마트스토어 */}
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

            {/* 활성 인디케이터 */}
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
              <div className="rounded-[32px] border border-white/50 bg-white/70 backdrop-blur-2xl p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]">
                <div className="flex flex-col gap-1">
                  <Link
                    href="/smartstore"
                    aria-current={isSmartstorePriceActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isSmartstorePriceActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isSmartstorePriceActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      네이버 가격비교
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      실시간 키워드 순위 확인
                    </span>
                  </Link>
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
                      리뷰 트래킹
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      리뷰 변화/알림 관리
                    </span>
                  </Link>
                  <Link
                    href="/smartstore/plus-store-ranking-track"
                    aria-current={isSmartstorePlusActive ? "page" : undefined}
                    className={`group/item flex flex-col px-5 py-3 rounded-2xl transition-all duration-200 hover:bg-blue-50/40 hover:pl-6 ${
                      isSmartstorePlusActive ? "bg-blue-50/40 pl-6" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isSmartstorePlusActive
                          ? "text-[#0051FF]"
                          : "text-slate-800 group-hover/item:text-[#0051FF]"
                      }`}
                    >
                      플러스 스토어 순위
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      상위 노출 리스트 보기
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* 네이버 블로그 */}
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
              <div className="rounded-[32px] border border-white/50 bg-white/70 backdrop-blur-2xl p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]">
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
                      실시간 상위 블로그 확인
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* 네이버 지도 */}
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
              <div className="rounded-[32px] border border-white/50 bg-white/70 backdrop-blur-2xl p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]">
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
                      상위 노출 리스트
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      현재 상위 노출 중인 리스트 보기
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* 카카오맵 */}
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
              <div className="rounded-[32px] border border-white/50 bg-white/70 backdrop-blur-2xl p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]">
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
                      순위 추적
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      실시간 키워드 순위 확인
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
                      상위 노출 리스트
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      현재 상위 노출 중인 리스트 보기
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/place")}
            className="p-2 text-slate-600 hover:text-slate-900"
            title="내 정보"
          >
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
          <button
            onClick={handleLogout}
            className="p-2 text-slate-600 transition-colors hover:text-red-500"
            title="로그아웃"
          >
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
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;