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

  const [isBottomCtaHovered, setIsBottomCtaHovered] = useState(false);
  const [bottomCtaMousePos, setBottomCtaMousePos] = useState({ x: 0, y: 0 });

  const handleBottomCtaMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBottomCtaMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
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

      <section className="relative z-10 h-[100svh] min-h-[600px] w-full overflow-hidden md:h-screen md:min-h-[640px]">
        
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
                  지금 시작하기
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

      {/* ════════════════════════════════════
          2. 선언 섹션
      ════════════════════════════════════ */}
      <section className="relative z-10 bg-white px-6 py-28 md:py-40 lg:py-48">
        <div className="mx-auto max-w-5xl">
          <p className="mb-7 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-slate-400">
            PostLabs
          </p>
          <h2 className="font-black leading-[1.07] tracking-[-0.025em] text-slate-900
            text-[clamp(2.25rem,5.5vw,4rem)]
            md:text-[clamp(2.5rem,5vw,4.25rem)]
            lg:text-[4.25rem]">
            데이터는<br />
            매장의 흐름을<br className="hidden sm:block" />
            말해줍니다.
          </h2>
          <p className="mt-9 max-w-md text-[1rem] font-medium leading-[1.85] text-slate-500 md:mt-11 md:text-[1.0625rem]">
            감이 아닌 숫자로 판단하세요.<br />
            순위가 오르고 내린 이유가 데이터 안에 있습니다.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════
          3. 마무리 CTA — 포스터 느낌
      ════════════════════════════════════ */}
     <section className="relative z-10 overflow-hidden bg-white px-6 pt-56 pb-32 text-center md:pt-72 md:pb-44 lg:pt-96 lg:pb-56">
     <div
  className="pointer-events-none absolute inset-0 opacity-100"
  style={{
    backgroundImage: "url('/images/bg-culture.png')",
    backgroundSize: "cover",
    backgroundPosition: "center 80px",
    backgroundRepeat: "no-repeat",
  }}
/>

        <div className="relative mx-auto max-w-4xl">
          <h2 className="font-black leading-[1.0] tracking-[-0.03em] text-slate-900
            text-[clamp(2.5rem,7.5vw,6rem)]
            sm:text-[clamp(2.75rem,7vw,6.5rem)]
            lg:text-[6.5rem]">
            지금 바로<br />
            순위를 확인해보세요.
          </h2>

          <div className="mt-14 flex justify-center md:mt-16">
            <Link
              href="/place"
              onMouseEnter={() => setIsBottomCtaHovered(true)}
              onMouseLeave={() => setIsBottomCtaHovered(false)}
              onMouseMove={handleBottomCtaMouseMove}
              className={`
                relative isolate z-20 inline-flex items-center rounded-full px-5 py-3 text-sm font-bold tracking-wide
                bg-transparent border-2 transition-colors duration-0 ease-in-out overflow-hidden
                md:px-8 md:py-4 md:text-base
                ${isBottomCtaHovered ? "text-white border-[#0029FF]" : "text-black border-black"}
              `}
            >
              <span className="relative z-30" style={{ color: isBottomCtaHovered ? "#FFFFFF" : "#000000" }}>
                순위 확인하기
              </span>
              <div
                className="pointer-events-none absolute inset-0 w-full h-full z-0"
                style={{
                  transformOrigin: "left",
                  transform: isBottomCtaHovered ? "scaleX(1)" : "scaleX(0)",
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
                  ${isBottomCtaHovered ? "opacity-100" : "opacity-0"}
                `}
                style={{
                  left: `${bottomCtaMousePos.x}px`,
                  top: `${bottomCtaMousePos.y}px`,
                  pointerEvents: "none",
                  zIndex: 25,
                  backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.45) 38%, rgba(255,255,255,0) 72%)",
                  mixBlendMode: "soft-light",
                  filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                }}
              />
            </Link>
          </div>
        </div>
      </section>

      <section className="sr-only" aria-label="포스트랩스 서비스 설명과 자주 묻는 질문">
        <h2>포스트랩스 네이버 마케팅 분석 도구</h2>
        <p>
          포스트랩스는 네이버 플레이스 순위조회, 스마트스토어 순위확인,
          네이버 블로그 키워드 분석, 카카오맵 순위조회, 리뷰 저장수 추적을
          한 곳에서 관리할 수 있도록 만든 노출 관리 서비스입니다.
        </p>
        <p>
          로그인한 사용자는 매장과 상품을 등록해 지역 키워드의 검색 순위,
          방문자 리뷰 변화, 저장수 추이, 블로그 키워드 데이터를 확인할 수
          있습니다.
        </p>

        <h2>자주 묻는 질문</h2>

        <h3>네이버 플레이스 순위조회는 어떻게 하나요?</h3>
        <p>
          포스트랩스에서는 네이버 플레이스 키워드 순위를 실시간으로 조회하고
          저장할 수 있습니다.
        </p>

        <h3>스마트스토어 순위확인이 가능한가요?</h3>
        <p>
          상품 URL 등록 후 네이버 쇼핑 검색 순위를 추적할 수 있습니다.
        </p>

        <h3>카카오맵 순위조회 기능이 있나요?</h3>
        <p>
          카카오맵 검색, 저장, 공유, 길찾기 순위를 확인할 수 있습니다.
        </p>

        <h3>네이버 블로그 키워드 분석이 가능한가요?</h3>
        <p>
          블로그 포스트별 키워드와 검색량 데이터를 분석할 수 있습니다.
        </p>

        <h3>리뷰 저장수 추적은 어떻게 동작하나요?</h3>
        <p>
          네이버 플레이스 리뷰 수와 저장 수 변화를 자동으로 추적합니다.
        </p>

        <h2>내부 서비스 설명</h2>
        <ul>
          <li>네이버 플레이스 키워드 분석</li>
          <li>네이버 플레이스 순위조회</li>
          <li>네이버 플레이스 리뷰 저장수 추적</li>
          <li>스마트스토어 순위확인</li>
          <li>네이버 블로그 키워드 분석</li>
          <li>카카오맵 순위조회</li>
          <li>네이버 마케팅 커뮤니티</li>
        </ul>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "네이버 플레이스 순위조회는 어떻게 하나요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "포스트랩스에서는 네이버 플레이스 키워드 순위를 실시간으로 조회하고 저장할 수 있습니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "스마트스토어 순위확인이 가능한가요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "상품 URL 등록 후 네이버 쇼핑 검색 순위를 추적할 수 있습니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "카카오맵 순위조회 기능이 있나요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "카카오맵 검색, 저장, 공유, 길찾기 순위를 확인할 수 있습니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "네이버 블로그 키워드 분석이 가능한가요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "블로그 포스트별 키워드와 검색량 데이터를 분석할 수 있습니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "리뷰 저장수 추적은 어떻게 동작하나요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "네이버 플레이스 리뷰 수와 저장 수 변화를 자동으로 추적합니다.",
                  },
                },
              ],
            }),
          }}
        />
      </section>

</main>

);
}