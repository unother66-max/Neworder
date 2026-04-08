import Image from "next/image";
import Link from "next/link";
import TopNav from "@/components/top-nav";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-[#111827]">
      <TopNav />

      <section className="bg-[linear-gradient(90deg,#f8f6f3_0%,#f9ecee_100%)]">
        <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-5 py-14 md:px-6 lg:grid-cols-2 lg:py-20">
          <div className="max-w-[560px]">
            <p className="text-[13px] font-extrabold tracking-[0.16em] text-[#e11d2e]">
              POSTLABS
            </p>

            <h1 className="mt-5 text-[42px] font-black leading-[1.15] tracking-[-0.05em] text-[#111827] sm:text-[56px] xl:text-[72px]">
              내 매장의 노출 관리,
              <br />
              더 쉽게 시작하세요
            </h1>

            <p className="mt-6 text-[17px] leading-8 text-[#6b7280] sm:text-[18px]">
              상위 블로그 찾기, 플레이스 순위 추적, 리뷰 추적,
              <br className="hidden sm:block" />
              순위 분석까지 한 곳에서 관리할 수 있습니다.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/place"
                className="inline-flex h-[54px] items-center justify-center rounded-[16px] border border-[#d7dbe3] bg-white px-6 text-[16px] font-bold text-[#111827] transition hover:bg-[#f8fafc]"
              >
                무료로 시작하기
              </Link>

           
            </div>
          </div>

          <div>
            <div className="overflow-hidden rounded-[32px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
              <div className="flex items-center justify-center bg-[#f8fafc] p-6">
                <Image
                  src="/main/hero-1.png"
                  alt="PostLabs 메인 화면"
                  width={1400}
                  height={900}
                  priority
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}