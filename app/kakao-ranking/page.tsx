"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";

type KakaoRankRow = {
  date: string;
  searchAll: string;
  searchCat: string;
  directionAll: string;
  directionCat: string;
  favoriteAll: string;
  favoriteCat: string;
  shareAll: string;
  shareCat: string;
};

type KakaoStore = {
  id: string;
  name: string;
  category: string;
  address: string;
  kakaoUrl: string;
  monthlyVolume: number | null;
  mobileVolume: number | null;
  pcVolume: number | null;
  isAutoTracking: boolean;
  rankRows: KakaoRankRow[];
  latestUpdatedAt: string | null;
};

type KakaoSearchItem = {
  kakaoId: string;
  title: string;
  category: string;
  address: string;
  kakaoUrl: string;
  x: string;
  y: string;
};

function formatCount(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("ko-KR");
}

export default function KakaoRankingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [stores, setStores] = useState<KakaoStore[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<KakaoSearchItem[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  useEffect(() => {
    if (!mounted) return;
    if (!session) return;
    fetchStores();
  }, [mounted, session]);

  const fetchStores = async () => {
    try {
      setStoreLoading(true);
      const res = await fetch("/api/kakao-place-list", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        console.error(data?.message || "매장 목록 불러오기 실패");
        return;
      }
      setStores(data.places || []);
    } catch (e) {
      console.error(e);
    } finally {
      setStoreLoading(false);
    }
  };

  const filteredStores = stores.filter((s) => {
    const text = searchText.trim().toLowerCase();
    if (!text) return true;
    return (
      s.name.toLowerCase().includes(text) ||
      s.category.toLowerCase().includes(text) ||
      s.address.toLowerCase().includes(text)
    );
  });

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
      const res = await fetch("/api/search-kakao-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: placeQuery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlaceSearchError(data.error || "검색 중 오류가 발생했어요.");
        setPlaceResults([]);
        return;
      }
      setPlaceResults(data.items || []);
    } catch {
      setPlaceSearchError("검색 중 오류가 발생했어요.");
      setPlaceResults([]);
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const handleRegisterStore = async (item: KakaoSearchItem) => {
    const alreadyExists = stores.some(
      (s) => s.name === item.title && s.address === item.address
    );
    if (alreadyExists) {
      alert("이미 등록된 매장입니다.");
      return;
    }
    try {
      const res = await fetch("/api/kakao-place-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.title,
          category: item.category.split(">").pop()?.trim() || item.category,
          address: item.address,
          kakaoUrl: item.kakaoUrl,
          x: item.x,
          y: item.y,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "매장 등록 실패");
        return;
      }
      await fetchStores();
      closeRegisterModal();
    } catch (e) {
      console.error(e);
      alert("매장 등록 중 오류가 났어요.");
    }
  };

  const handleDeleteStore = async (id: string) => {
    const store = stores.find((s) => s.id === id);
    if (!store) return;
    if (!window.confirm(`[${store.name}] 매장을 삭제할까요?`)) return;
    try {
      setDeletingStoreId(id);
      const res = await fetch("/api/kakao-place-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "매장 삭제 실패");
        return;
      }
      await fetchStores();
    } catch (e) {
      console.error(e);
      alert("매장 삭제 중 오류가 났어요.");
    } finally {
      setDeletingStoreId(null);
    }
  };

  const handleToggleTracking = (id: string) => {
    setStores((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, isAutoTracking: !s.isAutoTracking } : s
      )
    );
  };

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
          <div className="text-[15px] text-[#6b7280]">로그인 페이지로 이동 중...</div>
        </main>
      </>
    );
  }

  const RANK_GROUPS = [
    { label: "검색 랭킹", allKey: "searchAll", catKey: "searchCat" },
    { label: "길찾기 랭킹", allKey: "directionAll", catKey: "directionCat" },
    { label: "즐겨찾기 랭킹", allKey: "favoriteAll", catKey: "favoriteCat" },
    { label: "친구공유 랭킹", allKey: "shareAll", catKey: "shareCat" },
  ] as const;

  return (
    <>
      <TopNav active="kakao-ranking" />
      <main className="min-h-screen bg-[#f4f4f5] text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">

          {/* Page header */}
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    카카오맵 랭킹 추적
                  </h1>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-bold text-[#4b5563]">
                    KAKAO
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  카카오맵에 등록된 매장의 지역별 랭킹 변화를 확인하실 수 있습니다.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
                <div className="relative w-full sm:w-[320px]">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="등록된 매장 검색"
                    className="h-[44px] w-full rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
                  />
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
                    🔍
                  </div>
                </div>

                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="h-[44px] min-w-[108px] rounded-[14px] bg-[#b91c1c] px-4 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b]"
                >
                  매장 등록
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    등록된 매장
                  </h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                    {filteredStores.length}개
                  </span>
                </div>
              <p className="mt-2 text-[12px] text-[#6b7280]">
                {storeLoading ? "📍 매장 목록 불러오는 중..." : "📍 카카오맵 랭킹 추적 중"}
              </p>
              </div>
              <div className="text-[11px] text-[#9ca3af]">
                * 월 검색량은 카카오 데이터 미제공으로 네이버 검색량을 표기합니다.
              </div>
            </div>
          </div>

          {/* Store list */}
          <div className="mt-5 space-y-4">
            {filteredStores.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">
                  아직 등록된 매장이 없어요
                </p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  상단의 매장 등록 버튼으로 첫 매장을 추가해보세요.
                </p>
              </div>
            ) : (
              filteredStores.map((store) => (
                <div
                  key={store.id}
                  className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  {/* Store header */}
                  <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-5 py-4 md:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">

                      {/* Store info */}
                      <div className="flex min-w-0 gap-4">
                        {store.image ? (
                          <img
                            src={store.image}
                            alt={store.name}
                            className="h-[70px] w-[70px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">
                            이미지
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[20px] font-black tracking-[-0.03em] text-[#111827]">
                              {store.name}
                            </h3>
                            {store.category ? (
                              <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                                {store.category}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1.5 text-[13px] text-[#6b7280]">
                            {store.address || "-"}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="text-[10px] font-semibold text-[#6b7280]">
                                월 검색량
                              </div>
                              <div className="mt-1 text-[15px] font-black text-[#111827]">
                                {formatCount(store.monthlyVolume)}
                              </div>
                            </div>
                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="text-[10px] font-semibold text-[#6b7280]">
                                모바일
                              </div>
                              <div className="mt-1 text-[14px] font-extrabold text-[#111827]">
                                {formatCount(store.mobileVolume)}
                              </div>
                            </div>
                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="text-[10px] font-semibold text-[#6b7280]">
                                PC
                              </div>
                              <div className="mt-1 text-[14px] font-extrabold text-[#111827]">
                                {formatCount(store.pcVolume)}
                              </div>
                            </div>
                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="text-[10px] font-semibold text-[#6b7280]">
                                자동 추적
                              </div>
                              <div className="mt-1 text-[14px] font-black text-[#111827]">
                                {store.isAutoTracking ? "ON" : "OFF"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                            <span className="font-semibold text-[#6b7280]">바로가기</span>
                            {store.kakaoUrl ? (
                              <a
                                href={store.kakaoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                              >
                                카카오맵
                              </a>
                            ) : (
                              <span className="text-[#c0c6d0]">카카오맵 없음</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto xl:overflow-visible">
                        <button
                          type="button"
                          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                        >
                          순위변화보기
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleTracking(store.id)}
                          className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] px-4 text-[14px] font-bold transition ${
                            store.isAutoTracking
                              ? "bg-[#b91c1c] text-white shadow-[0_10px_22px_rgba(185,28,28,0.16)] hover:bg-[#991b1b]"
                              : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                          }`}
                        >
                          자동추적 {store.isAutoTracking ? "ON" : "OFF"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStore(store.id)}
                          disabled={deletingStoreId === store.id}
                          className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#fecaca] bg-white px-4 text-[14px] font-bold text-[#dc2626] transition hover:bg-[#fafafa] ${deletingStoreId === store.id ? "opacity-60" : ""}`}
                        >
                          {deletingStoreId === store.id ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Ranking table */}
                  <div className="px-5 py-5 md:px-6">
                    <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb]">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead className="bg-[#f9fafb]">
                            <tr>
                              <th
                                rowSpan={2}
                                className="border-b border-r border-[#e5e7eb] px-4 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]"
                              >
                                날짜
                              </th>
                              {RANK_GROUPS.map((g, i) => (
                                <th
                                  key={g.label}
                                  colSpan={2}
                                  className={`border-b border-[#e5e7eb] px-4 py-2.5 text-center text-[12px] font-extrabold text-[#6b7280] ${
                                    i < RANK_GROUPS.length - 1 ? "border-r" : ""
                                  }`}
                                >
                                  {g.label}
                                </th>
                              ))}
                            </tr>
                            <tr>
                              {RANK_GROUPS.map((g, gi) =>
                                (["전체", store.category || "카테고리"] as const).map(
                                  (label, li) => (
                                    <th
                                      key={`${g.label}-${label}`}
                                      className={`border-b border-[#e5e7eb] px-3 py-2 text-center text-[11px] font-semibold text-[#9ca3af] ${
                                        li === 1 && gi < RANK_GROUPS.length - 1
                                          ? "border-r"
                                          : ""
                                      }`}
                                    >
                                      {label}
                                    </th>
                                  )
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {store.rankRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={9}
                                  className="px-5 py-10 text-center text-[14px] text-[#9ca3af]"
                                >
                                  아직 순위 데이터가 없습니다.
                                </td>
                              </tr>
                            ) : (
                              store.rankRows.map((row, i) => (
                                <tr
                                  key={i}
                                  className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]"
                                >
                                  <td className="border-r border-[#f3f4f6] px-4 py-4 text-[12px] font-semibold text-[#6b7280]">
                                    {row.date}
                                  </td>
                                  {RANK_GROUPS.map((g, gi) => (
                                    <>
                                      <td
                                        key={`${g.allKey}-${i}`}
                                        className="px-3 py-4 text-center text-[13px] font-bold text-[#111827]"
                                      >
                                        {row[g.allKey] || "-"}
                                      </td>
                                      <td
                                        key={`${g.catKey}-${i}`}
                                        className={`px-3 py-4 text-center text-[13px] font-bold text-[#111827] ${
                                          gi < RANK_GROUPS.length - 1
                                            ? "border-r border-[#f3f4f6]"
                                            : ""
                                        }`}
                                      >
                                        {row[g.catKey] || "-"}
                                      </td>
                                    </>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end text-[11px] text-[#9ca3af]">
                      <div>
                        마지막 업데이트:{" "}
                        <span className="font-semibold text-[#6b7280]">
                          {store.latestUpdatedAt || "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Register modal */}
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[700px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
                      REGISTER STORE
                    </p>
                    <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                      매장 등록
                    </h2>
                    <p className="mt-2 text-[14px] text-[#6b7280]">
                      매장명을 검색해서 추적할 카카오맵 매장을 등록하세요.
                    </p>
                  </div>
                  <button
                    onClick={closeRegisterModal}
                    className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="px-6 py-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePlaceSearch();
                    }}
                    placeholder="예: 뉴오더클럽 한남"
                    className="h-[50px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[15px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
                  />
                  <button
                    onClick={handlePlaceSearch}
                    disabled={placeSearchLoading}
                    className={`h-[50px] rounded-[16px] bg-[#b91c1c] px-5 text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b] ${
                      placeSearchLoading ? "opacity-60" : ""
                    }`}
                  >
                    {placeSearchLoading ? "검색 중..." : "매장 검색"}
                  </button>
                </div>

                {placeSearchError && (
                  <div className="mt-4 rounded-[14px] border border-[#fecaca] px-4 py-3 text-[14px] text-[#dc2626]">
                    {placeSearchError}
                  </div>
                )}

                <div className="mt-5 max-h-[380px] space-y-3 overflow-y-auto pr-1">
                  {placeResults.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-5 py-10 text-center text-[14px] text-[#9ca3af]">
                      검색 결과가 여기에 표시됩니다.
                    </div>
                  ) : (
                    placeResults.map((item, idx) => (
                      <div
                        key={`${item.kakaoId}-${idx}`}
                        className="flex flex-col gap-4 rounded-[18px] border border-[#e5e7eb] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 gap-4">
                          <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[12px] bg-[#fff7ed] text-[20px] ring-1 ring-[#e5e7eb]">
                            🗺️
                          </div>
                          <div className="min-w-0">
                            <div className="text-[15px] font-black text-[#111827]">
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-[12px] font-semibold text-[#4b5563]">
                              {item.category}
                            </div>
                            <div className="mt-0.5 text-[12px] text-[#6b7280]">
                              {item.address}
                            </div>
                            {item.kakaoUrl && (
                              <a
                                href={item.kakaoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#b91c1c] transition hover:underline"
                              >
                                카카오맵 보기 ↗
                              </a>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRegisterStore(item)}
                          className="inline-flex h-[42px] items-center justify-center rounded-[14px] bg-[#111827] px-4 text-[14px] font-bold text-white transition hover:bg-[#1f2937]"
                        >
                          이 매장 등록
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
