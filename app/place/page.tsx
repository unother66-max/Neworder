"use client";

import Link from "next/link";
import { useState } from "react";

type Store = {
  name: string;
  category: string;
  address: string;
  keywords: {
    keyword: string;
    monthly: string;
    mobile: string;
    pc: string;
    rank: string;
  }[];
};

export default function PlacePage() {
  const [stores] = useState<Store[]>([
    {
      name: "키코필라테스 앤 발레",
      category: "필라테스",
      address: "서울특별시 용산구 만리재로 134 7층",
      keywords: [
        {
          keyword: "서울역 필라테스",
          monthly: "240",
          mobile: "150",
          pc: "90",
          rank: "39위",
        },
        {
          keyword: "숙대입구 필라테스",
          monthly: "30",
          mobile: "20",
          pc: "10",
          rank: "26위",
        },
        {
          keyword: "서울역 발레",
          monthly: "30",
          mobile: "30",
          pc: "0",
          rank: "12위",
        },
      ],
    },
    {
      name: "뉴오더클럽 한남",
      category: "피자",
      address: "이태원로54길 58-14 1F 뉴오더클럽 한남",
      keywords: [
        {
          keyword: "한남동 맛집",
          monthly: "33,650",
          mobile: "29,100",
          pc: "4,550",
          rank: "86위",
        },
        {
          keyword: "이태원 맛집",
          monthly: "43,630",
          mobile: "38,400",
          pc: "5,230",
          rank: "73위",
        },
        {
          keyword: "한남동 피자",
          monthly: "1,660",
          mobile: "1,380",
          pc: "280",
          rank: "4위",
        },
      ],
    },
  ]);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-black">
      <div className="flex min-h-screen">
        {/* 모바일 상단 헤더 */}
        <div className="fixed left-0 right-0 top-0 z-30 border-b border-gray-200 bg-white px-5 py-4 xl:hidden">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="logo"
              className="h-10 w-auto object-contain"
            />
          </Link>
        </div>

        {/* 좌측 사이드바 */}
        <aside className="hidden w-[260px] border-r border-gray-200 bg-white xl:block">
          <div className="border-b border-gray-100 px-7 py-7">
            <Link href="/" className="block">
              <img
                src="/logo.png"
                alt="logo"
                className="h-12 w-auto object-contain"
              />
            </Link>

            <p className="mt-4 text-sm leading-6 text-gray-500">
              네이버 블로그 상위노출 분석 도구
            </p>
          </div>

          <nav className="px-4 py-6 text-sm">
            <div className="mb-7">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Blog
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/"
                    className="block rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50"
                  >
                    상위 노출 블로그 찾기
                  </Link>
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  블로그 분석 기록
                </li>
                <li>
                  <Link
                    href="/place"
                    className="block rounded-2xl bg-green-50 px-4 py-3 font-semibold text-green-700"
                  >
                    플레이스 순위 추적
                  </Link>
                </li>
              </ul>
            </div>

            <div className="mb-7">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Menu
              </p>
              <ul className="space-y-1.5">
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  키워드 실험실
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  경쟁 블로그 참고
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  플레이스 확장 준비
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Info
              </p>
              <ul className="space-y-1.5">
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  서비스 소개
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  공지사항
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  업데이트 예정
                </li>
              </ul>
            </div>
          </nav>
        </aside>

        {/* 메인 */}
        <section className="flex-1">
          <div className="mx-auto max-w-7xl px-6 py-8 pt-24 xl:pt-8">
            {/* 상단 헤더 */}
            <div className="mb-8 rounded-[32px] bg-white p-8 shadow-[0_10px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-4xl font-black tracking-tight text-black">
                    매장 순위 추적
                  </h1>
                  <p className="mt-3 text-base leading-7 text-gray-600">
                    스마트플레이스 순위 추적은 네이버 지도에 등록된 가게의 노출
                    순위를 확인할 수 있습니다.
                  </p>
                </div>

                <button className="rounded-2xl bg-purple-600 px-6 py-4 font-semibold text-white shadow-md transition hover:scale-[1.02] hover:bg-purple-700">
                  매장 등록
                </button>
              </div>
            </div>

            {/* 검색 바 */}
            <div className="mb-8 rounded-[32px] bg-white p-8 shadow-[0_10px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight text-black">
                    등록된 매장
                  </h2>
                  <button className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
                    매장 관리
                  </button>
                </div>

                <div className="w-full md:w-[420px]">
                  <input
                    type="text"
                    placeholder="등록된 플레이스 검색"
                    className="w-full rounded-2xl border border-gray-300 bg-white px-5 py-4 text-black outline-none placeholder-gray-400 focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  />
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-500">
                기준 순위 조회중 · IP, 설정한 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
              </p>
            </div>

            {/* 매장 카드 목록 */}
            <div className="space-y-6">
              {stores.map((store, index) => (
                <div
                  key={index}
                  className="rounded-[32px] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100"
                >
                  <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="h-20 w-20 rounded-2xl bg-gray-100" />
                      <div>
                        <h3 className="text-2xl font-bold tracking-tight text-black">
                          {store.name}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                          {store.category} | {store.address}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                          <span>검색량 예시</span>
                          <span>모바일</span>
                          <span>PC</span>
                          <a href="#" className="font-medium text-black underline">
                            매장 바로가기
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
                        순위 변화 보기
                      </button>
                      <button className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
                        자동 추적 OFF
                      </button>
                      <button className="rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
                        키워드 관리
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-3xl border border-gray-200">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-700">
                            키워드
                          </th>
                          <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-700">
                            월 검색량
                          </th>
                          <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-700">
                            모바일
                          </th>
                          <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-700">
                            PC
                          </th>
                          <th className="border-b border-gray-200 px-5 py-4 text-left text-sm font-semibold text-gray-700">
                            검색 순위
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {store.keywords.map((item, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="border-b border-gray-200 px-5 py-4 text-sm font-medium text-black">
                              {item.keyword}
                            </td>
                            <td className="border-b border-gray-200 px-5 py-4 text-sm text-black">
                              {item.monthly}
                            </td>
                            <td className="border-b border-gray-200 px-5 py-4 text-sm text-gray-600">
                              {item.mobile}
                            </td>
                            <td className="border-b border-gray-200 px-5 py-4 text-sm text-gray-600">
                              {item.pc}
                            </td>
                            <td className="border-b border-gray-200 px-5 py-4 text-sm font-semibold text-black">
                              {item.rank}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 text-right text-sm text-gray-500">
                    최근 업데이트: 2026/03/26 09:01
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}