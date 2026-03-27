"use client";

import Link from "next/link";

type TopNavProps = {
  active?: "blog" | "place";
};

export default function TopNav({ active = "place" }: TopNavProps) {
  const getClassName = (key: "blog" | "place") =>
    active === key
      ? "text-[14px] font-extrabold text-[#7c3aed]"
      : "text-[14px] font-semibold text-[#111827]";

  return (
    <>
      <header className="border-b border-[#e8ebf2] bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="shrink-0">
              <img
                src="/logo.png"
                alt="logo"
                className="h-11 w-auto object-contain"
              />
            </Link>

            <nav className="hidden items-center gap-7 lg:flex">
              <Link href="/" className="text-[14px] font-semibold text-[#111827]">
                스마트스토어
              </Link>
              <Link href="/" className={getClassName("blog")}>
                상위블로그찾기
              </Link>
              <Link href="/place" className={getClassName("place")}>
                플레이스 순위 추적
              </Link>
              <Link href="/" className="text-[14px] font-semibold text-[#111827]">
                키워드 실험실
              </Link>
              <Link href="/" className="text-[14px] font-semibold text-[#111827]">
                경쟁 블로그 참고
              </Link>
              <Link href="/" className="text-[14px] font-semibold text-[#111827]">
                서비스 소개
              </Link>
              <Link href="/" className="text-[14px] font-semibold text-[#111827]">
                공지사항
              </Link>
            </nav>
          </div>

          <div className="hidden items-center gap-5 lg:flex">
            <div className="text-[13px] font-semibold text-[#4b5563]">
              전체 1 / 사용 1 / <span className="text-[#7c3aed]">잔여 0</span>
            </div>
            <div className="text-[22px]">👤</div>
          </div>
        </div>
      </header>

      <div className="border-b border-[#e8ebf2] bg-white/80">
        <div className="mx-auto max-w-[1280px] px-6 py-3 text-[13px] text-[#6b7280]">
          홈 &gt; 네이버지도 &gt;{" "}
          <span className="font-semibold text-[#111827]">
            {active === "place" ? "플레이스 순위 추적" : "상위블로그찾기"}
          </span>
        </div>
      </div>
    </>
  );
}