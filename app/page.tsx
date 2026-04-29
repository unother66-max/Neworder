'use client';

import Image from "next/image";
import Link from "next/link";
import TopNav from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import MeshGradient from "@/components/MeshGradient";
import AutoSpinGlobe from "@/components/AutoSpinGlobe";

export default function HomePage() {
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

      <section className="relative z-10 w-full h-screen overflow-hidden">
        <div className="relative z-20 mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-70">
          <div className="flex flex-col max-w-[600px]">
           
            <h1 className="text-[4.5rem] sm:text-[5.5rem] lg:text-[6.5rem] font-black leading-[1] tracking-tighter text-slate-900">
              내 매장의<br />노출 관리,<br />더 쉽게.
            </h1>
            <p className="mt-8 text-[18px] leading-8 text-slate-700/80 font-medium">
              상위 블로그 찾기, 플레이스 순위 추적, 리뷰 추적,<br className="hidden sm:block" />
              순위 분석까지 한 곳에서 관리할 수 있습니다.
            </p>
            <div className="mt-12 flex flex-col gap-4 sm:flex-row items-start">
              <Link href="/place" className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-xl bg-slate-900 px-8 text-[16px] font-bold text-white shadow-xl transition-all hover:-translate-y-1")}>
                무료로 시작하기
              </Link>
              
            </div>
          </div>
        </div>

   
{/* ... 이전 코드 (텍스트 영역 등) ... */}

{/* 💡 지구본 영역: 구조 변경 */}
<div
  className="absolute z-10 pointer-events-none w-[994px] h-[994px] top-[30px]"
  style={{ left: "min(1000px, calc(100vw - 994px))" }}
>
  {/* 💡 아래 div에 필터를 넣어야 합니다! 
    AutoSpinGlobe를 감싸는 이 div에 필터 클래스를 몰아넣으세요.
  */}
  <div className="
    relative w-full h-full
    brightness-[0.9]   /* 약간 어둡게 */
    contrast-[1.0]     /* 명암 대비 강하게 */
    saturate-[0.5]     /* 색상 진하게 */
    hue-rotate-[0deg] /* 차가운 톤으로 */
  ">
    <AutoSpinGlobe />
  </div>
</div>

{/* ... 이후 코드 ... */}
        {/* 💡 하단 페이드 아웃: 배경과 다음 섹션을 부드럽게 연결 */}
        <div className="absolute bottom-0 left-0 w-full h-[500px] md:h-[600px] bg-gradient-to-t from-white via-white/90 via-40% to-transparent z-20 pointer-events-none" />
      </section>

      <section className="relative z-10 bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/70">
            <div className="bg-slate-50 p-4 sm:p-6">
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.16)]">
                <Image src="/main/hero-1.png" alt="PostLabs" width={1400} height={900} priority className="h-auto w-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}