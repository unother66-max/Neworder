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

// app/place와 동일한 증감 헬퍼
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
  return prev - curr; // 양수 = 상승(▲), 음수 = 하락(▼)
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
      console.warn("[kakao-place-detail] fetch error:", e);
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
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "순위 조회 실패");
        return;
      }
      await fetchDetail();
    } catch (e) {
      console.warn("[check-kakao-rank] error:", e);
      alert("순위 조회 중 오류가 났어요.");
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
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data?.message || "자동추적 변경 실패");
        return;
      }
      setStore((prev) => (prev ? { ...prev, isAutoTracking: nextValue } : prev));
    } catch (e) {
      console.error(e);
      alert("자동추적 변경 중 오류가 발생했습니다.");
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
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data?.message || "핀 변경 실패");
        return;
      }
      await fetchDetail();
    } catch (e) {
      console.error(e);
    } finally {
      setPinning(false);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f4f4f5]">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen items-center justify-center bg-[#f4f4f5]">
          <div className="text-[15px] text-[#6b7280]">로그인 페이지로 이동 중...</div>
        </main>
      </>
    );
  }

  if (!loading && fetchError) {
    return (
      <>
        <TopNav active="kakao-ranking" />
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f4f4f5]">
          <p className="text-[15px] text-[#6b7280]">{fetchError}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-[14px] border border-[#d1d5db] bg-white px-5 py-2 text-[14px] font-bold text-[#111827] hover:bg-[#f9fafb]"
          >
            ← 목록으로
          </button>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="kakao-ranking" />
      <main className="min-h-screen bg-[#f4f4f5] text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">

          {/* 뒤로가기 */}
          <button
            type="button"
            onClick={() => router.push("/kakao-ranking")}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] transition hover:text-[#111827]"
          >
            ← 목록으로
          </button>

          {loading || !store ? (
            <div className="flex items-center justify-center py-24 text-[14px] text-[#9ca3af]">
              {loading ? "불러오는 중..." : "매장 정보를 찾을 수 없습니다."}
            </div>
          ) : (
            <>
              {/* Store header card */}
              <div
                className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${
                  store.isPinned ? "border-[#fca5a5]" : "border-[#e5e7eb]"
                }`}
              >
                <div className="px-5 py-5 md:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Info */}
                    <div className="flex min-w-0 gap-4">
                      {store.imageUrl ? (
                        <img
                          src={store.imageUrl}
                          alt={store.name}
                          className="h-[72px] w-[72px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">
                          이미지
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {store.isPinned && (
                            <Pin className="h-[14px] w-[14px] fill-[#b91c1c] stroke-[#b91c1c]" />
                          )}
                          <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                            {store.name}
                          </h1>
                          {store.category && (
                            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                              {store.category}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[13px] text-[#6b7280]">{store.address || "-"}</p>
                        {store.kakaoUrl && (
                          <a
                            href={store.kakaoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                          >
                            카카오맵 보기 ↗
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePin}
                        disabled={pinning}
                        className={`inline-flex h-[36px] w-[36px] items-center justify-center rounded-[14px] border transition ${
                          store.isPinned
                            ? "border-[#fca5a5] bg-white"
                            : "border-[#d1d5db] bg-white hover:bg-[#f9fafb]"
                        } ${pinning ? "opacity-60" : ""}`}
                        aria-label="상단 고정"
                      >
                        <Pin
                          className={`h-[16px] w-[16px] ${
                            store.isPinned
                              ? "fill-[#b91c1c] stroke-[#b91c1c]"
                              : "stroke-[#6b7280]"
                          }`}
                          strokeWidth={2}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={handleToggleTracking}
                        disabled={trackingLoading}
                        className={`inline-flex h-[42px] items-center justify-center rounded-[14px] px-4 text-[14px] font-bold transition ${
                          store.isAutoTracking
                            ? "bg-[#b91c1c] text-white shadow-[0_10px_22px_rgba(185,28,28,0.16)] hover:bg-[#991b1b]"
                            : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                        } ${trackingLoading ? "opacity-60" : ""}`}
                      >
                        {trackingLoading
                          ? "처리 중..."
                          : `자동추적 ${store.isAutoTracking ? "ON" : "OFF"}`}
                      </button>
                      <button
                        type="button"
                        onClick={handleCheckRank}
                        disabled={checking}
                        className={`inline-flex h-[42px] items-center justify-center rounded-[14px] bg-[#111827] px-5 text-[14px] font-bold text-white transition hover:bg-[#1f2937] ${
                          checking ? "opacity-60" : ""
                        }`}
                      >
                        {checking ? "업데이트 중..." : "업데이트"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ranking history table */}
              <div className="mt-4 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4 md:px-6">
                  <div>
                    <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                      랭킹 히스토리
                    </h2>
                    <p className="mt-0.5 text-[12px] text-[#6b7280]">
                      업종 기준 지역 랭킹 변화 (최신순)
                    </p>
                  </div>
                  <div className="text-[11px] text-[#9ca3af]">
                    마지막 업데이트:{" "}
                    <span className="font-semibold text-[#6b7280]">
                      {store.latestUpdatedAt || "-"}
                    </span>
                  </div>
                </div>

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
                            <Tooltip content={g.tooltip}>
                              <span>{g.label}</span>
                            </Tooltip>
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {RANK_GROUPS.map((g, gi) =>
                          (["전체", store.category || "업종"] as const).map((label, li) => (
                            <th
                              key={`${g.label}-${label}-${li}`}
                              className={`border-b border-[#e5e7eb] px-3 py-2 text-center text-[11px] font-semibold text-[#9ca3af] ${
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
                      {store.rankRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-5 py-14 text-center text-[14px] text-[#9ca3af]"
                          >
                            아직 순위 데이터가 없습니다.
                            <br />
                            <span className="text-[13px]">
                              위 &ldquo;업데이트&rdquo; 버튼을 눌러 첫 데이터를 수집하세요.
                            </span>
                          </td>
                        </tr>
                      ) : (
                        store.rankRows.map((row, i) => {
                          const prevRow = store.rankRows[i + 1] ?? null;
                          return (
                            <tr
                              key={row.id || i}
                              className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]"
                            >
                              <td className="border-r border-[#f3f4f6] px-4 py-4 text-[12px] font-semibold text-[#6b7280]">
                                {row.date}
                              </td>
                              {RANK_GROUPS.map((g, gi) => {
                                const allChange = getRankChangeUi(
                                  getRankChangeValue(prevRow?.[g.allKey], row[g.allKey])
                                );
                                const catChange = getRankChangeUi(
                                  getRankChangeValue(prevRow?.[g.catKey], row[g.catKey])
                                );
                                return (
                                  <React.Fragment key={`${g.label}-${gi}`}>
                                    {/* 전체 */}
                                    <td className="px-3 py-3 text-center">
                                      <div className="text-[13px] font-bold text-[#6b7280]">
                                        {row[g.allKey] || "-"}
                                      </div>
                                      <div className={`mt-0.5 text-[11px] font-bold ${allChange.className}`}>
                                        {allChange.text}
                                      </div>
                                    </td>
                                    {/* 업종 */}
                                    <td
                                      className={`px-3 py-3 text-center ${
                                        gi < RANK_GROUPS.length - 1 ? "border-r border-[#f3f4f6]" : ""
                                      }`}
                                    >
                                      <div
                                        className={`text-[13px] font-bold ${
                                          row[g.catKey] && row[g.catKey] !== "-" && row[g.catKey] !== "100위 밖"
                                            ? "text-[#111827]"
                                            : "text-[#d1d5db]"
                                        }`}
                                      >
                                        {row[g.catKey] || "-"}
                                      </div>
                                      <div className={`mt-0.5 text-[11px] font-bold ${catChange.className}`}>
                                        {catChange.text}
                                      </div>
                                    </td>
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
