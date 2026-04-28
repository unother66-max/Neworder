'use client';

import Image from "next/image";
import Link from "next/link";
import TopNav from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-white text-slate-900 font-sans">
      <div className="fixed inset-0 z-[100] noise-bg pointer-events-none" />
      
     <style jsx global>{`
        @keyframes rainbowFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .rainbow-bg {
          background: linear-gradient(125deg, #c1e5d3, #8cb8d9, #eac9e3, #f3e4c4, #c1e5d3);
          background-size: 400% 400%;
          animation: rainbowFlow 15s ease infinite;
          will-change: background-position;
        }
        
      
      `}</style>

      <div className="absolute inset-0 z-0 rainbow-bg pointer-events-none" />

      <div className="relative z-50">
        <TopNav showBreadcrumb={false} />
      </div>

      <section className="relative z-10 mx-auto grid min-h-screen max-w-[1280px] items-center gap-12 px-5 py-20 md:px-6 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col max-w-[600px]">
          <p className="text-[14px] font-bold tracking-[0.2em] text-slate-800/60 mb-6">POSTLABS</p>
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
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 rounded-xl border-2 border-slate-900/10 bg-white/50 backdrop-blur-sm px-8 text-[16px] font-bold text-slate-800 hover:bg-white transition-all")}>
              데모 보기
            </Link>
          </div>
        </div>

        {/* 우측 목업 이미지 */}
        <div className="relative mt-10 lg:mt-0">
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