"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type RankRow = {
  id: string;
  rank: number;
  date: string;
  createdAt: string;
};

type KwDetail = {
  id: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  isTracking: boolean;
  latestRank: number | null;
  history: RankRow[];
};

type PlaceDetail = {
  id: string;
  kakaoId: string | null;
  name: string;
  category: string;
  address: string;
  kakaoUrl: string;
  imageUrl: string | null;
  isPinned: boolean;
  isAutoTracking: boolean;
  keywords: KwDetail[];
  latestUpdatedAt: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "-";
  if (rank <= 0) return "45위 밖";
  return `${rank}위`;
}

function getRankChangeUi(prev: number | null, curr: number | null) {
  if (prev === null || curr === null) return null;
  const diff = prev - curr;
  if (diff > 0) return { text: `▲ ${diff}`, cls: "text-[#b91c1c] font-bold text-[11px]" };
  if (diff < 0) return { text: `▼ ${Math.abs(diff)}`, cls: "text-[#2563eb] font-bold text-[11px]" };
  return { text: "-", cls: "text-[#9ca3af] text-[11px]" };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KakaoPlaceDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const placeId = String(params.id ?? "");

  const [mounted, setMounted] = useState(false);
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeKw, setActiveKw] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [pinning, setPinning] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  const fetchDetail = useCallback(async () => {
    if (!placeId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/kakao-keyword-place-detail?id=${placeId}`, {
        cache: "no-store", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setFetchError(data?.message || "불러오기 실패"); return; }
      setPlace(data.place);
      if (data.place.keywords.length > 0) setActiveKw(data.place.keywords[0].keyword);
    } catch (e) {
      console.warn("[kakao-place-detail] error:", e);
      setFetchError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [placeId]);

  useEffect(() => {
    if (!mounted || !session) return;
    fetchDetail();
  }, [mounted, session, fetchDetail]);

  const handleUpdate = async () => {
    if (updating || !place) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/check-kakao-keyword-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ placeId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data.error || "업데이트 실패"); return; }
      await fetchDetail();
    } catch (e) {
      console.warn(e);
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  const handleTogglePin = async () => {
    if (!place || pinning) return;
    setPinning(true);
    try {
      const res = await fetch("/api/place-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: place.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { alert(data?.message || "핀 변경 실패"); return; }
      await fetchDetail();
    } catch (e) {
      console.warn(e);
    } finally {
      setPinning(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-place" />
        <main className="flex min-h-screen items-center justify-center bg-[#f4f4f5]">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!loading && fetchError) {
    return (
      <>
        <TopNav active="kakao-place" />
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f4f4f5]">
          <p className="text-[15px] text-[#6b7280]">{fetchError}</p>
          <button type="button" onClick={() => router.back()}
            className="rounded-[14px] border border-[#d1d5db] bg-white px-5 py-2 text-[14px] font-bold text-[#111827] hover:bg-[#f9fafb]">
            ← 목록으로
          </button>
        </main>
      </>
    );
  }

  const activeKeyword = place?.keywords.find((k) => k.keyword === activeKw) ?? null;

  // 날짜 기준 중복 제거 (같은 날짜면 최신 1개만)
  const dedupedHistory: RankRow[] = (() => {
    if (!activeKeyword) return [];
    const seen = new Map<string, RankRow>();
    for (const row of activeKeyword.history) {
      if (!seen.has(row.date)) seen.set(row.date, row);
    }
    return Array.from(seen.values());
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <TopNav active="kakao-place" />
      <main className="min-h-screen bg-[#f4f4f5]">
        <section className="mx-auto max-w-[1240px] px-5 py-6 md:px-6 lg:px-8">

          {/* 뒤로가기 */}
          <button type="button" onClick={() => router.push("/kakao-place")}
            className="mb-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#6b7280] transition hover:text-[#111827]">
            ← 목록으로
          </button>

          {/* Store card */}
          {place && (
            <div className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] ${place.isPinned ? "border-[#fca5a5]" : "border-[#e5e7eb]"}`}>
              <div className="px-5 py-5 md:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 gap-4">
                    {place.imageUrl ? (
                      <img src={place.imageUrl} alt={place.name}
                        className="h-[72px] w-[72px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">이미지</div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {place.isPinned && <Pin className="h-[14px] w-[14px] fill-[#b91c1c] stroke-[#b91c1c]" />}
                        <h2 className="text-[22px] font-black tracking-[-0.03em] text-[#111827]">{place.name}</h2>
                        {place.category && (
                          <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">{place.category}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-[#6b7280]">{place.address || "-"}</p>
                      {place.latestUpdatedAt && (
                        <p className="mt-1 text-[11px] text-[#9ca3af]">
                          마지막 업데이트: <span className="font-semibold text-[#6b7280]">{place.latestUpdatedAt}</span>
                        </p>
                      )}
                      {place.kakaoUrl && (
                        <a href={place.kakaoUrl} target="_blank" rel="noreferrer"
                          className="mt-2 inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111827] hover:bg-[#f9fafb]">
                          카카오맵
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center gap-2">
                    <button type="button" onClick={handleTogglePin} disabled={pinning}
                      className={`inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[14px] border transition ${place.isPinned ? "border-[#fca5a5] bg-white" : "border-[#d1d5db] bg-white hover:bg-[#f9fafb]"} ${pinning ? "opacity-60" : ""}`}>
                      <Pin className={`h-[16px] w-[16px] ${place.isPinned ? "fill-[#b91c1c] stroke-[#b91c1c]" : "stroke-[#6b7280]"}`} strokeWidth={2} />
                    </button>
                    <button type="button" onClick={handleUpdate} disabled={updating}
                      className={`inline-flex h-[42px] items-center justify-center rounded-[14px] bg-[#111827] px-5 text-[14px] font-bold text-white transition hover:bg-[#1f2937] ${updating ? "opacity-60" : ""}`}>
                      {updating ? "업데이트 중..." : "업데이트"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Keyword tabs + history table */}
          {place && (
            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <div className="border-b border-[#f3f4f6] px-5 py-4 md:px-6">
                <h3 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">순위 변화</h3>
                <p className="mt-0.5 text-[12px] text-[#6b7280]">키워드별 검색 순위 히스토리 (최신순)</p>
              </div>

              {place.keywords.length === 0 ? (
                <div className="px-6 py-14 text-center text-[14px] text-[#9ca3af]">
                  등록된 키워드가 없습니다. 목록 페이지의 [키워드 관리]에서 추가해주세요.
                </div>
              ) : (
                <>
                  {/* Keyword tabs */}
                  <div className="flex gap-2 overflow-x-auto border-b border-[#f3f4f6] px-5 py-3 md:px-6">
                    {place.keywords.map((kw) => (
                      <button
                        key={kw.id}
                        type="button"
                        onClick={() => setActiveKw(kw.keyword)}
                        className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${activeKw === kw.keyword ? "bg-[#111827] text-white" : "border border-[#d1d5db] bg-white text-[#6b7280] hover:bg-[#f9fafb]"}`}
                      >
                        {kw.keyword}
                        {kw.latestRank && kw.latestRank > 0 && (
                          <span className={`ml-1.5 text-[11px] ${activeKw === kw.keyword ? "text-white/70" : "text-[#9ca3af]"}`}>
                            {kw.latestRank}위
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Rank history table */}
                  <div className="overflow-x-auto px-5 pb-5 pt-4 md:px-6">
                    {dedupedHistory.length === 0 ? (
                      <div className="rounded-[14px] border border-dashed border-[#d1d5db] py-10 text-center text-[13px] text-[#9ca3af]">
                        아직 순위 데이터가 없습니다.
                        <br />
                        <span className="text-[12px]">위 &ldquo;업데이트&rdquo; 버튼을 눌러 첫 데이터를 수집하세요.</span>
                      </div>
                    ) : (
                      <table className="min-w-full border-collapse overflow-hidden rounded-[14px] border border-[#e5e7eb] text-[13px]">
                        <thead className="bg-[#f9fafb]">
                          <tr>
                            <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[11px] font-extrabold text-[#6b7280]">날짜</th>
                            <th className="border-b border-[#e5e7eb] px-4 py-3 text-center text-[11px] font-extrabold text-[#6b7280]">검색 순위</th>
                            <th className="border-b border-[#e5e7eb] px-4 py-3 text-center text-[11px] font-extrabold text-[#6b7280]">증감</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dedupedHistory.map((row, idx) => {
                            const nextRow = dedupedHistory[idx + 1] ?? null;
                            const prevRank = nextRow?.rank && nextRow.rank > 0 ? nextRow.rank : null;
                            const currRank = row.rank > 0 ? row.rank : null;
                            const change = getRankChangeUi(prevRank, currRank);
                            return (
                              <tr key={row.id} className="border-t border-[#f3f4f6] bg-white hover:bg-[#fafafa]">
                                <td className="px-4 py-3 text-[12px] font-semibold text-[#6b7280]">{row.date}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`text-[14px] font-black ${currRank ? "text-[#111827]" : "text-[#9ca3af]"}`}>
                                    {fmtRank(row.rank)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {change ? (
                                    <span className={change.cls}>{change.text}</span>
                                  ) : (
                                    <span className="text-[11px] text-[#9ca3af]">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
