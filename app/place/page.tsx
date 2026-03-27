"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type KeywordItem = {
  keyword: string;
  monthly: string;
  mobile: string;
  pc: string;
  rank: string;
};

type Store = {
  name: string;
  category: string;
  address: string;
  placeLink?: string;
  keywords: KeywordItem[];
};

type SearchPlaceItem = {
  title: string;
  category: string;
  address: string;
  link: string;
};

export default function PlacePage() {
  const [stores, setStores] = useState<Store[]>([
    {
      name: "키코필라테스 앤 발레",
      category: "필라테스",
      address: "서울특별시 용산구 만리재로 134 7층",
      placeLink: "",
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
      placeLink: "",
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

  const [searchText, setSearchText] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<SearchPlaceItem[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");

  const filteredStores = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    if (!text) return stores;

    return stores.filter((store) => {
      return (
        store.name.toLowerCase().includes(text) ||
        store.category.toLowerCase().includes(text) ||
        store.address.toLowerCase().includes(text)
      );
    });
  }, [searchText, stores]);

  const openModal = () => {
    setIsModalOpen(true);
    setPlaceQuery("");
    setPlaceResults([]);
    setPlaceSearchError("");
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPlaceQuery("");
    setPlaceResults([]);
    setPlaceSearchError("");
  };

  const handlePlaceSearch = async () => {
    if (!placeQuery.trim()) {
      setPlaceSearchError("매장 이름을 입력해주세요.");
      setPlaceResults([]);
      return;
    }

    setPlaceSearchLoading(true);
    setPlaceSearchError("");

    try {
      const response = await fetch("/api/search-place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: placeQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPlaceSearchError(data.error || "매장 검색 중 오류가 났어요.");
        setPlaceResults([]);
        return;
      }

      setPlaceResults(data.items || []);
    } catch (error) {
      console.error(error);
      setPlaceSearchError("매장 검색 중 오류가 났어요.");
      setPlaceResults([]);
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const handleRegisterPlace = (item: SearchPlaceItem) => {
    const exists = stores.some(
      (store) => store.name === item.title && store.address === item.address
    );

    if (exists) {
      alert("이미 등록된 매장입니다.");
      return;
    }

    const newStore: Store = {
      name: item.title,
      category: item.category.split(">").pop()?.trim() || item.category,
      address: item.address,
      placeLink: item.link,
      keywords: [],
    };

    setStores((prev) => [newStore, ...prev]);
    closeModal();
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-black">
      <div className="flex min-h-screen">
        <div className="fixed left-0 right-0 top-0 z-30 border-b border-gray-200 bg-white px-5 py-4 xl:hidden">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="logo"
              className="h-10 w-auto object-contain"
            />
          </Link>
        </div>

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
          </nav>
        </aside>

        <section className="flex-1">
          <div className="mx-auto max-w-7xl px-6 py-8 pt-24 xl:pt-8">
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

                <button
                  onClick={openModal}
                  className="rounded-2xl bg-purple-600 px-6 py-4 font-semibold text-white shadow-md transition hover:scale-[1.02] hover:bg-purple-700"
                >
                  매장 등록
                </button>
              </div>
            </div>

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
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="등록된 플레이스 검색"
                    className="w-full rounded-2xl border border-gray-300 bg-white px-5 py-4 text-black outline-none placeholder-gray-400 focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  />
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-500">
                기준 순위 조회중 · IP, 설정한 위치, 시간에 따라 순위 오차가
                발생할 수 있습니다.
              </p>
            </div>

            <div className="space-y-6">
              {filteredStores.map((store, index) => (
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
                          {store.placeLink ? (
                            <a
                              href={store.placeLink}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-black underline"
                            >
                              매장 바로가기
                            </a>
                          ) : (
                            <span>매장 링크 없음</span>
                          )}
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
                        {store.keywords.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-5 py-8 text-center text-sm text-gray-400"
                            >
                              아직 등록된 키워드가 없습니다.
                            </td>
                          </tr>
                        ) : (
                          store.keywords.map((item, i) => (
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
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
            onClick={closeModal}
          >
            <div className="flex min-h-screen items-center justify-center p-4">
              <div
                className="w-full max-w-5xl rounded-[36px] bg-white p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-5xl font-black tracking-tight text-black">
                      매장등록
                    </h2>
                    <p className="mt-3 text-base text-gray-500">
                      네이버 검색 기준으로 매장 이름을 검색하고 등록하세요.
                    </p>
                  </div>

                  <button
                    onClick={closeModal}
                    className="rounded-3xl bg-gray-100 px-7 py-5 text-2xl font-bold text-gray-800"
                  >
                    취소
                  </button>
                </div>

                <div className="flex overflow-hidden rounded-[28px] border-2 border-purple-600 bg-white">
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    placeholder="매장 이름을 검색하세요"
                    className="flex-1 bg-white px-8 py-7 text-2xl text-black outline-none placeholder:text-gray-400"
                  />

                  <button
                    onClick={handlePlaceSearch}
                    className="bg-purple-600 px-10 text-3xl font-bold text-white"
                  >
                    {placeSearchLoading ? "검색중" : "검색"}
                  </button>
                </div>

                {placeSearchError && (
                  <p className="mt-4 text-lg font-medium text-red-600">
                    {placeSearchError}
                  </p>
                )}

                <div className="mt-8 max-h-[420px] space-y-4 overflow-y-auto pr-1">
                  {placeResults.map((item, index) => (
                    <button
                      key={`${item.title}-${index}`}
                      onClick={() => handleRegisterPlace(item)}
                      className="block w-full rounded-3xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-purple-400 hover:shadow-md"
                    >
                      <div className="text-2xl font-bold text-black">
                        {item.title}
                      </div>
                      <div className="mt-2 text-base text-gray-600">
                        {item.category}
                      </div>
                      <div className="mt-2 text-base text-gray-500">
                        {item.address}
                      </div>
                    </button>
                  ))}

                  {!placeSearchLoading &&
                    placeQuery.trim() &&
                    !placeSearchError &&
                    placeResults.length === 0 && (
                      <div className="rounded-3xl border border-dashed border-gray-300 px-6 py-10 text-center text-lg text-gray-400">
                        검색 결과가 없습니다.
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}