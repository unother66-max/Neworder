"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin } from "lucide-react";
import Tooltip from "@/components/Tooltip";

type KakaoRankRow = {
  id: string;
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

type KakaoStoreDetail = {
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

const RANK_GROUPS = [
  {
    label: "검색 랭킹",
    allKey: "searchAll",
    catKey: "searchCat",
    tooltip: "해당지역에서 검색시 업체가 노출되는 순위입니다.",
  },
  {
    label: "길찾기 랭킹",
    allKey: "directionAll",
    catKey: "directionCat",
    tooltip: "해당지역에서 길찾기를 많이 누른 매장 순위입니다.",
  },
  {
    label: "즐겨찾기 랭킹",
    allKey: "favoriteAll",
    catKey: "favoriteCat",
    tooltip: "해당지역에서 저장한 횟수를 기준으로 한 인기 순위입니다.",
  },
  {
    label: "친구공유 랭킹",
    allKey: "shareAll",
    catKey: "shareCat",
    tooltip: "해당지역에서 카카오톡 등으로 많이 공유된 매장의 순위입니다.",
  },
] as const;

function parseRankValue(rank?: string | number | null): number | null {
  if (rank === null || rank === undefined || rank === "" || rank === "-" || rank === "100위 밖") return null;
  if (typeof rank === "number") return Number.isFinite(rank) && rank > 0 ? rank : null;
  const matched = String(rank).match(/\d+/);
  if (!matched) return null;
  const num = Number(matched[0]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getRankChangeValue(
  previousRank?: string | number | null,
  currentRank?: string | number | null
): number | null {
  const prev = parseRankValue(previousRank);
  const curr = parseRankValue(currentRank);
  if (prev === null || curr === null) return null;
  return prev - curr;
}

function getRankChangeUi(rankChange?: number | null) {
  if (rankChange === null || rankChange === undefined || rankChange === 0) {
    return { text: "-", className: "text-[#9ca3af]" };
  }
  if (rankChange > 0) {
    return { text: `▲ ${rankChange}`, className: "text-[#ef4444]" };
  }
  return { text: `▼ ${Math.abs(rankChange)}`, className: "text-[#2563eb]" };
}

export default function KakaoRankingDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const placeId = String(params.id ?? "");

  const [mounted, setMounted] = useState(false);
  const [store, setStore] = useState<KakaoStoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // --- 디자인 통일용 상태값 ---
  const [updateHover, setUpdateHover] = useState(false);
  const [updateMousePos, setUpdateMousePos] = useState({ x: 0, y: 0 });
  const [trackingHover, setTrackingHover] = useState(false);
  const [trackingMousePos, setTrackingMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  const fetchDetail = useCallback(async () => {
    if (!placeId) return;
    try {
      setLoading(true);
      setFetchError(null);
      const res = await fetch(`/api/kakao-place-detail?id=${placeId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFetchError(data?.message || "상세 정보를 불러오지 못했습니다.");
        return;
      }
      setStore(data.place);
    } catch (e) {
      setFetchError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [placeId]);

  useEffect(() => {
    if (!mounted || !session) return;
    fetchDetail();
  }, [mounted, session, fetchDetail]);

  const handleCheckRank = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch("/api/check-kakao-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ placeId }),
      });
      if (res.ok) await fetchDetail();
      else alert("순위 조회 실패");
    } finally {
      setChecking(false);
    }
  };

  const handleToggleTracking = async () => {
    if (!store || trackingLoading) return;
    setTrackingLoading(true);
    const nextValue = !store.isAutoTracking;
    try {
      const res = await fetch("/api/kakao-toggle-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: store.id, enabled: nextValue }),
      });
      if (res.ok) setStore((prev) => (prev ? { ...prev, isAutoTracking: nextValue } : prev));
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleTogglePin = async () => {
    if (!store || pinning) return;
    setPinning(true);
    try {
      const res = await fetch("/api/place-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: store.id }),
      });
      if (res.ok) await fetchDetail();
    } finally {
      setPinning(false);
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

  if (!loading && fetchError) {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f8fafc] pt-24">
          <p className="text-[15px] text-[#6b7280]">{fetchError}</p>
          <button type="button" onClick={() => router.back()} className="rounded-[14px] border border-[#d1d5db] bg-white px-5 py-2 text-[14px] font-bold text-[#111827] hover:bg-[#f9fafb]">← 목록으로</button>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="kakao-ranking" />
      <main className="min-h-screen bg-[#f8fafc] text-[#111111] pt-24">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">

          <button type="button" onClick={() => router.push("/kakao-ranking")} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] transition hover:text-[#111827]">
            ← 목록으로
          </button>

          {loading || !store ? (
            <div className="flex items-center justify-center py-24 text-[14px] text-[#9ca3af]">불러오는 중...</div>
          ) : (
            <>
              <div className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${store.isPinned ? "border-[#2563EB]/30" : "border-[#e5e7eb]"}`}>
                <div className="px-5 py-5 md:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-4">
                      {store.imageUrl ? <img src={store.imageUrl} alt={store.name} className="h-[72px] w-[72px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]" referrerPolicy="no-referrer" /> : <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">이미지</div>}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {store.isPinned && <Pin className="h-[14px] w-[14px] fill-[#2563EB] stroke-[#2563EB]" />}
                          <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827]">{store.name}</h1>
                          {store.category && <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">{store.category}</span>}
                        </div>
                        <p className="mt-1 text-[13px] text-[#6b7280]">{store.address || "-"}</p>
                        {store.kakaoUrl && <a href={store.kakaoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111827] hover:bg-[#f9fafb]">카카오맵 보기 ↗</a>}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={handleTogglePin} disabled={pinning} className={`inline-flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border transition ${store.isPinned ? "border-[#2563EB] bg-white" : "border-[#d1d5db] bg-white hover:bg-[#f9fafb]"} ${pinning ? "opacity-60" : ""}`} aria-label="상단 고정">
                        <Pin className={`h-[18px] w-[18px] ${store.isPinned ? "fill-[#2563EB] stroke-[#2563EB]" : "stroke-[#6b7280]"}`} strokeWidth={2} />
                      </button>

                      <button
                        onClick={handleToggleTracking} disabled={trackingLoading}
                        onMouseEnter={() => setTrackingHover(true)} onMouseLeave={() => setTrackingHover(false)}
                        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTrackingMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
                        className={`relative isolate inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] px-4 text-[14px] font-bold transition-all duration-300 ease-in-out disabled:opacity-60 ${store.isAutoTracking ? "bg-[#2563EB] text-white" : trackingHover ? "border border-[#2563EB] text-white" : "border border-[#d1d5db] bg-white text-[#111827]"}`}
                      >
                        <span className="relative z-30 pointer-events-none">{trackingLoading ? "처리 중..." : `자동추적 ${store.isAutoTracking ? "ON" : "OFF"}`}</span>
                        <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: trackingHover ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                        <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out ${trackingHover ? "opacity-100" : "opacity-0"}`} style={{ left: `${trackingMousePos.x}px`, top: `${trackingMousePos.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light" }} />
                      </button>

                      <button
                        onClick={handleCheckRank} disabled={checking}
                        onMouseEnter={() => setUpdateHover(true)} onMouseLeave={() => setUpdateHover(false)}
                        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setUpdateMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
                        className="relative isolate inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-5 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                      >
                        <span className="relative z-30 pointer-events-none">{checking ? "업데이트 중..." : "업데이트"}</span>
                        <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: updateHover ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                        <div className={`absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out ${updateHover ? "opacity-100" : "opacity-0"}`} style={{ left: `${updateMousePos.x}px`, top: `${updateMousePos.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4 md:px-6">
                  <div><h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">랭킹 히스토리</h2><p className="mt-0.5 text-[12px] text-[#6b7280]">업종 기준 지역 랭킹 변화 (최신순)</p></div>
                  <div className="text-[11px] text-[#9ca3af]">마지막 업데이트: <span className="font-semibold text-[#6b7280]">{store.latestUpdatedAt || "-"}</span></div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#f9fafb]">
                      <tr>
                        <th rowSpan={2} className="border-b border-r border-[#e5e7eb] px-4 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">날짜</th>
                        {RANK_GROUPS.map((g, i) => <th key={g.label} colSpan={2} className={`border-b border-[#e5e7eb] px-4 py-2.5 text-center text-[12px] font-extrabold text-[#6b7280] ${i < 3 ? "border-r" : ""}`}><Tooltip content={g.tooltip}><span>{g.label}</span></Tooltip></th>)}
                      </tr>
                      <tr>{RANK_GROUPS.map((g, gi) => (["전체", store.category || "업종"] as const).map((label, li) => <th key={`${gi}-${li}`} className={`border-b border-[#e5e7eb] px-3 py-2 text-center text-[11px] font-semibold text-[#9ca3af] ${li === 1 && gi < 3 ? "border-r" : ""}`}>{label}</th>))}</tr>
                    </thead>
                    <tbody>
                      {store.rankRows.length === 0 ? (
                        <tr><td colSpan={9} className="px-5 py-14 text-center text-[14px] text-[#9ca3af]">아직 순위 데이터가 없습니다.</td></tr>
                      ) : (
                        store.rankRows.map((row, i) => {
                          const prevRow = store.rankRows[i + 1] ?? null;
                          return (
                            <tr key={row.id || i} className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]">
                              <td className="border-r border-[#f3f4f6] px-4 py-4 text-[12px] font-semibold text-[#6b7280]">{row.date}</td>
                              {RANK_GROUPS.map((g, gi) => {
                                const allChange = getRankChangeUi(getRankChangeValue(prevRow?.[g.allKey], row[g.allKey]));
                                const catChange = getRankChangeUi(getRankChangeValue(prevRow?.[g.catKey], row[g.catKey]));
                                return (
                                  <React.Fragment key={gi}>
                                    <td className="px-3 py-3 text-center"><div className="text-[13px] font-bold text-[#6b7280]">{row[g.allKey] || "-"}</div><div className={`mt-0.5 text-[11px] font-bold ${allChange.className}`}>{allChange.text}</div></td>
                                    <td className={`px-3 py-3 text-center ${gi < 3 ? "border-r border-[#f3f4f6]" : ""}`}><div className={`text-[13px] font-bold ${row[g.catKey] && row[g.catKey] !== "-" && row[g.catKey] !== "100위 밖" ? "text-[#111827]" : "text-[#d1d5db]"}`}>{row[g.catKey] || "-"}</div><div className={`mt-0.5 text-[11px] font-bold ${catChange.className}`}>{catChange.text}</div></td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}