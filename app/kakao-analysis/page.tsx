"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import TopNav from "@/components/top-nav";
import {
  LoginRequiredModal,
  PublicPreviewBanner,
  useLoginRequiredPreview,
} from "@/components/login-required-preview";

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

const SAMPLE_KAKAO_ANALYSIS_RELATED: RelatedKeywordItem[] = [
  { keyword: "성수 카페", total: 42100, mobile: 36000, pc: 6100 },
  { keyword: "성수 디저트", total: 15300, mobile: 13200, pc: 2100 },
  { keyword: "서울숲 카페", total: 28600, mobile: 24400, pc: 4200 },
];

const SAMPLE_KAKAO_ANALYSIS_LIST: RankPlaceItem[] = [
  {
    rank: 1,
    placeId: "sample-kakao-analysis-1",
    name: "포스트랩스 카페 성수",
    category: "카페",
    address: "서울 성동구 성수이로 7",
    imageUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=800&auto=format&fit=crop",
    review: { total: 1284, rating: 4.7 },
  },
  {
    rank: 2,
    placeId: "sample-kakao-analysis-2",
    name: "포스트랩스 브런치랩",
    category: "브런치",
    address: "서울 성동구 연무장길 18",
    imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop",
    review: { total: 932, rating: 4.6 },
  },
];

