"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";

type RelatedKeywordItem = {
  keyword: string;
  total?: number;
  mobile?: number;
  pc?: number;
};

type RankPlaceItem = {
  rank: number;
  placeId?: string;
  name: string;
  category?: string;
  address?: string;
  imageUrl?: string;
  review?: {
    total?: number;
    rating?: number | null;
  };
};

type SavedKakaoItem = {
  kakaoId: string | null;
};

function formatCount(value?: string | number | null) {
  if (value === undefined || value === null || value === "" || value === "-" || value === "null") {
    return "-";
  }
  const onlyNumber = String(value).replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(onlyNumber)) return String(value);
  if (onlyNumber.includes(".")) return Number(onlyNumber).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return Number(onlyNumber).toLocaleString("ko-KR");
}

function formatRating(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return Number(value).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function KakaoAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordItem[]>([]);
  const [list, setList] = useState<RankPlaceItem[]>([]);
  const [error, setError] = useState("");

  const [savedRankIds, setSavedRankIds] = useState<Set<string>>(new Set());
  const [savedKeywordIds, setSavedKeywordIds] = useState<Set<string>>(new Set());
  const [registeringKey, setRegisteringKey] = useState<string | null>(null);

  // --- 디자인 통일용 호버 및 마우스 상태값 ---
  const [isAnalyzeHovered, setIsAnalyzeHovered] = useState(false);
  const [analyzeMousePos, setAnalyzeMousePos] = useState({ x: 0, y: 0 });

  const [rankRegHover, setRankRegHover] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const [kwRegHover, setKwRegHover] = useState<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  const loadSavedPlaces = async () => {
    try {
      const [rankRes, kwRes] = await Promise.all([
        fetch("/api/kakao-place-list", { cache: "no-store", credentials: "include" }),
        fetch("/api/kakao-keyword-place-list", { cache: "no-store", credentials: "include" }),
      ]);

      const rankSet = new Set<string>();
      const kwSet = new Set<string>();

      if (rankRes.ok) {
        const rankData = await rankRes.json();
        if (rankData?.ok) {
          const places: SavedKakaoItem[] = Array.isArray(rankData?.places) ? rankData.places : [];
          for (const p of places) {
            if (p.kakaoId) rankSet.add(p.kakaoId);
          }
        }
      }

      if (kwRes.ok) {
        const kwData = await kwRes.json();
        if (kwData?.ok) {
          const places: SavedKakaoItem[] = Array.isArray(kwData?.places) ? kwData.places : [];
          for (const p of places) {
            if (p.kakaoId) kwSet.add(p.kakaoId);
          }
        }
      }

      setSavedRankIds(rankSet);
      setSavedKeywordIds(kwSet);
    } catch (e) {
      console.warn("saved kakao places load error:", e);
    }
  };

  useEffect(() => {
    if (!mounted || !session) return;
    loadSavedPlaces();
  }, [mounted, session]);

  const handleAnalyze = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      alert("키워드를 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/kakao-rank-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.message || "분석 중 오류가 발생했습니다.");
        setRelatedKeywords([]);
        setList([]);
        return;
      }

      setSearchedKeyword(data.keyword || trimmed);
      setRelatedKeywords(Array.isArray(data.related) ? data.related : []);
      setList(Array.isArray(data.list) ? data.list : []);
    } catch (e) {
      console.warn(e);
      setError("분석 중 오류가 발생했습니다.");
      setRelatedKeywords([]);
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (
    item: RankPlaceItem,
    mode: "ranking" | "keyword"
  ) => {
    const kakaoId = String(item.placeId || "").trim();
    const key = `${mode}-${kakaoId || item.name}`;

    if (!kakaoId) {
      alert("카카오 장소 ID가 없어 등록할 수 없습니다.");
      return;
    }

    try {
      setRegisteringKey(key);

      const res = await fetch("/api/kakao-place-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: item.name,
          category: item.category || "",
          address: item.address || "",
          kakaoUrl: `https://place.map.kakao.com/${kakaoId}`,
          kakaoId,
          x: null,
          y: null,
          type: mode === "keyword" ? "kakao-place" : "kakao-rank",
        }),
      });

      const saveData = await res.json();

      if (!res.ok || saveData?.error) {
        alert(saveData?.error || saveData?.message || "매장 등록 실패");
        return;
      }

      if (mode === "ranking") {
        setSavedRankIds((prev) => new Set(prev).add(kakaoId));
        alert("랭킹 추적에 등록했습니다.");
      } else {
        setSavedKeywordIds((prev) => new Set(prev).add(kakaoId));
        alert("순위 추적에 등록했습니다.");
      }

      await loadSavedPlaces();
    } catch (e) {
      console.warn(e);
      alert("등록 중 오류가 발생했습니다.");
    } finally {
      setRegisteringKey(null);
    }
  };

  const renderedList = useMemo(() => list, [list]);

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="kakao-analysis" />
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] pt-24">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav active="kakao-analysis" />
        <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] pt-24">
          <div className="text-[15px] text-[#6b7280]">로그인 페이지로 이동 중...</div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="kakao-analysis" />

      <main className="min-h-screen bg-[#f8fafc] text-[#111111] pt-24">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    카카오맵 순위 분석
                  </h1>
                  <span className="rounded-full bg-[#eff6ff] px-2 py-1 text-[11px] font-bold text-[#2563eb]">
                    KAKAO
                  </span>
                </div>

                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  키워드로 카카오맵 장소 검색 결과 순위·리뷰 지표를 확인하고 랭킹/순위 추적에 바로 등록할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAnalyze();
                    }}
                    placeholder="예: 한남동 맛집"
                    className="h-[54px] w-full rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[15px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white"
                  />
                  {keyword ? (
                    <button
                      type="button"
                      onClick={() => setKeyword("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[22px] text-[#6b7280]"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading}
                  onMouseEnter={() => setIsAnalyzeHovered(true)}
                  onMouseLeave={() => setIsAnalyzeHovered(false)}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setAnalyzeMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  className="relative isolate inline-flex h-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#333333] px-7 text-[15px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                >
                  <span className="relative z-30 pointer-events-none">
                    {loading ? "분석 중..." : "분석"}
                  </span>
                  <div 
                    className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" 
                    style={{ transformOrigin: "left", transform: isAnalyzeHovered ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} 
                  />
                  <div
                    className={`absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl transition-opacity duration-200 ease-out ${isAnalyzeHovered ? "opacity-100" : "opacity-0"}`}
                    style={{
                      left: `${analyzeMousePos.x}px`,
                      top: `${analyzeMousePos.y}px`,
                      pointerEvents: "none",
                      zIndex: 25,
                      backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                      mixBlendMode: "soft-light",
                      filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                    }}
                  />
                </button>
              </div>

              {relatedKeywords.length > 0 && (
                <div className="pt-1">
                  <div className="mb-1 text-[13px] font-bold text-[#4b5563]">연관 검색어</div>
                  <p className="mb-3 text-[11px] leading-relaxed text-[#9ca3af]">
                    검색량은 네이버 광고 데이터 기준입니다.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {relatedKeywords.map((item, idx) => (
                      <button
                        key={`${item.keyword}-${idx}`}
                        type="button"
                        onClick={() => setKeyword(item.keyword)}
                        className={`rounded-[14px] border px-4 py-3 text-left transition ${
                          item.keyword === searchedKeyword
                            ? "border-[#2563eb] bg-[#eff6ff]"
                            : "border-[#e5e7eb] bg-white hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className={`text-[13px] font-bold ${item.keyword === searchedKeyword ? "text-[#2563eb]" : "text-[#111827]"}`}>
                          {item.keyword}
                        </div>
                        <div className="mt-1 text-[12px] text-[#6b7280]">
                          전체 {formatCount(item.total)} · 모바일 {formatCount(item.mobile)} · PC{" "}
                          {formatCount(item.pc)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] pt-4">
                <div className="text-[14px] font-semibold text-[#4b5563]">
                  {searchedKeyword
                    ? `“${searchedKeyword}” 분석 결과`
                    : "분석 결과가 여기에 표시됩니다."}
                </div>
                <div className="text-[12px] text-[#9ca3af]">
                  카카오맵 검색·지역에 따라 순위가 달라질 수 있습니다.
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-[18px] border border-[#fecaca] bg-white px-5 py-4 text-[14px] text-[#dc2626]">
              {error}
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1280px] w-full">
                <thead>
                  <tr className="border-b border-[#f3f4f6] bg-[#fafafa]">
                    <th className="px-4 py-4 text-left text-[13px] font-bold text-[#6b7280]">순위</th>
                    <th className="px-4 py-4 text-left text-[13px] font-bold text-[#6b7280]">매장명</th>
                    <th className="px-4 py-4 text-left text-[13px] font-bold text-[#6b7280]">카테고리</th>
                    <th className="px-4 py-4 text-right text-[13px] font-bold text-[#6b7280]">전체 리뷰</th>
                    <th className="px-4 py-4 text-right text-[13px] font-bold text-[#6b7280]">평점</th>
                    <th className="px-4 py-4 text-center text-[13px] font-bold text-[#6b7280]">랭킹 추적</th>
                    <th className="px-4 py-4 text-center text-[13px] font-bold text-[#6b7280]">순위 추적</th>
                    <th className="px-4 py-4 text-center text-[13px] font-bold text-[#6b7280]">리뷰 추적</th>
                  </tr>
                </thead>
                <tbody>
                  {renderedList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center text-[14px] text-[#9ca3af]">
                        아직 분석 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    renderedList.map((item, idx) => {
                      const pid = String(item.placeId || "").trim();
                      const isRankSaved = pid ? savedRankIds.has(pid) : false;
                      const isKwSaved = pid ? savedKeywordIds.has(pid) : false;
                      const rkId = `ranking-${pid || item.name}`;
                      const kwId = `keyword-${pid || item.name}`;

                      return (
                        <tr
                          key={`${item.placeId || item.name}-${idx}`}
                          className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]"
                        >
                          <td className="px-4 py-5 text-[18px] font-black text-[#111827]">{item.rank}</td>
                          <td className="px-4 py-5">
                            <div className="flex items-center gap-3">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-[56px] w-[56px] rounded-[12px] object-cover ring-1 ring-[#e5e7eb]"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[11px] text-[#9ca3af]">
                                  없음
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-[15px] font-bold text-[#111827]">{item.name}</div>
                                {item.address ? (
                                  <div className="mt-1 text-[12px] text-[#9ca3af]">{item.address}</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-5 text-[14px] font-semibold text-[#4b5563]">
                            {item.category || "-"}
                          </td>
                          <td className="px-4 py-5 text-right text-[15px] font-bold text-[#111827]">
                            {formatCount(item.review?.total)}
                          </td>
                          <td className="px-4 py-5 text-right text-[15px] font-semibold text-[#6b7280]">
                            {formatRating(item.review?.rating ?? null)}
                          </td>
                          
                          {/* 랭킹 추적 등록 버튼 */}
                          <td className="px-4 py-5 text-center">
                            {isRankSaved ? (
                              <button
                                type="button"
                                disabled
                                className="h-[42px] rounded-[14px] border border-[#d1d5db] bg-[#f9fafb] px-4 text-[14px] font-bold text-[#9ca3af]"
                              >
                                등록됨
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRegister(item, "ranking")}
                                disabled={registeringKey === rkId}
                                onMouseEnter={() => setRankRegHover({ id: rkId, x: 0, y: 0 })}
                                onMouseLeave={() => setRankRegHover({ id: null, x: 0, y: 0 })}
                                onMouseMove={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setRankRegHover({ id: rkId, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                }}
                                className="relative isolate inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                              >
                                <span className="relative z-30 pointer-events-none">
                                  {registeringKey === rkId ? "등록 중" : "등록"}
                                </span>
                                <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: rankRegHover.id === rkId ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                                <div
                                  className={`absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out ${rankRegHover.id === rkId ? "opacity-100" : "opacity-0"}`}
                                  style={{ left: `${rankRegHover.x}px`, top: `${rankRegHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }}
                                />
                              </button>
                            )}
                          </td>

                          {/* 순위 추적 등록 버튼 */}
                          <td className="px-4 py-5 text-center">
                            {isKwSaved ? (
                              <button
                                type="button"
                                disabled
                                className="h-[42px] rounded-[14px] border border-[#d1d5db] bg-[#f9fafb] px-4 text-[14px] font-bold text-[#9ca3af]"
                              >
                                등록됨
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRegister(item, "keyword")}
                                disabled={registeringKey === kwId}
                                onMouseEnter={() => setKwRegHover({ id: kwId, x: 0, y: 0 })}
                                onMouseLeave={() => setKwRegHover({ id: null, x: 0, y: 0 })}
                                onMouseMove={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setKwRegHover({ id: kwId, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                }}
                                className="relative isolate inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60"
                              >
                                <span className="relative z-30 pointer-events-none">
                                  {registeringKey === kwId ? "등록 중" : "등록"}
                                </span>
                                <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: kwRegHover.id === kwId ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                                <div
                                  className={`absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl transition-opacity duration-200 ease-out ${kwRegHover.id === kwId ? "opacity-100" : "opacity-0"}`}
                                  style={{ left: `${kwRegHover.x}px`, top: `${kwRegHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }}
                                />
                              </button>
                            )}
                          </td>

                          <td className="px-4 py-5 text-center">
                            <button
                              type="button"
                              disabled
                              className="h-[42px] cursor-not-allowed rounded-[14px] border border-[#e5e7eb] bg-[#f9fafb] px-4 text-[13px] font-bold text-[#9ca3af]"
                            >
                              준비중
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}