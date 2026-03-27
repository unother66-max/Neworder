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

function getMobilePlaceLink(link?: string) {
  if (!link) return "#";

  try {
    const url = new URL(link);

    if (url.hostname.includes("m.place.naver.com")) {
      return url.toString();
    }

    if (
      url.hostname.includes("map.naver.com") ||
      url.hostname.includes("place.naver.com")
    ) {
      return url.toString().replace("place.naver.com", "m.place.naver.com");
    }

    return url.toString();
  } catch {
    return link;
  }
}

function getPcPlaceLink(link?: string) {
  if (!link) return "#";

  try {
    const url = new URL(link);

    if (url.hostname.includes("m.place.naver.com")) {
      return url.toString().replace("m.place.naver.com", "place.naver.com");
    }

    return url.toString();
  } catch {
    return link;
  }
}

export default function PlacePage() {
  const [stores, setStores] = useState<Store[]>([
    {
      name: "키코필라테스 앤 발레",
      category: "필라테스",
      address: "서울특별시 용산구 만리재로 134 7층",
      placeLink: "https://m.place.naver.com/place/1234567890/home",
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
      ],
    },
    {
      name: "뉴오더클럽 연남",
      category: "피자",
      address: "서울 마포구 연남동 260-31",
      placeLink: "https://m.place.naver.com/place/9876543210/home",
      keywords: [],
    },
  ]);

  const [searchText, setSearchText] = useState("");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<SearchPlaceItem[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");

  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [selectedStoreIndex, setSelectedStoreIndex] = useState<number | null>(
    null
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [tempKeywords, setTempKeywords] = useState<string[]>([]);

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

  const openRegisterModal = () => {
    setIsRegisterModalOpen(true);
    setPlaceQuery("");
    setPlaceResults([]);
    setPlaceSearchError("");
  };

  const closeRegisterModal = () => {
    setIsRegisterModalOpen(false);
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
    closeRegisterModal();
  };

  const openKeywordModal = (storeIndex: number) => {
    const targetStore = filteredStores[storeIndex];
    const realIndex = stores.findIndex(
      (item) =>
        item.name === targetStore.name && item.address === targetStore.address
    );

    if (realIndex === -1) return;

    setSelectedStoreIndex(realIndex);
    setTempKeywords(stores[realIndex].keywords.map((item) => item.keyword));
    setKeywordInput("");
    setIsKeywordModalOpen(true);
  };

  const closeKeywordModal = () => {
    setIsKeywordModalOpen(false);
    setSelectedStoreIndex(null);
    setKeywordInput("");
    setTempKeywords([]);
  };

  const addTempKeyword = () => {
    const value = keywordInput.trim();
    if (!value) return;

    if (tempKeywords.includes(value)) {
      alert("이미 추가된 키워드입니다.");
      return;
    }

    setTempKeywords((prev) => [...prev, value]);
    setKeywordInput("");
  };

  const removeTempKeyword = (keyword: string) => {
    setTempKeywords((prev) => prev.filter((item) => item !== keyword));
  };

  const saveKeywords = () => {
    if (selectedStoreIndex === null) return;

    const newKeywordItems: KeywordItem[] = tempKeywords.map((keyword) => ({
      keyword,
      monthly: "-",
      mobile: "-",
      pc: "-",
      rank: "-",
    }));

    setStores((prev) =>
      prev.map((store, index) =>
        index === selectedStoreIndex
          ? {
              ...store,
              keywords: newKeywordItems,
            }
          : store
      )
    );

    closeKeywordModal();
  };

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-[#111827]">
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
              <Link href="/" className="text-[14px] font-semibold text-[#111827]">
                상위블로그찾기
              </Link>
              <Link
                href="/place"
                className="text-[14px] font-extrabold text-[#7c3aed]"
              >
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
          <span className="font-semibold text-[#111827]">플레이스 순위 추적</span>
        </div>
      </div>

      <section className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[28px] font-black tracking-[-0.02em] text-[#111827]">
                매장 순위 추적
              </h1>
              <span className="text-[18px] text-[#9ca3af]">ⓘ</span>
            </div>

            <p className="mt-3 text-[14px] leading-7 text-[#6b7280]">
              스마트플레이스 순위 추적은 네이버 지도에 등록된 가게의 노출 순위를
              확인하실 수 있습니다.
            </p>
          </div>

          <button
            onClick={openRegisterModal}
            className="h-[46px] min-w-[118px] rounded-[14px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(139,44,245,0.18)] transition hover:opacity-95"
          >
            매장 등록
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#111827]">
                등록된 매장
              </h2>

              <button className="rounded-[12px] bg-[#eef1f5] px-4 py-2.5 text-[14px] font-semibold text-[#374151]">
                매장 관리
              </button>
            </div>

            <p className="mt-5 text-[13px] text-[#6b7280]">📍 기준 순위 조회중</p>
          </div>

          <div className="w-full xl:w-[420px]">
            <div className="relative">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="등록된 플레이스 검색"
                className="h-[46px] w-full rounded-[14px] border border-[#d9dee7] bg-white px-4 pr-12 text-[14px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#8b2cf5]"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-[#111827]">
                🔍
              </div>
            </div>

            <div className="mt-3 text-right text-[12px] text-[#6b7280]">
              ⓘ IP, 설정한 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
            </div>
          </div>
        </div>

        <div className="mt-7 space-y-5">
          {filteredStores.map((store, index) => (
            <div
              key={`${store.name}-${store.address}`}
              className="rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]"
            >
              <div className="mb-6 flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[14px] bg-[#eef0f3] text-[12px] text-[#9ca3af]">
                    이미지
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-[17px] font-black tracking-[-0.01em] text-[#111827]">
                        {store.name}
                      </h3>
                      <span className="text-[14px] text-[#6b7280]">
                        {store.category}
                      </span>
                      <span className="text-[14px] text-[#c6cad3]">|</span>
                      <span className="text-[14px] text-[#374151]">
                        {store.address}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-5 text-[13px] text-[#6b7280]">
                      <span>
                        검색량{" "}
                        <strong className="text-[13px] font-bold text-[#111827]">
                          1,490
                        </strong>
                      </span>
                      <span>📱 1,380</span>
                      <span>🖥 110</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px]">
                      <span className="text-[#6b7280]">매장 바로가기</span>

                      {store.placeLink ? (
                        <>
                          <a
                            href={getMobilePlaceLink(store.placeLink)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#111827] underline underline-offset-2"
                          >
                            모바일
                          </a>
                          <a
                            href={getPcPlaceLink(store.placeLink)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#111827] underline underline-offset-2"
                          >
                            PC
                          </a>
                        </>
                      ) : (
                        <span className="text-[#b7bec8]">링크 없음</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-1 text-[18px] text-[#374151]">📌</div>

                  <button className="rounded-[10px] bg-[#f1f3f6] px-4 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#e9edf3]">
                    순위 변화 보기
                  </button>

                  <button className="rounded-[10px] bg-[#f1f3f6] px-4 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#e9edf3]">
                    자동 추적 <span className="text-[#ff6b6b]">OFF</span>
                  </button>

                  <button
                    onClick={() => openKeywordModal(index)}
                    className="rounded-[10px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95"
                  >
                    키워드 관리
                  </button>

                  <button className="px-1 text-[20px] text-[#4b5563]">⋮</button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[16px] border border-[#e5e9f0]">
                <table className="min-w-full border-collapse">
                  <thead className="bg-[#f4f6f9]">
                    <tr>
                      <th className="px-6 py-3 text-left text-[13px] font-bold text-[#374151]">
                        키워드
                      </th>
                      <th className="px-6 py-3 text-left text-[13px] font-bold text-[#374151]">
                        월 검색량
                      </th>
                      <th className="px-6 py-3 text-left text-[13px] font-bold text-[#374151]">
                        📱 모바일
                      </th>
                      <th className="px-6 py-3 text-left text-[13px] font-bold text-[#374151]">
                        🖥 PC
                      </th>
                      <th className="px-6 py-3 text-left text-[13px] font-bold text-[#374151]">
                        검색 순위
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {store.keywords.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-14 text-center text-[13px] leading-7 text-[#6b7280]"
                        >
                          지금 키워드를 등록하고, 내 매장의 키워드 별 순위를
                          확인해보세요.
                          <br />
                          <span className="font-bold text-[#4b5563]">
                            [키워드 관리]
                          </span>
                          버튼을 눌러 시작할 수 있어요.
                        </td>
                      </tr>
                    ) : (
                      store.keywords.map((item, i) => (
                        <tr key={i} className="border-t border-[#e5e7eb]">
                          <td className="px-6 py-3 text-[13px] font-medium text-[#111827]">
                            {item.keyword}
                          </td>
                          <td className="px-6 py-3 text-[13px] text-[#111827]">
                            {item.monthly}
                          </td>
                          <td className="px-6 py-3 text-[13px] text-[#6b7280]">
                            {item.mobile}
                          </td>
                          <td className="px-6 py-3 text-[13px] text-[#6b7280]">
                            {item.pc}
                          </td>
                          <td className="px-6 py-3 text-[13px] font-bold text-[#111827]">
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
      </section>

      {isRegisterModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
          onClick={closeRegisterModal}
        >
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="w-full max-w-[860px] rounded-[18px] bg-[#f7f7f8] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[#e5e7eb] px-6 py-5">
                <h2 className="text-[24px] font-black tracking-[-0.02em] text-black">
                  매장등록
                </h2>
              </div>

              <div className="px-6 py-8 md:px-8">
                <div className="flex overflow-hidden rounded-[16px] border-2 border-[#6d28ff] bg-white">
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePlaceSearch();
                    }}
                    placeholder="매장 이름을 검색하세요"
                    className="h-[56px] flex-1 bg-white px-5 text-[15px] text-[#111827] outline-none placeholder:text-[#a8afbb]"
                  />

                  <button
                    onClick={handlePlaceSearch}
                    className="min-w-[110px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[15px] font-bold text-white"
                  >
                    {placeSearchLoading ? "검색중" : "검색"}
                  </button>
                </div>

                {placeSearchError && (
                  <p className="mt-4 text-[13px] font-medium text-red-600">
                    {placeSearchError}
                  </p>
                )}

                <div className="mt-5 min-h-[220px]">
                  {placeResults.length > 0 && (
                    <div className="overflow-hidden rounded-[14px] border border-[#e5e7eb] bg-white">
                      {placeResults.map((item, index) => (
                        <button
                          key={`${item.title}-${index}`}
                          onClick={() => handleRegisterPlace(item)}
                          className="block w-full border-b border-[#e5e7eb] px-5 py-5 text-left transition last:border-b-0 hover:bg-[#fafafa]"
                        >
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[16px] font-bold text-[#4f46e5]">
                              {item.title}
                            </span>
                            <span className="text-[13px] font-medium text-[#111827]">
                              {item.category.split(">").pop()?.trim() ||
                                item.category}
                            </span>
                          </div>

                          <div className="mt-2 text-[13px] text-[#9ca3af]">
                            {item.address}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {!placeSearchLoading &&
                    placeQuery.trim() &&
                    !placeSearchError &&
                    placeResults.length === 0 && (
                      <div className="mt-6 rounded-[14px] border border-dashed border-[#d1d5db] px-6 py-10 text-center text-[13px] text-[#9ca3af]">
                        검색 결과가 없습니다.
                      </div>
                    )}
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={closeRegisterModal}
                    className="h-[42px] rounded-[12px] bg-[#efeff3] px-6 text-[14px] font-bold text-[#222]"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isKeywordModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
          onClick={closeKeywordModal}
        >
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-[22px] font-black tracking-[-0.02em] text-black">
                    키워드 관리
                  </h2>
                  <p className="mt-1 text-[13px] text-[#6b7280]">
                    추적할 키워드를 추가하고 저장하세요.
                  </p>
                </div>

                <button
                  onClick={closeKeywordModal}
                  className="rounded-[10px] bg-[#f1f3f7] px-4 py-2 text-[13px] font-semibold text-[#374151]"
                >
                  닫기
                </button>
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTempKeyword();
                  }}
                  placeholder="예: 연남동 피자"
                  className="h-[44px] flex-1 rounded-[12px] border border-[#d1d5db] bg-white px-4 text-[14px] text-black outline-none placeholder:text-[#9ca3af] focus:border-[#8b2cf5] focus:ring-4 focus:ring-[#f0e7ff]"
                />
                <button
                  onClick={addTempKeyword}
                  className="rounded-[12px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[14px] font-semibold text-white"
                >
                  추가
                </button>
              </div>

              <div className="mt-5 max-h-[260px] space-y-3 overflow-y-auto pr-1">
                {tempKeywords.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[#d1d5db] px-6 py-8 text-center text-[13px] text-[#9ca3af]">
                    아직 추가된 키워드가 없습니다.
                  </div>
                ) : (
                  tempKeywords.map((keyword) => (
                    <div
                      key={keyword}
                      className="flex items-center justify-between rounded-[14px] border border-[#e5e7eb] px-4 py-3"
                    >
                      <span className="text-[14px] font-medium text-black">
                        {keyword}
                      </span>
                      <button
                        onClick={() => removeTempKeyword(keyword)}
                        className="rounded-[8px] bg-[#f3f4f6] px-3 py-1.5 text-[12px] font-semibold text-[#374151]"
                      >
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={closeKeywordModal}
                  className="rounded-[10px] border border-[#d1d5db] bg-white px-4 py-2 text-[13px] font-semibold text-[#374151]"
                >
                  취소
                </button>
                <button
                  onClick={saveKeywords}
                  className="rounded-[10px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-4 py-2 text-[13px] font-semibold text-white"
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}