export default function KakaoAnalysisPage() {
  const { data: session, status } = useSession();
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
  const isPreview = mounted && status === "unauthenticated";
  const { guardAction, loginRequiredOpen, previewCapture, closeLoginRequired } =
    useLoginRequiredPreview(isPreview);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || status !== "unauthenticated") return;
    setSearchedKeyword("성수 카페");
    setRelatedKeywords(SAMPLE_KAKAO_ANALYSIS_RELATED);
    setList(SAMPLE_KAKAO_ANALYSIS_LIST);
    setLoading(false);
  }, [mounted, status]);

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
    if (guardAction()) return;
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

  return (
    <>
      <TopNav active="kakao-analysis" />

      <main
        className="min-h-screen bg-[#f8fafc] pt-20 text-[#111111] md:pt-24"
        onClickCapture={previewCapture}
      >
        {isPreview ? <PublicPreviewBanner /> : null}
        <section className="mx-auto max-w-[1240px] px-3 py-2 md:px-6 md:py-5 lg:px-8">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-2.5 md:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    카카오맵 순위 분석
                  </h2>
                  <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[10px] font-bold text-[#2563eb] md:py-1 md:text-[11px]">
                    KAKAO
                  </span>
                </div>

                <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">
                  키워드로 카카오맵 장소 검색 결과 순위·리뷰 지표를 확인하고 랭킹/순위 추적에 바로 등록할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-col gap-2 md:gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAnalyze();
                    }}
                    placeholder="예: 한남동 맛집"
                    className="h-[40px] w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[12px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white md:h-[54px] md:rounded-[16px] md:px-4 md:pr-11 md:text-[15px]"
                  />
                  {keyword ? (
                    <button
                      type="button"
                      onClick={() => setKeyword("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#6b7280] md:right-4 md:text-[22px]"
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
                  className="relative isolate inline-flex h-[40px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60 md:h-[54px] md:rounded-[16px] md:px-7 md:text-[15px]"
                >
                  <span className="relative z-30 pointer-events-none">
                    {loading ? "분석 중..." : "분석"}
                  </span>
                  <div 
                    className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" 
                    style={{ transformOrigin: "left", transform: isAnalyzeHovered ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} 
                  />
                  <div
                    className={`absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200 ease-out md:h-40 md:w-40 ${isAnalyzeHovered ? "opacity-100" : "opacity-0"}`}
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
                  <div className="mb-1 text-[12px] font-bold text-[#4b5563] md:text-[13px]">연관 검색어</div>
                  <p className="mb-2 text-[10px] leading-relaxed text-[#6b7280] md:mb-3 md:text-[11px] md:text-[#9ca3af]">
                    검색량은 네이버 광고 데이터 기준입니다.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 md:flex md:flex-wrap md:gap-2.5">
                    {relatedKeywords.map((item, idx) => (
                      <button
                        key={`${item.keyword}-${idx}`}
                        type="button"
                        onClick={() => setKeyword(item.keyword)}
                        className={`min-w-0 rounded-[12px] border px-3 py-2 text-left transition md:rounded-[14px] md:px-4 md:py-3 ${
                          item.keyword === searchedKeyword
                            ? "border-[#2563eb] bg-[#eff6ff]"
                            : "border-[#e5e7eb] bg-white hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className={`truncate text-[12px] font-bold md:text-[13px] ${item.keyword === searchedKeyword ? "text-[#2563eb]" : "text-[#111827]"}`}>
                          {item.keyword}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-[#6b7280] md:mt-1 md:text-[12px]">
                          전체 {formatCount(item.total)} · 모바일 {formatCount(item.mobile)} · PC{" "}
                          {formatCount(item.pc)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-[#f3f4f6] pt-2 md:gap-2 md:pt-4">
                <div className="text-[12px] font-semibold text-[#4b5563] md:text-[14px]">
                  {searchedKeyword
                    ? `“${searchedKeyword}” 분석 결과`
                    : "분석 결과가 여기에 표시됩니다."}
                </div>
                <div className="text-[10px] leading-4 text-[#6b7280] md:text-[12px] md:text-[#9ca3af]">
                  카카오맵 검색·지역에 따라 순위가 달라질 수 있습니다.
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-[14px] border border-[#fecaca] bg-white px-3 py-2.5 text-[12px] text-[#dc2626] md:mt-5 md:rounded-[18px] md:px-5 md:py-4 md:text-[14px]">
              {error}
            </div>
          ) : null}

          <div className="mt-3 overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:mt-5 md:rounded-[22px] md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[780px] md:min-w-[1280px]">
                <thead>
                  <tr className="border-b border-[#f3f4f6] bg-[#fafafa]">
                    <th className="px-2 py-2.5 text-left text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">순위</th>
                    <th className="px-2 py-2.5 text-left text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">매장명</th>
                    <th className="px-2 py-2.5 text-left text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">카테고리</th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">전체 리뷰</th>
                    <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">평점</th>
                    <th className="px-2 py-2.5 text-center text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">랭킹 추적</th>
                    <th className="px-2 py-2.5 text-center text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">순위 추적</th>
                    <th className="px-2 py-2.5 text-center text-[11px] font-bold text-[#6b7280] md:px-4 md:py-4 md:text-[13px]">리뷰 추적</th>
                  </tr>
                </thead>
                <tbody>
                  {renderedList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-[12px] text-[#9ca3af] md:px-5 md:py-14 md:text-[14px]">
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
                          <td className="px-2 py-3 text-[16px] font-black text-[#111827] md:px-4 md:py-5 md:text-[18px]">{item.rank}</td>
                          <td className="px-2 py-3 md:px-4 md:py-5">
                            <div className="flex items-center gap-2 md:gap-3">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-10 w-10 shrink-0 rounded-[10px] object-cover ring-1 ring-[#e5e7eb] md:h-[56px] md:w-[56px] md:rounded-[12px]"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f3f4f6] text-[10px] text-[#9ca3af] md:h-[56px] md:w-[56px] md:rounded-[12px] md:text-[11px]">
                                  없음
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="max-w-[190px] truncate text-[13px] font-bold text-[#111827] md:max-w-none md:text-[15px]">{item.name}</div>
                                {item.address ? (
                                  <div className="mt-0.5 max-w-[190px] truncate text-[11px] text-[#6b7280] md:mt-1 md:max-w-none md:text-[12px] md:text-[#9ca3af]">{item.address}</div>
                                ) : null}
                                <div className="mt-1 text-[10px] font-semibold text-[#6b7280] md:hidden">
                                  리뷰 {formatCount(item.review?.total)} · 평점 {formatRating(item.review?.rating ?? null)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-[12px] font-semibold text-[#4b5563] md:px-4 md:py-5 md:text-[14px]">
                            {item.category || "-"}
                          </td>
                          <td className="px-2 py-3 text-right text-[13px] font-bold text-[#111827] md:px-4 md:py-5 md:text-[15px]">
                            {formatCount(item.review?.total)}
                          </td>
                          <td className="px-2 py-3 text-right text-[13px] font-semibold text-[#6b7280] md:px-4 md:py-5 md:text-[15px]">
                            {formatRating(item.review?.rating ?? null)}
                          </td>
                          
                          {/* 랭킹 추적 등록 버튼 */}
                          <td className="px-2 py-3 text-center md:px-4 md:py-5">
                            {isRankSaved ? (
                              <button
                                type="button"
                                disabled
                                className="h-8 rounded-[10px] border border-[#d1d5db] bg-[#f9fafb] px-2.5 text-xs font-bold text-[#9ca3af] md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px]"
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
                                className="relative isolate inline-flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-xs font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60 md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px]"
                              >
                                <span className="relative z-30 pointer-events-none">
                                  {registeringKey === rkId ? "등록 중" : "등록"}
                                </span>
                                <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: rankRegHover.id === rkId ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                                <div
                                  className={`absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200 ease-out md:h-32 md:w-32 ${rankRegHover.id === rkId ? "opacity-100" : "opacity-0"}`}
                                  style={{ left: `${rankRegHover.x}px`, top: `${rankRegHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }}
                                />
                              </button>
                            )}
                          </td>

                          {/* 순위 추적 등록 버튼 */}
                          <td className="px-2 py-3 text-center md:px-4 md:py-5">
                            {isKwSaved ? (
                              <button
                                type="button"
                                disabled
                                className="h-8 rounded-[10px] border border-[#d1d5db] bg-[#f9fafb] px-2.5 text-xs font-bold text-[#9ca3af] md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px]"
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
                                className="relative isolate inline-flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-xs font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60 md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px]"
                              >
                                <span className="relative z-30 pointer-events-none">
                                  {registeringKey === kwId ? "등록 중" : "등록"}
                                </span>
                                <div className="absolute inset-0 z-10 w-full h-full bg-[#2563EB]" style={{ transformOrigin: "left", transform: kwRegHover.id === kwId ? "scaleX(1)" : "scaleX(0)", transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                                <div
                                  className={`absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200 ease-out md:h-32 md:w-32 ${kwRegHover.id === kwId ? "opacity-100" : "opacity-0"}`}
                                  style={{ left: `${kwRegHover.x}px`, top: `${kwRegHover.y}px`, zIndex: 25, backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)", mixBlendMode: "soft-light", filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))" }}
                                />
                              </button>
                            )}
                          </td>

                          <td className="px-2 py-3 text-center md:px-4 md:py-5">
                            <button
                              type="button"
                              disabled
                              className="h-8 cursor-not-allowed rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-2.5 text-xs font-bold text-[#9ca3af] md:h-[42px] md:rounded-[14px] md:px-4 md:text-[13px]"
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
      <LoginRequiredModal open={loginRequiredOpen} onClose={closeLoginRequired} />
    </>
  );
}
