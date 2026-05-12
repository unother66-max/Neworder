import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["700", "900"],
});

const legalPillClass =
  "inline-flex items-center justify-center rounded-full border border-white bg-black px-5 py-2.5 text-[14px] font-black tracking-[-0.02em] text-white outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:px-6 sm:py-3 sm:text-[15px] md:text-base";

export default function SiteFooter() {
  return (
    <footer
      className={`${notoSansKr.className} relative z-100 bg-black text-white`}
    >
     <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
        <div className="min-w-0 max-w-xl">
          <p className="text-[1.3125rem] font-black leading-[1.15] tracking-[-0.03em] text-white sm:text-2xl md:text-[1.625rem]">
            포스트랩스(PostLabs)
          </p>
          <div className="mt-4 space-y-1.5 text-[14px] font-bold leading-snug text-white sm:mt-5 sm:space-y-2 sm:text-[15px] md:text-[16px] md:leading-relaxed">
            <p>대표자: 이환희</p>
            <p>사업자등록번호: 228-05-70564</p>
            <p className="text-pretty">서울 용산구 한남동 683-55, 1F</p>
          </div>
        </div>

        <nav
          className="mt-8 flex flex-wrap items-center gap-3 sm:mt-9 sm:gap-3.5"
          aria-label="법적 고지"
        >
          <Link href="/terms" className={legalPillClass}>
            이용약관
          </Link>
          <Link href="/privacy" className={legalPillClass}>
            개인정보처리방침
          </Link>
        </nav>

        <p className="mt-9 text-[13px] font-bold tracking-[-0.02em] text-white sm:mt-10 sm:text-[14px] md:text-[15px]">
          © 2026 포스트랩스(PostLabs) All rights reserved
        </p>
      </div>
    </footer>
  );
}
