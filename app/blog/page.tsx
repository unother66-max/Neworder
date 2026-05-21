import Link from "next/link";
import TopNav from "@/components/top-nav";

export const metadata = {
  title: "네이버 블로그 분석 | 포스트랩스",
  description:
    "네이버 상위 블로그를 확인하고 키워드 검색량, 노출 현황, 체험단 후보를 한 화면에서 검토하는 포스트랩스 블로그 분석 미리보기입니다.",
};

const samplePosts = [
  {
    rank: 1,
    title: "성수 카페 체험단 후기 작성 예시",
    keyword: "성수 카페",
    volume: "42,100",
    source: "상위 블로그",
  },
  {
    rank: 2,
    title: "강남 피부관리 방문 후기",
    keyword: "강남 피부관리",
    volume: "9,600",
    source: "상위 블로그",
  },
  {
    rank: 3,
    title: "홍대 브런치 맛집 리뷰",
    keyword: "홍대 브런치",
    volume: "18,400",
    source: "상위 블로그",
  },
];

export default function BlogPage() {
  return (
    <>
      <TopNav active="top-blog" />
      <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111827] md:pt-24">
        <section className="mx-auto max-w-[1240px] px-3 py-3 md:px-6 md:py-5 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-8 md:py-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-black text-[#2563eb]">
                  BLOG
                </span>
                <h1 className="mt-3 text-[24px] font-black tracking-[-0.03em] text-[#111827] md:text-[34px]">
                  네이버 블로그 분석
                </h1>
                <p className="mt-2 max-w-[720px] text-[13px] leading-6 text-[#6b7280] md:text-[15px]">
                  상위 노출 블로그와 키워드 검색량을 확인해 체험단 후보와 콘텐츠 방향을 빠르게 검토할 수 있습니다.
                </p>
              </div>
              <Link
                href="/top-blog"
                className="relative isolate inline-flex h-[46px] items-center justify-center overflow-hidden rounded-[14px] bg-[#111827] px-5 text-[14px] font-black text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] transition hover:bg-[#2563eb] hover:shadow-[0_18px_40px_rgba(37,99,235,0.24)] active:translate-y-px"
              >
                상위 블로그 찾기
              </Link>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#f3f4f6] px-5 py-4 md:px-6">
              <h2 className="text-[16px] font-black tracking-[-0.02em] text-[#111827]">
                블로그 분석 미리보기
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[#6b7280]">
                샘플 데이터로 화면 구성을 확인할 수 있습니다. 실제 검색과 분석은 로그인 후 이용해 주세요.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left">
                <thead className="bg-[#f9fafb] text-[12px] font-black text-[#6b7280]">
                  <tr>
                    <th className="px-5 py-3">순위</th>
                    <th className="px-5 py-3">포스트</th>
                    <th className="px-5 py-3">키워드</th>
                    <th className="px-5 py-3">월 검색량</th>
                    <th className="px-5 py-3">데이터</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f6] text-[13px]">
                  {samplePosts.map((post) => (
                    <tr key={post.rank} className="hover:bg-[#f9fafb]">
                      <td className="px-5 py-4 font-black text-[#111827]">{post.rank}</td>
                      <td className="px-5 py-4 font-bold text-[#111827]">{post.title}</td>
                      <td className="px-5 py-4 text-[#4b5563]">{post.keyword}</td>
                      <td className="px-5 py-4 font-semibold text-[#111827]">{post.volume}</td>
                      <td className="px-5 py-4 text-[#6b7280]">{post.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
