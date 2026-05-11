'use client';

import { useState } from "react";
import Link from "next/link";
import TopNav from "@/components/top-nav";
import MeshGradient from "@/components/MeshGradient";
import AutoSpinGlobe from "@/components/AutoSpinGlobe";

export default function HomePage() {
  const [isCtaHovered, setIsCtaHovered] = useState(false);
  const [ctaMousePos, setCtaMousePos] = useState({ x: 0, y: 0 });

  const handleCtaMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCtaMousePos({ x, y });
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-white text-slate-900 font-sans">
      {/* 배경 컨테이너 */}
      <div className="fixed inset-0 z-0 pointer-events-none mask-fade-bottom">
        <MeshGradient />
        <div className="noise-overlay"></div>
      </div>

      <div className="relative z-50">
        <TopNav showBreadcrumb={false} />
      </div>

      <section className="relative z-10 h-[100svh] min-h-[600px] w-full overflow-hidden md:h-screen">
        
        {/* 💡 1층 (z-10): 지구본 영역 (스크린샷 24번 기준 완벽 복구) */}
        {/* 기존의 absolute right 설정과 calc(100vw - 994px) 연산을 그대로 가져왔습니다. */}
        <div
          className="absolute left-[34%] top-[72px] z-10 h-[520px] w-[520px] pointer-events-none opacity-60 sm:h-[680px] sm:w-[680px] md:left-[38%] md:top-[30px] md:h-[820px] md:w-[820px] md:opacity-80 lg:h-[994px] lg:w-[994px] lg:opacity-100 lg:left-[min(1000px,calc(100vw-994px))]"
        >
          <div className="relative w-full h-full brightness-[0.9] contrast-[1.0] saturate-[0.5] hue-rotate-[0deg]">
            <AutoSpinGlobe />
          </div>
        </div>

        {/* 💡 2층 (z-20): 하단 페이드 아웃 (지구본을 살짝 덮어줌) */}
        <div className="absolute bottom-0 left-0 w-full h-[500px] md:h-[600px] bg-gradient-to-t from-white via-white/90 via-40% to-transparent z-20 pointer-events-none" />

        {/* 💡 3층 (z-30): 텍스트 영역 (가장 마지막에 렌더링되어 그라데이션 위에 선명하게 뜸) */}
        <div className="relative z-30 mx-auto h-full max-w-7xl px-4 pb-12 pt-28 pointer-events-none md:px-6 md:py-20 lg:px-8 lg:py-70">
          <div className="flex flex-col max-w-[600px] pointer-events-auto">
            <h1 className="text-[2.6rem] font-black leading-[1.05] tracking-tighter text-slate-900 sm:text-[3.5rem] md:text-[4.5rem] md:leading-[1] lg:text-[6.5rem]">
              내 매장의<br />노출 관리,<br />더 쉽게.
            </h1>
            <p className="mt-5 text-sm font-medium leading-6 text-slate-700/80 md:mt-8 md:text-[18px] md:leading-8">
              상위 블로그 찾기, 플레이스 순위 추적, 리뷰 추적,<br className="hidden sm:block" />
              순위 분석까지 한 곳에서 관리할 수 있습니다.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row md:mt-12 md:gap-4">
              <Link
                href="/place"
                onMouseEnter={() => setIsCtaHovered(true)}
                onMouseLeave={() => setIsCtaHovered(false)}
                onMouseMove={handleCtaMouseMove}
                className={`
                  relative isolate z-20 inline-flex items-center rounded-full px-5 py-3 text-sm font-bold tracking-wide md:px-8 md:py-4 md:text-lg
                  bg-transparent border-2 transition-colors duration-0 ease-in-out overflow-hidden
                  ${isCtaHovered ? 'text-white border-[#0029FF]' : 'text-black border-black'}
                `}
              >
                <span className="relative z-30" style={{ color: isCtaHovered ? "#FFFFFF" : "#000000" }}>
                  무료로 시작하기
                </span>

                <div
                  className="pointer-events-none absolute inset-0 w-full h-full z-0"
                  style={{
                    transformOrigin: "left",
                    transform: isCtaHovered ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                    backgroundColor: "#0029FF",
                    opacity: 1,
                    mixBlendMode: "normal",
                  }}
                />

                <div
                  className={`
                    absolute -translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-full blur-2xl md:h-40 md:w-40
                    transition-opacity duration-200 ease-out
                    ${isCtaHovered ? "opacity-100" : "opacity-0"}
                  `}
                  style={{
                    left: `${ctaMousePos.x}px`,
                    top: `${ctaMousePos.y}px`,
                    pointerEvents: "none",
                    zIndex: 25,
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.45) 38%, rgba(255,255,255,0) 72%)",
                    mixBlendMode: "soft-light",
                    filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                  }}
                />
              </Link>
            </div>
          </div>
        </div>

      </section>

    </main>
  );
}
