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

  // --- 디자인 통일용 상태값 (page_13 기준) ---
  const [isAddHovered, setIsAddHovered] = useState(false);
  const [addMousePos, setAddMousePos] = useState({ x: 0, y: 0 });
  const [updateHover, setUpdateHover] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const [viewChangeHover, setViewChangeHover] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const [trackingHover, setTrackingHover] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  
  const [modalSearchHovered, setModalSearchHovered] = useState(false);
  const [modalSearchMousePos, setModalSearchMousePos] = useState({ x: 0, y: 0 });
  const [registerHover, setRegisterHover] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  useEffect(() => {
    if (!mounted || !session) return;
    fetchStores();
  }, [mounted, session]);

  const fetchStores = async () => {
    try {
      setStoreLoading(true);
      const res = await fetch("/api/kakao-place-list", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (res.ok) setStores(data.places || []);
    } finally {
      setStoreLoading(false);
    }
  };

  const filteredStores = stores.filter((s) => {
    const text = searchText.trim().toLowerCase();
    if (!text) return true;
    return s.name.toLowerCase().includes(text) || s.category.toLowerCase().includes(text) || s.address.toLowerCase().includes(text);
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
      if (res.ok) setPlaceResults(data.items || []);
      else setPlaceSearchError(data.error || "검색 중 오류가 발생했어요.");
    } catch {
      setPlaceSearchError("검색 중 오류가 발생했어요.");
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const handleRegisterStore = async (item: KakaoSearchItem) => {
    if (stores.some(s => s.name === item.title && s.address === item.address)) {
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
      if (res.ok) {
        await fetchStores();
        closeRegisterModal();
      } else alert("매장 등록 실패");
    } catch {
      alert("매장 등록 중 오류가 났어요.");
    }
  };

  const handleDeleteStore = async (id: string) => {
    const store = stores.find(s => s.id === id);
    if (!store || !window.confirm(`[${store.name}] 매장을 삭제할까요?`)) return;
    try {
      setDeletingStoreId(id);
      const res = await fetch("/api/kakao-place-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: id }),
      });
      if (res.ok) await fetchStores();
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
      if (res.ok) await fetchStores();
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
      if (res.ok) {
        setStores(prev => prev.map(s => s.id === store.id ? { ...s, isAutoTracking: nextValue } : s));
      }
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
      if (res.ok) await fetchStores();
    } finally {
      setPinningId(null);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] pt-24">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="kakao-ranking" />
      <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111111] md:pt-24">
        <section className="mx-auto max-w-[1240px] px-3 py-2 md:px-6 md:py-5 lg:px-8">
          
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-2.5 md:gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">지역 순위 추적</h1>
                  <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-bold text-[#2563eb] md:py-1 md:text-[11px]">KAKAO</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">카카오맵에서 제공하는 지역별 인기 순위를 기준으로 분석된 데이터입니다.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row md:gap-3 lg:w-auto lg:items-center">
              <div className="relative hidden w-full sm:block sm:w-[320px]">
                  <input
                    type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                    placeholder="등록된 매장 검색"
                    className="h-[40px] w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[12px] text-[#111827] outline-none transition focus:border-[#2563eb] focus:bg-white md:h-[44px] md:rounded-[14px] md:px-4 md:pr-11 md:text-[13px]"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#6b7280] md:right-4 md:text-[14px]">🔍</div>
                </div>
                <button
                  onMouseEnter={() => setIsAddHovered(true)} onMouseLeave={() => setIsAddHovered(false)}
                  onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAddMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="relative inline-flex h-[40px] min-w-[96px] items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out md:h-[44px] md:min-w-[108px] md:rounded-[14px] md:px-4 md:text-[13px]"
                >
                  <span className="relative z-30 pointer-events-none">매장 등록</span>
                  <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: isAddHovered ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                  <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200 ease-out md:h-32 md:w-32 ${isAddHovered ? "opacity-100" : "opacity-0"}`} style={{ left: `${addMousePos.x}px`, top: `${addMousePos.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light" }} />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#f3f4f6] pt-2 md:mt-3 md:gap-2 md:pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-black tracking-[-0.02em] text-[#111827] md:text-[17px]">등록된 매장</h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:px-2.5 md:py-1 md:text-[11px]">{filteredStores.length}개</span>
                </div>
                <p className="mt-1 text-[11px] text-[#6b7280] md:mt-2 md:text-[12px]">{storeLoading ? "📍 매장 목록 불러오는 중..." : "📍 카카오맵 랭킹 추적 중"}</p>
              </div>
              <div className="text-[10px] leading-4 text-[#6b7280] md:text-[11px] md:text-[#9ca3af]">* 업종 기준 지역 랭킹을 표시합니다.</div>
            </div>
          </div>

          <div className="mt-2.5 space-y-3 md:mt-5 md:space-y-4">
            {filteredStores.map((store) => {
              const latestRow = store.rankRows[0] ?? null;
              const rowId = store.id;
              return (
                <div key={store.id} className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] transition md:rounded-[22px] md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                  <div className="px-3 py-2.5 md:px-6 md:py-4">
                    <div className="flex flex-col gap-2.5 md:gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 gap-2.5 md:gap-4">
                        {store.imageUrl ? <img src={store.imageUrl} alt={store.name} className="h-12 w-12 shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px]" referrerPolicy="no-referrer" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[10px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px] md:text-[12px]">이미지</div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:gap-2">
                            {store.isPinned && <Pin className="h-3.5 w-3.5 fill-[#2563EB] stroke-[#2563EB] md:h-[14px] md:w-[14px]" />}
                            <h3 className="truncate text-[15px] font-black tracking-[-0.03em] text-[#111827] md:text-[20px]">{store.name}</h3>
                            {store.category && <span className="max-w-[88px] shrink-0 truncate rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:max-w-none md:px-2.5 md:py-1 md:text-[11px]">{store.category}</span>}
                          </div>
                          <p className="mt-0.5 truncate text-xs leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">{store.address || "-"}</p>
                          <div className="mt-1 text-[11px] md:mt-2 md:text-[12px]"><a href={store.kakaoUrl} target="_blank" rel="noreferrer" className="inline-flex h-6 items-center rounded-full border border-[#d1d5db] bg-white px-2 text-[10px] font-bold text-[#111827] transition hover:bg-[#f9fafb] md:h-auto md:px-3 md:py-1.5 md:text-[12px]"><span className="md:hidden">카카오맵</span><span className="hidden md:inline">카카오맵 바로가기</span></a></div>
                        </div>
                      </div>

                      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-2 xl:overflow-visible">
                        <button onClick={() => handleTogglePin(store)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-white transition hover:border-[#e5e7eb] hover:bg-[#f9fafb] md:h-[42px] md:w-[42px] md:rounded-[14px]">
                          <Pin className={`h-4 w-4 md:h-[20px] md:w-[20px] ${store.isPinned ? "fill-[#2563EB] stroke-[#2563EB]" : "stroke-[#6b7280]"}`} strokeWidth={2} />
                        </button>
                        
                        <button
                          onClick={() => handleUpdateRank(store)} disabled={updatingId === store.id}
                          onMouseEnter={() => setUpdateHover({ id: rowId, x: 0, y: 0 })}
                          onMouseLeave={() => setUpdateHover({ id: null, x: 0, y: 0 })}
                          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setUpdateHover({ id: rowId, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                          className="relative isolate inline-flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-[13px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60 md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px]"
                        >
                          <span className="relative z-30 pointer-events-none">{updatingId === store.id ? "업데이트 중..." : "업데이트"}</span>
                          <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: updateHover.id === rowId ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                          <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out ${updateHover.id === rowId ? "opacity-100" : "opacity-0"}`} style={{ left: `${updateHover.x}px`, top: `${updateHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }} />
                        </button>

                        <button
                          onClick={() => router.push(`/kakao-ranking/${store.id}`)}
                          onMouseEnter={() => setViewChangeHover({ id: rowId, x: 0, y: 0 })}
                          onMouseLeave={() => setViewChangeHover({ id: null, x: 0, y: 0 })}
                          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setViewChangeHover({ id: rowId, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                          className={`relative isolate inline-flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border px-2.5 text-[13px] font-bold transition-colors duration-0 ease-in-out md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px] ${viewChangeHover.id === rowId ? "border-[#2563EB] text-white" : "border-[#d1d5db] text-[#111827]"}`}
                        >
                          <span className="relative z-30 pointer-events-none md:hidden">순위변화</span>
                          <span className="relative z-30 pointer-events-none hidden md:inline">순위변화보기</span>
                          <div className="absolute inset-0 z-0 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: viewChangeHover.id === rowId ? "scaleX(1)" : "scaleX(0)", transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)" }} />
                          <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out ${viewChangeHover.id === rowId ? "opacity-100" : "opacity-0"}`} style={{ left: `${viewChangeHover.x}px`, top: `${viewChangeHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }} />
                        </button>

                        <button
                          onClick={() => handleToggleTracking(store)} disabled={trackingLoadingId === store.id}
                          onMouseEnter={() => setTrackingHover({ id: rowId, x: 0, y: 0 })}
                          onMouseLeave={() => setTrackingHover({ id: null, x: 0, y: 0 })}
                          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTrackingHover({ id: rowId, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                          className={`relative isolate inline-flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] px-2.5 text-xs font-bold transition-all duration-300 ease-in-out disabled:opacity-60 md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px] ${store.isAutoTracking ? "bg-[#2563EB] text-white" : trackingHover.id === rowId ? "border border-[#2563EB] text-white" : "border border-[#d1d5db] bg-white text-[#111827]"}`}
                        >
                          <span className="relative z-30 pointer-events-none">{trackingLoadingId === store.id ? "처리 중..." : `자동추적 ${store.isAutoTracking ? "ON" : "OFF"}`}</span>
                          <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: trackingHover.id === rowId ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                          <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out ${trackingHover.id === rowId ? "opacity-100" : "opacity-0"}`} style={{ left: `${trackingHover.x}px`, top: `${trackingHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }} />
                        </button>

                        <button onClick={() => handleDeleteStore(store.id)} disabled={deletingStoreId === store.id} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#fecdd3] bg-[#fff1f2] text-[#dc2626] transition hover:border-[#fda4af] hover:bg-[#ffe4e6] active:bg-[#fecdd3] md:h-[42px] md:w-[42px] md:rounded-[14px] md:border-transparent md:bg-white md:text-[#111827] md:hover:bg-[#f3f4f6]">
                          <Trash2 className="h-4 w-4 stroke-[#dc2626] md:h-[18px] md:w-[18px] md:stroke-[#111827]" strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 border-t border-[#f3f4f6] pb-1 pt-2.5 md:mt-4 md:pb-0 md:pt-3">
                      <div className="mb-2 text-[11px] font-semibold text-[#6b7280]">해당 지역에서의 랭킹변화</div>
                      <div className="overflow-x-auto rounded-[12px] border border-[#e5e7eb] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:rounded-[14px]">
                        <table className="w-full table-fixed border-collapse md:min-w-full md:table-auto">
                          <colgroup>
                            <col className="w-[15%] md:w-auto" />
                            {RANK_GROUPS.flatMap((g) => [
                              <col key={`${g.label}-all`} className="w-[10.625%] md:w-auto" />,
                              <col key={`${g.label}-cat`} className="w-[10.625%] md:w-auto" />,
                            ])}
                          </colgroup>
                          <thead className="bg-[#f9fafb]">
                            <tr>
                              <th rowSpan={2} className="border-b border-r border-[#e5e7eb] px-1 py-2 text-left text-[9px] font-extrabold text-[#6b7280] md:px-4 md:py-2.5 md:text-[11px]">날짜</th>
                              {RANK_GROUPS.map((g, i) => (
                                <th
                                  key={g.label}
                                  colSpan={2}
                                  className={`border-b border-[#e5e7eb] px-1 py-2 text-center text-[9px] font-extrabold text-[#6b7280] md:px-3 md:text-[11px] ${i < 3 ? "border-r" : ""}`}
                                >
                                  <Tooltip content={g.tooltip}>
                                    <span className="md:hidden">{g.label === "친구공유" ? "공유" : g.label}</span>
                                    <span className="hidden md:inline">{g.label} 랭킹</span>
                                  </Tooltip>
                                </th>
                              ))}
                            </tr>
                            <tr>
                              {RANK_GROUPS.map((g, gi) => (["전체", store.category || "업종"] as const).map((label, li) => <th key={`${gi}-${label}`} className={`truncate border-b border-[#e5e7eb] px-0.5 py-1.5 text-center text-[9px] font-semibold text-[#9ca3af] md:px-3 md:text-[10px] ${li === 1 && gi < 3 ? "border-r" : ""}`}>{label}</th>))}
                            </tr>
                          </thead>
                          <tbody>
                            {latestRow ? (
                              <tr className="bg-white">
                                <td className="break-keep border-r border-[#f3f4f6] px-1 py-2 text-[9px] font-semibold leading-tight text-[#6b7280] md:px-4 md:py-3 md:text-[11px]">{latestRow.date}</td>
                                {RANK_GROUPS.map((g, gi) => (
                                  <React.Fragment key={gi}>
                                    <td className="px-0.5 py-2 text-center text-[10px] font-bold leading-tight text-[#6b7280] md:px-3 md:py-3 md:text-[12px]">{latestRow[g.allKey] || "-"}</td>
                                    <td className={`px-0.5 py-2 text-center text-[10px] font-bold leading-tight md:px-3 md:py-3 md:text-[12px] ${gi < 3 ? "border-r border-[#f3f4f6]" : ""} ${latestRow[g.catKey] && latestRow[g.catKey] !== "-" && latestRow[g.catKey] !== "100위 밖" ? "text-[#2563EB]" : "text-[#d1d5db]"}`}>{latestRow[g.catKey] || "-"}</td>
                                  </React.Fragment>
                                ))}
                              </tr>
                            ) : <tr><td colSpan={9} className="px-3 py-5 text-center text-[12px] text-[#9ca3af] md:px-4 md:py-6">아직 순위 데이터가 없습니다.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-right text-[10px] text-[#9ca3af] md:text-[11px]">마지막 업데이트: <span className="font-semibold text-[#6b7280]">{store.latestUpdatedAt || "-"}</span></p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[760px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">REGISTER STORE</p>
                    <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">매장 등록</h2>
                    <p className="mt-2 text-[14px] text-[#6b7280]">추적할 카카오맵 매장을 검색하여 등록하세요.</p>
                  </div>
                  <button onClick={closeRegisterModal} className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]">닫기</button>
                </div>
              </div>
              <div className="px-6 py-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handlePlaceSearch()}
                    placeholder="예: 뉴오더클럽 한남"
                    className="h-[50px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[15px] outline-none transition focus:border-[#2563eb] focus:bg-white"
                  />
                  <button
                    onMouseEnter={() => setModalSearchHovered(true)} onMouseLeave={() => setModalSearchHovered(false)}
                    onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setModalSearchMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
                    onClick={handlePlaceSearch} disabled={placeSearchLoading}
                    className="relative isolate inline-flex h-[50px] min-w-[120px] items-center justify-center overflow-hidden rounded-[16px] bg-[#333333] px-5 text-[15px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                  >
                    <span className="relative z-30 pointer-events-none">{placeSearchLoading ? "검색 중..." : "매장 검색"}</span>
                    <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: modalSearchHovered ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                    <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out ${modalSearchHovered ? "opacity-100" : "opacity-0"}`} style={{ left: `${modalSearchMousePos.x}px`, top: `${modalSearchMousePos.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light" }} />
                  </button>
                </div>
                {placeSearchError && <div className="mt-4 rounded-[14px] border border-[#fecaca] px-4 py-3 text-[14px] text-[#dc2626]">{placeSearchError}</div>}
                <div className="mt-5 max-h-[380px] space-y-3 overflow-y-auto pr-1">
                  {placeResults.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-5 py-10 text-center text-[14px] text-[#9ca3af]">검색 결과가 여기에 표시됩니다.</div>
                  ) : (
                    placeResults.map((item, idx) => {
                      const itemKey = `${item.kakaoId}-${idx}`;
                      return (
                        <div key={itemKey} className="flex flex-col gap-4 rounded-[18px] border border-[#e5e7eb] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)] sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 gap-4">
                            {item.image ? <img src={item.image} alt={item.title} className="h-[60px] w-[60px] shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb]" /> : <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[11px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">이미지</div>}
                            <div className="min-w-0"><div className="text-[15px] font-black text-[#111827]">{item.title}</div><div className="text-[12px] font-semibold text-[#4b5563]">{item.category}</div><div className="text-[12px] text-[#6b7280]">{item.address}</div></div>
                          </div>
                          <button
                            onMouseEnter={() => setRegisterHover({ id: itemKey, x: 0, y: 0 })} onMouseLeave={() => setRegisterHover({ id: null, x: 0, y: 0 })}
                            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setRegisterHover({ id: itemKey, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                            onClick={() => handleRegisterStore(item)}
                            className="relative isolate inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out"
                          >
                            <span className="relative z-30 pointer-events-none">이 매장 등록</span>
                            <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: registerHover.id === itemKey ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                            <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out ${registerHover.id === itemKey ? "opacity-100" : "opacity-0"}`} style={{ left: `${registerHover.x}px`, top: `${registerHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }} />
                          </button>
                        </div>
                      );
                    })
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
