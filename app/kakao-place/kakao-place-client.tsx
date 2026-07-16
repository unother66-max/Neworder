"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin, Trash2 } from "lucide-react";
import {
  LoginRequiredModal,
  PublicPreviewBanner,
  useLoginRequiredPreview,
} from "@/components/login-required-preview";

const MAX_KEYWORDS = 10;

// ─── Types ──────────────────────────────────────────────────────────────────

type KwItem = {
  id: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  isTracking: boolean;
  latestRank: number | null;
  latestRankDate: string | null;
};

type KakaoPlaceStore = {
  id: string;
  kakaoId: string | null;
  name: string;
  category: string;
  address: string;
  kakaoUrl: string;
  imageUrl: string | null;
  isPinned: boolean;
  isAutoTracking: boolean;
  keywords: KwItem[];
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

const SAMPLE_KAKAO_PLACE_STORES: KakaoPlaceStore[] = [
  {
    id: "sample-kakao-place-1",
    kakaoId: "sample-kakao-place-1",
    name: "포스트랩스 성수 카페",
    category: "카페",
    address: "서울 성동구 성수이로 7",
    kakaoUrl: "https://place.map.kakao.com/",
    imageUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=800&auto=format&fit=crop",
    isPinned: true,
    isAutoTracking: true,
    latestUpdatedAt: "05/21 10:30",
    keywords: [
      { id: "sample-kakao-place-kw-1", keyword: "성수 카페", mobileVolume: 36000, pcVolume: 6100, totalVolume: 42100, isTracking: true, latestRank: 3, latestRankDate: "05/21" },
      { id: "sample-kakao-place-kw-2", keyword: "서울숲 카페", mobileVolume: 24400, pcVolume: 4200, totalVolume: 28600, isTracking: true, latestRank: 8, latestRankDate: "05/21" },
    ],
  },
  {
    id: "sample-kakao-place-2",
    kakaoId: "sample-kakao-place-2",
    name: "포스트랩스 강남 클리닉",
    category: "병원, 의원",
    address: "서울 강남구 테헤란로 24",
    kakaoUrl: "https://place.map.kakao.com/",
    imageUrl: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=800&auto=format&fit=crop",
    isPinned: false,
    isAutoTracking: false,
    latestUpdatedAt: "05/21 09:45",
    keywords: [
      { id: "sample-kakao-place-kw-3", keyword: "강남 피부관리", mobileVolume: 8100, pcVolume: 1500, totalVolume: 9600, isTracking: false, latestRank: 12, latestRankDate: "05/21" },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtVolume(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString();
}

function fmtRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "-";
  if (rank <= 0) return "45위 밖";
  return `${rank}위`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KakaoPlacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [stores, setStores] = useState<KakaoPlaceStore[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState("");
  const [searchText, setSearchText] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [trackingLoadingId, setTrackingLoadingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // --- 디자인 통일용 호버 및 마우스 상태값 ---
  const [isAddHovered, setIsAddHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const [updateHover, setUpdateHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [rankChangeHover, setRankChangeHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [trackingHover, setTrackingHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [kwManageHover, setKwManageHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });

  // 모달 안쪽 버튼 호버 상태값
  const [modalSearchHovered, setModalSearchHovered] = useState(false);
  const [modalSearchMousePos, setModalSearchMousePos] = useState({ x: 0, y: 0 });
  const [modalRegHover, setModalRegHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [kwSaveHovered, setKwSaveHovered] = useState(false);
  const [kwSaveMousePos, setKwSaveMousePos] = useState({ x: 0, y: 0 });
  const isPreview = mounted && status === "unauthenticated";
  const { loginRequiredOpen, previewCapture, closeLoginRequired } =
    useLoginRequiredPreview(isPreview);

  // 마우스 이동 핸들러들
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleUpdateMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setUpdateHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleRankChangeMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRankChangeHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleTrackingMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTrackingHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleKwManageMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setKwManageHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleModalSearchMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setModalSearchMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleModalRegMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setModalRegHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleKwSaveMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setKwSaveMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // 매장등록 모달
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regQuery, setRegQuery] = useState("");
  const [regResults, setRegResults] = useState<KakaoSearchItem[]>([]);
  const [regSearchLoading, setRegSearchLoading] = useState(false);
  const [regSearchError, setRegSearchError] = useState("");
  const [regSavingId, setRegSavingId] = useState<string | null>(null);

  // 키워드 관리 모달
  const [kwModalStore, setKwModalStore] = useState<KakaoPlaceStore | null>(null);
  const [kwInput, setKwInput] = useState("");
  const [tempKeywords, setTempKeywords] = useState<string[]>([]);
  const [deletingKwKey, setDeletingKwKey] = useState<string | null>(null);
  const [kwSaving, setKwSaving] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || status !== "unauthenticated") return;
    setStores(SAMPLE_KAKAO_PLACE_STORES);
    setStoreLoading(false);
  }, [mounted, status]);

  const fetchStores = useCallback(async () => {
    setStoreLoading(true);
    setStoreError("");
    try {
      const res = await fetch("/api/kakao-keyword-place-list", { cache: "no-store", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(
          typeof data?.message === "string" && data.message.trim()
            ? data.message
            : "카카오맵 매장 목록을 불러오지 못했습니다."
        );
      }
      if (!Array.isArray(data.places)) {
        throw new Error("카카오맵 매장 목록 응답 형식이 올바르지 않습니다.");
      }
      setStores(data.places);
    } catch (e) {
      console.warn("[kakao-place] fetchStores error:", e);
      setStoreError(
        e instanceof Error
          ? e.message
          : "카카오맵 매장 목록을 불러오지 못했습니다."
      );
    } finally {
      setStoreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !session) return;
    fetchStores();
  }, [mounted, session, fetchStores]);

  const filteredStores = stores.filter((s) =>
    !searchText.trim() || s.name.includes(searchText.trim()) || s.address.includes(searchText.trim())
  );

  // ── Store actions ─────────────────────────────────────────────────────────

  const handleUpdate = async (store: KakaoPlaceStore) => {
    if (updatingId) return;
    if (store.keywords.length === 0) { alert("먼저 키워드를 등록해주세요."); return; }
    setUpdatingId(store.id);
    try {
      const res = await fetch("/api/check-kakao-keyword-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ placeId: store.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.error || "업데이트 실패"); return; }
      await fetchStores();
    } catch (e) {
      console.warn(e);
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleTracking = async (store: KakaoPlaceStore) => {
    if (trackingLoadingId) return;
    setTrackingLoadingId(store.id);
    const next = !store.isAutoTracking;
    try {
      const res = await fetch("/api/toggle-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: store.id, isTracking: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.message || "자동추적 변경 실패"); return; }
      setStores((prev) => prev.map((s) => s.id === store.id
        ? { ...s, isAutoTracking: next, keywords: s.keywords.map((k) => ({ ...k, isTracking: next })) }
        : s
      ));
    } catch (e) {
      console.warn(e);
    } finally {
      setTrackingLoadingId(null);
    }
  };

  const handleTogglePin = async (store: KakaoPlaceStore) => {
    if (pinningId) return;
    setPinningId(store.id);
    try {
      const res = await fetch("/api/place-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: store.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data?.message || "핀 변경 실패"); return; }
      await fetchStores();
    } catch (e) {
      console.warn(e);
    } finally {
      setPinningId(null);
    }
  };

  const handleDelete = async (storeId: string) => {
    if (!confirm("매장을 삭제하시겠습니까?")) return;
    setDeletingId(storeId);
    try {
      const res = await fetch("/api/kakao-keyword-place-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: storeId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.message || "삭제 실패"); return; }
      setStores((prev) => prev.filter((s) => s.id !== storeId));
    } catch (e) {
      console.warn(e);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Register modal ────────────────────────────────────────────────────────

  const handleRegSearch = async () => {
    const q = regQuery.trim();
    if (!q) return;
    setRegSearchLoading(true);
    setRegSearchError("");
    try {
      const res = await fetch("/api/search-kakao-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setRegSearchError(data.error || "검색 실패"); return; }
      setRegResults(data.items ?? []);
    } catch (e) {
      console.warn(e);
      setRegSearchError("검색 중 오류가 발생했습니다.");
    } finally {
      setRegSearchLoading(false);
    }
  };

  const handleRegSave = async (item: KakaoSearchItem) => {
    if (regSavingId) return;
    setRegSavingId(item.kakaoId);
    try {
      const res = await fetch("/api/kakao-place-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.title, category: item.category, address: item.address,
          kakaoUrl: item.kakaoUrl, kakaoId: item.kakaoId, x: item.x, y: item.y,
          type: "kakao-place",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { alert(data.error || "등록 실패"); return; }
      setRegisterOpen(false);
      setRegQuery(""); setRegResults([]);
      await fetchStores();
    } catch (e) {
      console.warn(e);
      alert("등록 중 오류가 발생했습니다.");
    } finally {
      setRegSavingId(null);
    }
  };

  // ── Keyword modal ──────────────────────────────────────

  const openKwModal = (store: KakaoPlaceStore) => {
    setKwModalStore(store);
    setTempKeywords(store.keywords.map((k) => k.keyword));
    setKwInput("");
    setDeletingKwKey(null);
  };

  const closeKwModal = () => {
    setKwModalStore(null);
    setTempKeywords([]);
    setKwInput("");
    setDeletingKwKey(null);
  };

  const addDirectKeywords = () => {
    const parts = kwInput.split(",").map((s) => s.trim()).filter(Boolean);
    setTempKeywords((prev) => {
      const next = [...prev];
      for (const kw of parts) {
        if (next.includes(kw)) continue;
        if (next.length >= MAX_KEYWORDS) {
          alert(`키워드는 매장당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
          break;
        }
        next.push(kw);
      }
      return next;
    });
    setKwInput("");
  };

  const removeTempKeyword = async (kw: string) => {
    if (!kwModalStore || deletingKwKey) return;
    const existing = kwModalStore.keywords.find((k) => k.keyword === kw);
    if (existing) {
      setDeletingKwKey(kw);
      try {
        const res = await fetch("/api/place-keyword-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeKeywordId: existing.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) { alert(data.error || "삭제 실패"); return; }
        const updated = { ...kwModalStore, keywords: kwModalStore.keywords.filter((k) => k.keyword !== kw) };
        setKwModalStore(updated);
        setStores((prev) => prev.map((s) => s.id === updated.id ? updated : s));
      } catch (e) {
        console.warn(e);
      } finally {
        setDeletingKwKey(null);
      }
    }
    setTempKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const saveKeywords = async () => {
    if (!kwModalStore || kwSaving) return;
    const existingSet = new Set(kwModalStore.keywords.map((k) => k.keyword));
    const toCreate = tempKeywords.filter((kw) => !existingSet.has(kw));
    if (toCreate.length === 0) { closeKwModal(); return; }
    if (kwModalStore.keywords.length + toCreate.length > MAX_KEYWORDS) {
      alert(`키워드는 매장당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
      return;
    }
    setKwSaving(true);
    try {
      await Promise.all(toCreate.map(async (kw) => {
        const res = await fetch("/api/place-keyword-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: kwModalStore.id, keyword: kw }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `${kw} 저장 실패`);
      }));
      await fetchStores();
      closeKwModal();
    } catch (e) {
      console.warn(e);
      alert(e instanceof Error ? e.message : "키워드 저장 중 오류가 났어요.");
    } finally {
      setKwSaving(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-place" />
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] pt-24">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <TopNav active="kakao-place" />
      <main
        className="min-h-screen bg-[#f8fafc] pt-20 text-[#111111] md:pt-24"
        onClickCapture={previewCapture}
      >
        {isPreview ? <PublicPreviewBanner /> : null}
        <section className="mx-auto max-w-[1240px] px-3 py-2 md:px-6 md:py-5 lg:px-8">

          {/* Page header */}
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-2.5 md:gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    카카오맵 순위 추적
                  </h2>
                  <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-bold text-[#2563eb] md:py-1 md:text-[11px]">
                    KAKAO
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">
                  카카오맵에 등록된 가게의 키워드별 순위를 확인할 수 있습니다.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row md:gap-3 lg:w-auto lg:items-center">
              <div className="relative hidden w-full sm:block sm:w-[320px]">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="등록된 매장 검색"
                    className="h-[40px] w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[12px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white md:h-[44px] md:rounded-[14px] md:px-4 md:pr-11 md:text-[13px]"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#6b7280] md:right-4 md:text-[14px]">
                    🔍
                  </div>
                </div>
                <button
                  onMouseEnter={() => setIsAddHovered(true)}
                  onMouseLeave={() => setIsAddHovered(false)}
                  onMouseMove={handleMouseMove}
                  onClick={() => setRegisterOpen(true)}
                  className="relative inline-flex h-[40px] min-w-[96px] items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out md:h-[44px] md:min-w-[108px] md:rounded-[14px] md:px-4 md:text-[13px]"
                >
                  <span className="relative z-30 pointer-events-none">매장 등록</span>
                  <div
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{
                      transformOrigin: "left",
                      transform: isAddHovered ? "scaleX(1)" : "scaleX(0)",
                      transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                      backgroundColor: "#2563EB",
                    }}
                  />
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                    style={{
                      left: `${mousePos.x}px`,
                      top: `${mousePos.y}px`,
                      opacity: isAddHovered ? 1 : 0,
                      pointerEvents: "none",
                      zIndex: 25,
                      backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                      mixBlendMode: "soft-light",
                      filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                    }}
                  />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#f3f4f6] pt-2 md:mt-3 md:gap-2 md:pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-black tracking-[-0.02em] text-[#111827] md:text-[17px]">
                    등록된 매장
                  </h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:px-2.5 md:py-1 md:text-[11px]">
                    {filteredStores.length}개
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#6b7280] md:mt-2 md:text-[12px]">
                  {storeLoading
                    ? "📍 매장 목록 불러오는 중..."
                    : storeError
                      ? "⚠️ 매장 목록을 불러오지 못했습니다."
                      : "📍 카카오맵 순위 추적 중"}
                </p>
              </div>
              <div className="text-[10px] leading-4 text-[#6b7280] md:text-[11px] md:text-[#9ca3af]">
                * 검색 순위는 키워드 검색 시 카카오맵 결과 기준입니다. (최대 45위)
              </div>
            </div>
          </div>

          {/* Store list */}
          <div className="mt-2.5 space-y-3 md:mt-5 md:space-y-4">
            {storeLoading ? (
              <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-10 text-center text-[13px] text-[#9ca3af] md:rounded-[22px] md:px-6 md:py-14 md:text-[14px]">불러오는 중...</div>
            ) : storeError ? (
              <div className="rounded-[18px] border border-red-200 bg-white px-4 py-10 text-center shadow-[0_4px_18px_rgba(15,23,42,0.025)] md:rounded-[22px] md:px-6 md:py-14 md:shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[15px] font-bold text-red-600 md:text-[18px]">매장 목록을 불러오지 못했어요</p>
                <p className="mt-2 text-[12px] text-[#6b7280] md:text-[14px]">{storeError}</p>
                <button
                  type="button"
                  onClick={() => void fetchStores()}
                  className="mt-4 rounded-[10px] bg-[#333333] px-4 py-2 text-[12px] font-bold text-white transition hover:bg-[#2563EB] md:text-[13px]"
                >
                  다시 시도
                </button>
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-white px-4 py-10 text-center shadow-[0_4px_18px_rgba(15,23,42,0.025)] md:rounded-[22px] md:px-6 md:py-14 md:shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[15px] font-bold text-[#111827] md:text-[18px]">아직 등록된 매장이 없어요</p>
                <p className="mt-2 text-[12px] text-[#9ca3af] md:text-[14px]">상단의 매장 등록 버튼으로 첫 매장을 추가해보세요.</p>
              </div>
            ) : (
              filteredStores.map((store) => (
                <div
                  key={store.id}
                  className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="px-3 py-2.5 md:px-6 md:py-4">
                    <div className="flex flex-col gap-2.5 md:gap-4 xl:flex-row xl:items-start xl:justify-between">

                      {/* Info */}
                      <div className="flex min-w-0 gap-2.5 md:gap-4">
                        {store.imageUrl ? (
                          <img
                            src={store.imageUrl} alt={store.name}
                            className="h-12 w-12 shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px]"
                            loading="lazy" referrerPolicy="no-referrer"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[10px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px] md:text-[12px]">이미지</div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-wrap md:gap-2">
                              <h3 className="truncate text-[15px] font-black tracking-[-0.03em] text-[#111827] md:text-[20px]">{store.name}</h3>
                              {store.category && (
                                <span className="max-w-[88px] shrink-0 truncate rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:max-w-none md:px-2.5 md:py-1 md:text-[11px]">{store.category}</span>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-1 md:hidden">
                              {store.kakaoUrl ? (
                                <a href={store.kakaoUrl} target="_blank" rel="noreferrer"
                                  className="inline-flex h-6 items-center rounded-full border border-[#d1d5db] bg-white px-2 text-[10px] font-bold text-[#111827] transition hover:bg-[#f9fafb]">
                                  카카오맵
                                </a>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleDelete(store.id)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#fecdd3] bg-[#fff1f2] text-[#dc2626] transition hover:border-[#fda4af] hover:bg-[#ffe4e6] active:bg-[#fecdd3]"
                                aria-label="삭제"
                              >
                                <Trash2 className="h-4 w-4 stroke-[#dc2626]" strokeWidth={2} />
                              </button>
                            </div>
                          </div>
                          <p className="mt-0.5 truncate text-xs leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">{store.address || "-"}</p>
                          <div className="mt-1.5 flex justify-end md:hidden">
                            <button
                              type="button"
                              onClick={() => handleToggleTracking(store)}
                              disabled={trackingLoadingId === store.id}
                              className={`flex h-10 min-w-0 flex-col justify-center rounded-[10px] border px-1.5 text-left transition active:scale-[0.98] ${
                                store.isAutoTracking
                                  ? "border-[#2563EB] bg-[#2563EB] text-white"
                                  : "border-[#e5e7eb] bg-[#f3f4f6] text-[#374151]"
                              } ${trackingLoadingId === store.id ? "opacity-60" : ""}`}
                            >
                              <span className={`truncate text-[10px] font-semibold leading-none ${
                                store.isAutoTracking ? "text-white/85" : "text-[#4b5563]"
                              }`}>
                                자동 추적
                              </span>
                              <span className={`mt-1 truncate text-sm font-semibold leading-none ${
                                store.isAutoTracking ? "text-white" : "text-[#111827]"
                              }`}>
                                {trackingLoadingId === store.id ? "처리 중" : store.isAutoTracking ? "ON" : "OFF"}
                              </span>
                            </button>
                          </div>
                          <div className="mt-1 hidden flex-wrap items-center gap-1.5 text-[11px] md:mt-2 md:flex md:gap-2 md:text-[12px]">
                            <span className="font-semibold text-[#6b7280]">바로가기</span>
                            {store.kakaoUrl ? (
                              <a href={store.kakaoUrl} target="_blank" rel="noreferrer"
                                className="inline-flex h-6 items-center rounded-full border border-[#d1d5db] bg-white px-2 text-[10px] font-bold text-[#111827] transition hover:bg-[#f9fafb] md:h-auto md:px-3 md:py-1.5 md:text-[12px]">
                                카카오맵
                              </a>
                            ) : (
                              <span className="text-[#c0c6d0]">카카오맵 없음</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="ml-5 flex w-[calc(100%-1.25rem)] flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:ml-0 md:w-auto md:gap-2 xl:overflow-visible">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(store)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white transition hover:bg-[#f9fafb] md:h-[42px] md:w-[42px] md:rounded-[14px]"
                          aria-label="핀 고정"
                        >
                          <Pin className={`h-4 w-4 transition md:h-[20px] md:w-[20px] ${store.isPinned ? "fill-[#2563EB] stroke-[#2563EB]" : "stroke-[#6b7280]"}`} strokeWidth={2} />
                        </button>

                        <button
                          onClick={() => handleUpdate(store)}
                          disabled={updatingId === store.id}
                          onMouseEnter={() => setUpdateHover({ id: store.id, x: updateHover.x, y: updateHover.y })}
                          onMouseLeave={() => setUpdateHover((prev) => prev.id === store.id ? { ...prev, id: null } : prev)}
                          onMouseMove={(e) => handleUpdateMouseMove(e, store.id)}
                          className="relative inline-flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-[13px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60 md:h-[42px] md:flex-none md:shrink-0 md:rounded-[14px] md:px-4"
                        >
                          <span className="relative z-30 pointer-events-none">
                            {updatingId === store.id ? "업데이트 중..." : "업데이트"}
                          </span>
                          <div
                            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                            style={{
                              transformOrigin: "left",
                              transform: updateHover.id === store.id ? "scaleX(1)" : "scaleX(0)",
                              transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                              backgroundColor: "#2563EB",
                            }}
                          />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                            style={{
                              left: `${updateHover.x}px`,
                              top: `${updateHover.y}px`,
                              opacity: updateHover.id === store.id ? 1 : 0,
                              pointerEvents: "none",
                              zIndex: 25,
                              backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                              mixBlendMode: "soft-light",
                              filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                            }}
                          />
                        </button>

                        <button
                          onClick={() => router.push(`/kakao-place/${store.id}`)}
                          onMouseEnter={() => setRankChangeHover({ id: store.id, x: rankChangeHover.x, y: rankChangeHover.y })}
                          onMouseLeave={() => setRankChangeHover((prev) => prev.id === store.id ? { ...prev, id: null } : prev)}
                          onMouseMove={(e) => handleRankChangeMouseMove(e, store.id)}
                          className={`relative isolate inline-flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] border px-2.5 text-[13px] font-bold transition-colors duration-0 ease-in-out md:h-[42px] md:flex-none md:shrink-0 md:rounded-[14px] md:px-4 md:text-[14px] ${rankChangeHover.id === store.id ? "border-[#2563EB] text-white" : "border-[#d1d5db] text-[#111827]"}`}
                        >
                          <span className="relative z-30 pointer-events-none md:hidden">순위변화</span>
                          <span className="relative z-30 pointer-events-none hidden md:inline">순위변화보기</span>
                          <div
                            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
                            style={{
                              transformOrigin: "left",
                              transform: rankChangeHover.id === store.id ? "scaleX(1)" : "scaleX(0)",
                              transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                              backgroundColor: "#2563EB",
                            }}
                          />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                            style={{
                              left: `${rankChangeHover.x}px`,
                              top: `${rankChangeHover.y}px`,
                              opacity: rankChangeHover.id === store.id ? 1 : 0,
                              pointerEvents: "none",
                              zIndex: 25,
                              backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                              mixBlendMode: "soft-light",
                              filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                            }}
                          />
                        </button>

                        <button
                          onClick={() => handleToggleTracking(store)}
                          disabled={trackingLoadingId === store.id}
                          onMouseEnter={() => setTrackingHover({ id: store.id, x: trackingHover.x, y: trackingHover.y })}
                          onMouseLeave={() => setTrackingHover((prev) => prev.id === store.id ? { ...prev, id: null } : prev)}
                          onMouseMove={(e) => handleTrackingMouseMove(e, store.id)}
                          className={`relative hidden h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] px-2.5 text-xs font-bold transition-all duration-300 ease-in-out disabled:opacity-60 md:inline-flex md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px] ${store.isAutoTracking ? "bg-[#2563EB] text-white" : trackingHover.id === store.id ? "border border-[#2563EB] text-white" : "border border-[#d1d5db] bg-white text-[#111827]"}`}
                        >
                          <span className="relative z-30 pointer-events-none">
                            {trackingLoadingId === store.id ? "처리 중" : `자동추적 ${store.isAutoTracking ? "ON" : "OFF"}`}
                          </span>
                          <div
                            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                            style={{
                              transformOrigin: "left",
                              transform: trackingHover.id === store.id ? "scaleX(1)" : "scaleX(0)",
                              transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                              backgroundColor: "#2563EB",
                            }}
                          />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                            style={{
                              left: `${trackingHover.x}px`,
                              top: `${trackingHover.y}px`,
                              opacity: trackingHover.id === store.id ? 1 : 0,
                              pointerEvents: "none",
                              zIndex: 25,
                              backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                              mixBlendMode: "soft-light",
                              filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                            }}
                          />
                        </button>

                        <button
                          onClick={() => openKwModal(store)}
                          onMouseEnter={() => setKwManageHover({ id: store.id, x: kwManageHover.x, y: kwManageHover.y })}
                          onMouseLeave={() => setKwManageHover((prev) => prev.id === store.id ? { ...prev, id: null } : prev)}
                          onMouseMove={(e) => handleKwManageMouseMove(e, store.id)}
                          className="relative inline-flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-[13px] font-bold text-white transition-all duration-300 ease-in-out md:h-[42px] md:flex-none md:shrink-0 md:rounded-[14px] md:px-4 md:text-[14px]"
                        >
                          <span className="relative z-30 pointer-events-none">키워드 관리</span>
                          <div
                            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                            style={{
                              transformOrigin: "left",
                              transform: kwManageHover.id === store.id ? "scaleX(1)" : "scaleX(0)",
                              transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                              backgroundColor: "#2563EB",
                            }}
                          />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                            style={{
                              left: `${kwManageHover.x}px`,
                              top: `${kwManageHover.y}px`,
                              opacity: kwManageHover.id === store.id ? 1 : 0,
                              pointerEvents: "none",
                              zIndex: 25,
                              backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                              mixBlendMode: "soft-light",
                              filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                            }}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(store.id)}
                          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#fecdd3] bg-[#fff1f2] text-[#dc2626] transition hover:border-[#fda4af] hover:bg-[#ffe4e6] active:bg-[#fecdd3] md:inline-flex md:h-[42px] md:w-[42px] md:rounded-[14px] md:border-transparent md:bg-white md:text-[#111827] md:hover:bg-[#f3f4f6]"
                        >
                          <Trash2 className="h-4 w-4 stroke-[#dc2626] md:h-[18px] md:w-[18px] md:stroke-[#111827]" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Keyword table */}
                  <div className="border-t border-[#f3f4f6] px-3 pb-3 md:px-6 md:pb-4">
                    <div className="mb-2 mt-2.5 md:mt-3">
                      <p className="text-[11px] font-semibold text-[#6b7280]">키워드 검색 순위</p>
                    </div>
                    <div className="overflow-x-auto rounded-[12px] border border-[#e5e7eb] overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:rounded-[14px]">
                      <table className="w-full table-fixed border-collapse md:min-w-full md:table-auto">
                        <colgroup>
                          <col className="w-[31%] md:w-auto" />
                          <col className="w-[17%] md:w-auto" />
                          <col className="w-[16%] md:w-auto" />
                          <col className="w-[13%] md:w-auto" />
                          <col className="w-[23%] md:w-auto" />
                        </colgroup>
                        <thead className="bg-[#f9fafb]">
                          <tr>
                            {["키워드", "월 검색량", "모바일", "PC", "검색 순위"].map((h) => (
                              <th key={h} className="border-b border-[#e5e7eb] px-1 py-2 text-center text-[10px] font-extrabold text-[#6b7280] first:text-left md:px-4 md:py-2.5 md:text-[11px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {store.keywords.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-5 text-center text-[12px] text-[#9ca3af] md:px-4 md:py-6">
                                지금 키워드를 등록하고, 내 매장의 키워드 별 순위를 확인해보세요.<br />
                                <span className="font-semibold">[키워드 관리]</span> 버튼을 눌러 시작할 수 있어요.
                              </td>
                            </tr>
                          ) : (
                            store.keywords.map((kw) => (
                              <tr key={kw.id} className="border-t border-[#f3f4f6] bg-white hover:bg-[#fafafa] transition-colors">
                                <td className="truncate px-1 py-2.5 text-[12px] font-semibold text-[#111827] md:px-4 md:py-3 md:text-[13px]">{kw.keyword}</td>
                                <td className="px-1 py-2.5 text-center text-[12px] text-[#6b7280] md:px-4 md:py-3 md:text-[13px]">{fmtVolume(kw.totalVolume)}</td>
                                <td className="px-1 py-2.5 text-center text-[12px] text-[#6b7280] md:px-4 md:py-3 md:text-[13px]">{fmtVolume(kw.mobileVolume)}</td>
                                <td className="px-1 py-2.5 text-center text-[12px] text-[#6b7280] md:px-4 md:py-3 md:text-[13px]">{fmtVolume(kw.pcVolume)}</td>
                                <td className="px-1 py-2.5 text-center md:px-4 md:py-3">
                                  <span className={`text-[12px] font-bold md:text-[13px] ${kw.latestRank && kw.latestRank > 0 ? "text-[#111827]" : "text-[#9ca3af]"}`}>
                                    {fmtRank(kw.latestRank)}
                                  </span>
                                  {kw.latestRankDate && <p className="text-[10px] text-[#9ca3af]">{kw.latestRankDate}</p>}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1.5 text-right text-[10px] text-[#9ca3af] md:mt-2 md:text-[11px]">
                      마지막 업데이트: <span className="font-semibold text-[#6b7280]">{store.latestUpdatedAt || "-"}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
      <LoginRequiredModal open={loginRequiredOpen} onClose={closeLoginRequired} />

      {/* Register Modal */}
      {registerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
          <div className="w-full max-w-[520px] rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-5">
              <h2 className="text-[18px] font-black text-[#111827]">매장 등록</h2>
              <button type="button" onClick={() => { setRegisterOpen(false); setRegQuery(""); setRegResults([]); setRegSearchError(""); }}
                className="text-[22px] leading-none text-[#9ca3af] hover:text-[#111827]">×</button>
            </div>
            <div className="px-6 py-5">
              <div className="flex gap-2">
                <input
                  type="text" placeholder="매장명으로 검색" value={regQuery}
                  onChange={(e) => setRegQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegSearch()}
                  className="flex-1 rounded-[12px] border border-[#e5e7eb] px-4 py-2.5 text-[14px] outline-none transition focus:border-[#2563eb]"
                />
                <button
                  onMouseEnter={() => setModalSearchHovered(true)}
                  onMouseLeave={() => setModalSearchHovered(false)}
                  onMouseMove={handleModalSearchMouseMove}
                  onClick={handleRegSearch}
                  disabled={regSearchLoading}
                  className="relative inline-flex h-[44px] min-w-[80px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-5 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                >
                  <span className="relative z-30 pointer-events-none">{regSearchLoading ? "검색 중" : "검색"}</span>
                  <div
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{
                      transformOrigin: "left",
                      transform: modalSearchHovered ? "scaleX(1)" : "scaleX(0)",
                      transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                      backgroundColor: "#2563EB",
                    }}
                  />
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                    style={{
                      left: `${modalSearchMousePos.x}px`,
                      top: `${modalSearchMousePos.y}px`,
                      opacity: modalSearchHovered ? 1 : 0,
                      pointerEvents: "none",
                      zIndex: 25,
                      backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                      mixBlendMode: "soft-light",
                      filter: "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                    }}
                  />
                </button>
              </div>
              {regSearchError && <p className="mt-2 text-[13px] text-[#dc2626]">{regSearchError}</p>}
              <div className="mt-4 max-h-[360px] overflow-y-auto space-y-2">
                {regResults.length === 0 && !regSearchLoading && (
                  <p className="py-6 text-center text-[13px] text-[#9ca3af]">
                    {regQuery ? "검색 결과가 없습니다." : "위에서 매장명을 검색해주세요."}
                  </p>
                )}
                {regResults.map((item) => (
                  <div key={item.kakaoId} className="flex items-center gap-3 rounded-[14px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="h-[48px] w-[48px] shrink-0 rounded-[10px] object-cover" referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[10px] bg-[#e5e7eb] text-[11px] text-[#9ca3af]">이미지</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-[#111827]">{item.title}</p>
                      <p className="text-[12px] text-[#6b7280]">{item.address}</p>
                      {item.category && <p className="text-[11px] text-[#9ca3af]">{item.category}</p>}
                    </div>
                    <button
                      onMouseEnter={() => setModalRegHover({ id: item.kakaoId, x: modalRegHover.x, y: modalRegHover.y })}
                      onMouseLeave={() => setModalRegHover((prev) => prev.id === item.kakaoId ? { ...prev, id: null } : prev)}
                      onMouseMove={(e) => handleModalRegMouseMove(e, item.kakaoId)}
                      onClick={() => handleRegSave(item)}
                      disabled={regSavingId === item.kakaoId}
                      className="relative inline-flex h-[36px] shrink-0 min-w-[70px] items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-3 text-[13px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                    >
                      <span className="relative z-30 pointer-events-none">{regSavingId === item.kakaoId ? "등록 중" : "등록"}</span>
                      <div
                        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                        style={{
                          transformOrigin: "left",
                          transform: modalRegHover.id === item.kakaoId ? "scaleX(1)" : "scaleX(0)",
                          transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                          backgroundColor: "#2563EB",
                        }}
                      />
                      <div
                        className="absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-xl transition-opacity duration-200 ease-out"
                        style={{
                          left: `${modalRegHover.x}px`,
                          top: `${modalRegHover.y}px`,
                          opacity: modalRegHover.id === item.kakaoId ? 1 : 0,
                          pointerEvents: "none",
                          zIndex: 25,
                          backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                          mixBlendMode: "soft-light",
                          filter: "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                        }}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyword Modal */}
      {kwModalStore && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
          <div className="w-full max-w-[860px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">KEYWORD MANAGER</p>
                  <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">{kwModalStore.name}</h2>
                  <p className="mt-2 text-[14px] text-[#6b7280]">키워드를 직접 입력해서 관리하세요.</p>
                </div>
                <button onClick={closeKwModal} className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]">닫기</button>
              </div>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-6 py-6">
              <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <p className="text-[13px] font-bold text-[#4b5563]">직접 키워드 추가</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text" value={kwInput}
                    onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (e.nativeEvent.isComposing) return;
                      addDirectKeywords();
                    }}
                    placeholder="쉼표(,)로 여러 개 입력 가능"
                    className="h-[48px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[14px] outline-none transition focus:border-[#2563eb] focus:bg-white"
                  />
                  <button onClick={addDirectKeywords} className="h-[48px] rounded-[16px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]">추가</button>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-[#4b5563]">저장 예정 키워드</p>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">{tempKeywords.length}개</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {tempKeywords.length === 0 ? (
                    <div className="w-full rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-8 text-center text-[14px] text-[#9ca3af]">아직 추가된 키워드가 없습니다.</div>
                  ) : (
                    tempKeywords.map((kw, idx) => (
                      <div key={`${kw}-${idx}`} className="inline-flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-[13px] font-bold text-[#111827]">
                        <span>{kw}</span>
                        <button type="button" onClick={() => removeTempKeyword(kw)} disabled={deletingKwKey === kw} className="text-[#dc2626] transition hover:opacity-80">{deletingKwKey === kw ? "..." : "✕"}</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-[#f3f4f6] bg-[#fcfcfc] px-6 py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button onClick={closeKwModal} className="h-[46px] rounded-[14px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]">취소</button>
                <button
                  onMouseEnter={() => setKwSaveHovered(true)}
                  onMouseLeave={() => setKwSaveHovered(false)}
                  onMouseMove={handleKwSaveMouseMove}
                  onClick={saveKeywords}
                  disabled={kwSaving}
                  className="relative inline-flex h-[46px] min-w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-5 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                >
                  <span className="relative z-30 pointer-events-none">{kwSaving ? "저장 중" : "키워드 저장"}</span>
                  <div
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{
                      transformOrigin: "left",
                      transform: kwSaveHovered ? "scaleX(1)" : "scaleX(0)",
                      transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                      backgroundColor: "#2563EB",
                    }}
                  />
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out"
                    style={{
                      left: `${kwSaveMousePos.x}px`,
                      top: `${kwSaveMousePos.y}px`,
                      opacity: kwSaveHovered ? 1 : 0,
                      pointerEvents: "none",
                      zIndex: 25,
                      backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                      mixBlendMode: "soft-light",
                      filter: "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                    }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
