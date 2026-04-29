"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin, Trash2 } from "lucide-react";
import Tooltip from "@/components/Tooltip";

type KakaoRankRow = {
  date: string;
  keyword: string;
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
  kakaoId: string | null;
  name: string;
  category: string;
  address: string;
  kakaoUrl: string;
  imageUrl: string | null;
  isPinned: boolean;
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
  image?: string;
};

const RANK_GROUPS = [
  {
    label: "검색",
    allKey: "searchAll",
    catKey: "searchCat",
    tooltip: "해당지역에서 검색시 업체가 노출되는 순위입니다.",
  },
  {
    label: "길찾기",
    allKey: "directionAll",
    catKey: "directionCat",
    tooltip: "해당지역에서 길찾기를 많이 누른 매장 순위입니다.",
  },
  {
    label: "즐겨찾기",
    allKey: "favoriteAll",
    catKey: "favoriteCat",
    tooltip: "해당지역에서 저장한 횟수를 기준으로 한 인기 순위입니다.",
  },
  {
    label: "친구공유",
    allKey: "shareAll",
    catKey: "shareCat",
    tooltip: "해당지역에서 카카오톡 등으로 많이 공유된 매장의 순위입니다.",
  },
] as const;

export default function KakaoRankingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [stores, setStores] = useState<KakaoStore[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [trackingLoadingId, setTrackingLoadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
          kakaoId: item.kakaoId,
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

  const handleUpdateRank = async (store: KakaoStore) => {
    if (updatingId) return;
    setUpdatingId(store.id);
    try {
      const res = await fetch("/api/check-kakao-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ placeId: store.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || data.message || "업데이트 실패");
        return;
      }
      await fetchStores();
    } catch (e) {
      console.error(e);
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleTracking = async (store: KakaoStore) => {
    if (trackingLoadingId) return;
    setTrackingLoadingId(store.id);
    const nextValue = !store.isAutoTracking;
    try {
      const res = await fetch("/api/kakao-toggle-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: store.id, enabled: nextValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data?.message || "자동추적 변경 실패");
        return;
      }
      setStores((prev) =>
        prev.map((s) => (s.id === store.id ? { ...s, isAutoTracking: nextValue } : s))
      );
    } catch (e) {
      console.error(e);
      alert("자동추적 변경 중 오류가 발생했습니다.");
    } finally {
      setTrackingLoadingId(null);
    }
  };

  const handleTogglePin = async (store: KakaoStore) => {
    if (pinningId) return;
    setPinningId(store.id);
    try {
      const res = await fetch("/api/place-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: store.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data?.message || "핀 변경 실패");
        return;
      }
      await fetchStores();
    } catch (e) {
      console.error(e);
      alert("핀 변경 중 오류가 발생했습니다.");
    } finally {
      setPinningId(null);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9] pt-24">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9] pt-24">
          <div className="text-[15px] text-[#6b7280]">로그인 페이지로 이동 중...</div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="kakao-ranking" />
      <main className="min-h-screen bg-[#f4f4f5] text-[#111111] pt-24">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">

          {/* Page header */}
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    지역 순위 추적
                  </h1>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-bold text-[#4b5563]">
                    KAKAO
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                카카오맵에서 제공하는 지역별 인기 순위를 기준으로 분석된 데이터입니다.
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
                * 업종 기준 지역 랭킹을 표시합니다.
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
              filteredStores.map((store) => {
                const latestRow = store.rankRows[0] ?? null;
                return (
                  <div
                    key={store.id}
                    className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition"
                  >
                    <div className="px-5 py-4 md:px-6">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">

                        {/* Store info */}
                        <div className="flex min-w-0 gap-4">
                          {store.imageUrl ? (
                            <img
                              src={store.imageUrl}
                              alt={store.name}
                              className="h-[70px] w-[70px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">
                              이미지
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {store.isPinned && (
                                <Pin className="h-[14px] w-[14px] fill-[#b91c1c] stroke-[#b91c1c]" />
                              )}
                              <h3 className="text-[20px] font-black tracking-[-0.03em] text-[#111827]">
                                {store.name}
                              </h3>
                              {store.category ? (
                                <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                                  {store.category}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1 text-[13px] text-[#6b7280]">
                              {store.address || "-"}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
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
                            onClick={() => handleTogglePin(store)}
                            disabled={pinningId === store.id}
                            className={`inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-white transition hover:bg-[#f9fafb] ${pinningId === store.id ? "opacity-60" : ""}`}
                            aria-label="상단 고정"
                          >
                            <Pin
                              className={`h-[20px] w-[20px] transition ${
                                store.isPinned
                                  ? "fill-[#b91c1c] stroke-[#b91c1c]"
                                  : "stroke-[#6b7280]"
                              }`}
                              strokeWidth={2}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateRank(store)}
                            disabled={updatingId === store.id}
                            className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] bg-[#111827] px-4 text-[14px] font-bold text-white transition hover:bg-[#1f2937] ${
                              updatingId === store.id ? "opacity-60" : ""
                            }`}
                          >
                            {updatingId === store.id ? "업데이트 중..." : "업데이트"}
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/kakao-ranking/${store.id}`)}
                            className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                          >
                            순위변화보기
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleTracking(store)}
                            disabled={trackingLoadingId === store.id}
                            className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] px-4 text-[14px] font-bold transition ${
                              store.isAutoTracking
                                ? "bg-[#b91c1c] text-white shadow-[0_10px_22px_rgba(185,28,28,0.16)] hover:bg-[#991b1b]"
                                : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                            } ${trackingLoadingId === store.id ? "opacity-60" : ""}`}
                          >
                            {trackingLoadingId === store.id
                              ? "처리 중..."
                              : `자동추적 ${store.isAutoTracking ? "ON" : "OFF"}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStore(store.id)}
                            disabled={deletingStoreId === store.id}
                            className={`inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-white transition hover:bg-[#fef2f2] ${deletingStoreId === store.id ? "opacity-60" : ""}`}
                            aria-label="삭제"
                          >
                            {deletingStoreId === store.id
                              ? <span className="text-[12px] text-[#dc2626]">...</span>
                              : <Trash2 className="h-[18px] w-[18px] stroke-[#dc2626]" strokeWidth={2} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 최신 순위 1행 테이블 */}
                    <div className="border-t border-[#f3f4f6] px-5 pb-4 md:px-6">
                      <div className="mb-2 mt-3">
                        <p className="text-[11px] font-semibold text-[#6b7280]">
                          해당 지역에서의 랭킹변화
                        </p>
                      </div>
                      <div className="overflow-x-auto rounded-[14px] border border-[#e5e7eb]">
                        <table className="min-w-full border-collapse">
                          <thead className="bg-[#f9fafb]">
                            <tr>
                              <th
                                rowSpan={2}
                                className="border-b border-r border-[#e5e7eb] px-4 py-2.5 text-left text-[11px] font-extrabold text-[#6b7280]"
                              >
                                날짜
                              </th>
                              {RANK_GROUPS.map((g, i) => (
                                <th
                                  key={g.label}
                                  colSpan={2}
                                  className={`border-b border-[#e5e7eb] px-3 py-2 text-center text-[11px] font-extrabold text-[#6b7280] ${
                                    i < RANK_GROUPS.length - 1 ? "border-r" : ""
                                  }`}
                                >
                                  <Tooltip content={g.tooltip}>
                                    <span>{g.label} 랭킹</span>
                                  </Tooltip>
                                </th>
                              ))}
                            </tr>
                            <tr>
                              {RANK_GROUPS.map((g, gi) =>
                                (["전체", store.category || "업종"] as const).map((label, li) => (
                                  <th
                                    key={`${g.label}-${label}-${li}`}
                                    className={`border-b border-[#e5e7eb] px-3 py-1.5 text-center text-[10px] font-semibold text-[#9ca3af] ${
                                      li === 1 && gi < RANK_GROUPS.length - 1 ? "border-r" : ""
                                    }`}
                                  >
                                    {label}
                                  </th>
                                ))
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {!latestRow ? (
                              <tr>
                                <td
                                  colSpan={9}
                                  className="px-4 py-6 text-center text-[12px] text-[#9ca3af]"
                                >
                                  아직 순위 데이터가 없습니다. 순위변화보기에서 체크해주세요.
                                </td>
                              </tr>
                            ) : (
                              <tr className="bg-white">
                                <td className="border-r border-[#f3f4f6] px-4 py-3 text-[11px] font-semibold text-[#6b7280]">
                                  {latestRow.date}
                                </td>
                                {RANK_GROUPS.map((g, gi) => (
                                  <React.Fragment key={`${g.label}-${gi}`}>
                                    <td className="px-3 py-3 text-center text-[12px] font-bold text-[#6b7280]">
                                      {latestRow[g.allKey] || "-"}
                                    </td>
                                    <td
                                      className={`px-3 py-3 text-center text-[12px] font-bold ${
                                        latestRow[g.catKey] && latestRow[g.catKey] !== "-" && latestRow[g.catKey] !== "100위 밖"
                                          ? "text-[#111827]"
                                          : "text-[#d1d5db]"
                                      } ${gi < RANK_GROUPS.length - 1 ? "border-r border-[#f3f4f6]" : ""}`}
                                    >
                                      {latestRow[g.catKey] || "-"}
                                    </td>
                                  </React.Fragment>
                                ))}
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-right text-[11px] text-[#9ca3af]">
                        마지막 업데이트:{" "}
                        <span className="font-semibold text-[#6b7280]">{store.latestUpdatedAt || "-"}</span>
                      </p>
                    </div>
                  </div>
                );
              })
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
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.title}
                              className="h-[60px] w-[60px] shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb]"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[11px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">
                              이미지
                            </div>
                          )}
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
