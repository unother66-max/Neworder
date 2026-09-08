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

type KakaoSearchMeta = {
  source?: string;
  maxResults?: number;
  requestCount?: number;
  duplicateCount?: number;
  availableCount?: number | null;
  partial?: boolean;
  failedPage?: number | null;
  durationMs?: number;
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
    imageUrl: "/postlabs-preview-logo.png?v=20260824-3",
    review: { total: 1284, rating: 4.7 },
  },
  {
    rank: 2,
    placeId: "sample-kakao-analysis-2",
    name: "포스트랩스 브런치랩",
    category: "브런치",
    address: "서울 성동구 연무장길 18",
    imageUrl: "/postlabs-preview-logo.png?v=20260824-3",
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
  const [warning, setWarning] = useState("");
  const [searchMeta, setSearchMeta] = useState<KakaoSearchMeta | null>(null);
  const [resultQuery, setResultQuery] = useState("");

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
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted || status !== "unauthenticated") return;
    const timer = window.setTimeout(() => {
      setSearchedKeyword("성수 카페");
      setRelatedKeywords(SAMPLE_KAKAO_ANALYSIS_RELATED);
      setList(SAMPLE_KAKAO_ANALYSIS_LIST);
      setSearchMeta({ maxResults: 150, requestCount: 0, partial: false });
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
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
    const timer = window.setTimeout(() => void loadSavedPlaces(), 0);
    return () => window.clearTimeout(timer);
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
      setWarning("");
      setSearchMeta(null);
      setResultQuery("");

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
        setSearchMeta(null);
        return;
      }

      setSearchedKeyword(data.keyword || trimmed);
      setRelatedKeywords(Array.isArray(data.related) ? data.related : []);
      setList(Array.isArray(data.list) ? data.list : []);
      setWarning(typeof data.warning === "string" ? data.warning : "");
      setSearchMeta(data.meta && typeof data.meta === "object" ? data.meta : null);
    } catch (e) {
      console.warn(e);
      setError("분석 중 오류가 발생했습니다.");
      setRelatedKeywords([]);
      setList([]);
      setSearchMeta(null);
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

  const renderedList = useMemo(() => {
    const normalized = resultQuery.trim().toLowerCase();
    if (!normalized) return list;
    return list.filter((item) => {
      return (
        item.name.toLowerCase().includes(normalized) ||
        String(item.placeId || "").toLowerCase().includes(normalized)
      );
    });
  }, [list, resultQuery]);

  const renderRegisterButton = (item: RankPlaceItem, mode: "ranking" | "keyword") => {
    const placeId = String(item.placeId || "").trim();
    const rowId = `${mode}-${placeId || item.name}`;
    const saved = mode === "ranking" ? savedRankIds.has(placeId) : savedKeywordIds.has(placeId);
    const hoverState = mode === "ranking" ? rankRegHover : kwRegHover;
    const setHoverState = mode === "ranking" ? setRankRegHover : setKwRegHover;

    if (saved) {
      return (
        <button
          type="button"
          disabled
          className="postlabs-action-button inline-flex h-7 items-center justify-center whitespace-nowrap rounded-[9px] border border-[#d1d5db] bg-[#f9fafb] px-2 !text-[11px] !font-semibold !leading-4 text-[#9ca3af]"
        >
          등록됨
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => handleRegister(item, mode)}
        disabled={registeringKey === rowId}
        onMouseEnter={() => setHoverState({ id: rowId, x: 0, y: 0 })}
        onMouseLeave={() => setHoverState({ id: null, x: 0, y: 0 })}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHoverState({ id: rowId, x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        className="postlabs-action-button relative isolate inline-flex h-7 items-center justify-center overflow-hidden whitespace-nowrap rounded-[9px] bg-[#333333] px-2 !text-[11px] !font-semibold !leading-4 text-white transition-all duration-300 disabled:opacity-60"
      >
        <span className="pointer-events-none relative z-30">
          {registeringKey === rowId ? "등록 중" : "등록"}
        </span>
        <span
          aria-hidden="true"
          className="absolute inset-0 z-10 bg-[#2563EB]"
          style={{
            transformOrigin: "left",
            transform: hoverState.id === rowId ? "scaleX(1)" : "scaleX(0)",
            transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
          }}
        />
      </button>
    );
  };

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
        <section className="mx-auto max-w-[1280px] px-3 py-3 md:px-6 md:py-4 lg:px-8">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3.5 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[20px] md:px-5 md:py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[19px] font-black leading-tight tracking-[-0.03em] text-[#111827] md:text-[25px]">
                카카오맵 순위분석 TOP150
              </h1>
              <span className="rounded-full bg-[#fff7d6] px-2 py-0.5 text-[10px] font-bold text-[#7a5a00] md:text-[11px]">
                KAKAO
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-[#6b7280] md:text-[13px]">
              검색 키워드를 기준으로 카카오맵 장소 검색 순위를 최대 150위까지 확인합니다.
            </p>

            <div className="mt-3 flex gap-2 md:mt-3.5">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAnalyze();
                  }}
                  placeholder="예: 한남동 맛집"
                  className="h-10 w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white"
                />
                {keyword ? (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => setKeyword("")}
                    className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[18px] text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#4b5563]"
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
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setAnalyzeMousePos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
                }}
                className="postlabs-action-button relative isolate inline-flex h-10 min-w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 !text-[12px] !font-bold !leading-4 text-white transition disabled:opacity-60 md:min-w-[96px] md:!text-[13px]"
              >
                <span className="pointer-events-none relative z-30">
                  {loading ? "검색 중..." : "순위 검색"}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 z-10 bg-[#2563EB]"
                  style={{
                    transformOrigin: "left",
                    transform: isAnalyzeHovered ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                  }}
                />
                <span
                  aria-hidden="true"
                  className={`absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-opacity ${isAnalyzeHovered ? "opacity-100" : "opacity-0"}`}
                  style={{
                    left: `${analyzeMousePos.x}px`,
                    top: `${analyzeMousePos.y}px`,
                    zIndex: 25,
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                    mixBlendMode: "soft-light",
                  }}
                />
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-[14px] border border-[#fecaca] bg-white px-3 py-2.5 text-[12px] text-[#dc2626] md:text-[13px]">
              {error}
            </div>
          ) : null}
          {warning ? (
            <div className="mt-3 rounded-[14px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-[12px] text-[#92400e] md:text-[13px]">
              {warning}
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2.5 md:gap-3">
            <div className="rounded-[16px] border border-[#e5e7eb] bg-white px-3.5 py-3 md:rounded-[18px] md:px-4">
              <div className="text-[10px] font-semibold text-[#9ca3af] md:text-[11px]">분석 키워드</div>
              <div className="mt-1 truncate text-[14px] font-extrabold text-[#111827] md:text-[16px]">
                {searchedKeyword || "-"}
              </div>
            </div>
            <div className="rounded-[16px] border border-[#e5e7eb] bg-white px-3.5 py-3 md:rounded-[18px] md:px-4">
              <div className="text-[10px] font-semibold text-[#9ca3af] md:text-[11px]">조회 결과</div>
              <div className="mt-1 text-[14px] font-extrabold text-[#111827] md:text-[16px]">
                {list.length.toLocaleString("ko-KR")}개
                {searchMeta?.partial ? (
                  <span className="ml-1.5 text-[10px] font-semibold text-[#d97706] md:text-[11px]">부분 결과</span>
                ) : null}
              </div>
            </div>
          </div>

          {relatedKeywords.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-0.5 text-[10px] text-[#9ca3af] md:gap-2 md:text-[11px]">
              <span className="font-semibold text-[#6b7280]">연관 검색어</span>
              {relatedKeywords.map((item, index) => (
                <button
                  key={`${item.keyword}-${index}`}
                  type="button"
                  onClick={() => setKeyword(item.keyword)}
                  className="rounded-full border border-[#e5e7eb] bg-white px-2 py-1 font-semibold text-[#6b7280] transition hover:border-[#bfdbfe] hover:bg-[#eff6ff] hover:text-[#2563eb]"
                  title={`전체 ${formatCount(item.total)} · 모바일 ${formatCount(item.mobile)} · PC ${formatCount(item.pc)}`}
                >
                  {item.keyword}
                </button>
              ))}
              <span className="hidden md:inline">검색량은 네이버 광고 데이터 기준</span>
            </div>
          ) : null}

          <div className="mt-3 overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:mt-4 md:rounded-[20px]">
            <div className="flex flex-col gap-2 border-b border-[#f3f4f6] px-3.5 py-3 md:flex-row md:items-center md:justify-between md:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-[15px] font-extrabold text-[#111827] md:text-[17px]">카카오맵 순위표</h2>
                <span className="text-[10px] font-semibold text-[#9ca3af] md:text-[11px]">
                  {resultQuery ? `${renderedList.length}/${list.length}개` : `최대 TOP150`}
                </span>
              </div>
              <div className="relative w-full md:w-[250px]">
                <input
                  type="search"
                  value={resultQuery}
                  onChange={(event) => setResultQuery(event.target.value)}
                  placeholder="업체명·카카오 장소ID 검색"
                  aria-label="결과 내 업체명 또는 카카오 장소ID 검색"
                  className="h-9 w-full rounded-[10px] border border-[#d1d5db] bg-[#fafafa] px-3 text-[11px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white md:text-[12px]"
                />
              </div>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] table-fixed">
                <colgroup>
                  <col className="w-[64px]" />
                  <col className="w-[34%]" />
                  <col className="w-[15%]" />
                  <col className="w-[96px]" />
                  <col className="w-[72px]" />
                  <col className="w-[86px]" />
                  <col className="w-[86px]" />
                  <col className="w-[86px]" />
                </colgroup>
                <thead>
                  <tr className="bg-[#fafafa]">
                    {[
                      ["순위", "text-left"],
                      ["업체명", "text-left"],
                      ["카테고리", "text-left"],
                      ["전체 리뷰", "text-right"],
                      ["평점", "text-right"],
                      ["랭킹 추적", "text-center"],
                      ["순위 추적", "text-center"],
                      ["리뷰 추적", "text-center"],
                    ].map(([label, align]) => (
                      <th key={label} className={`px-3 py-2 text-[11px] font-bold text-[#6b7280] ${align}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {renderedList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border-t border-[#f3f4f6] px-4 py-12 text-center text-[13px] text-[#9ca3af]">
                        {list.length > 0 ? "일치하는 업체가 없습니다." : "아직 순위 검색 결과가 없습니다."}
                      </td>
                    </tr>
                  ) : (
                    renderedList.map((item) => (
                      <tr key={item.placeId || `${item.rank}-${item.name}`} className="border-t border-[#f3f4f6] transition hover:bg-[#fcfcfc]">
                        <td className="px-3 py-2 text-[15px] font-black text-[#111827]">{item.rank}</td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className={`h-10 w-10 shrink-0 rounded-[9px] ring-1 ring-[#e5e7eb] ${item.placeId?.startsWith("sample-kakao-analysis-") ? "bg-white object-contain p-1" : "object-cover"}`}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#f3f4f6] text-[10px] text-[#9ca3af]">없음</div>
                            )}
                            <div className="min-w-0">
                              <a
                                href={item.placeId ? `https://place.map.kakao.com/${item.placeId}` : undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-[13px] font-bold text-[#111827] hover:text-[#2563eb] hover:underline"
                              >
                                {item.name}
                              </a>
                              <div className="mt-0.5 truncate text-[10px] text-[#9ca3af]">{item.address || "주소 정보 없음"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="truncate px-3 py-2 text-[12px] font-semibold text-[#4b5563]">{item.category || "-"}</td>
                        <td className="px-3 py-2 text-right text-[12px] font-bold text-[#111827]">{formatCount(item.review?.total)}</td>
                        <td className="px-3 py-2 text-right text-[12px] font-semibold text-[#6b7280]">{formatRating(item.review?.rating ?? null)}</td>
                        <td className="px-3 py-2 text-center">{renderRegisterButton(item, "ranking")}</td>
                        <td className="px-3 py-2 text-center">{renderRegisterButton(item, "keyword")}</td>
                        <td className="px-3 py-2 text-center">
                          <button type="button" disabled className="inline-flex h-7 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-[9px] border border-[#e5e7eb] bg-[#f9fafb] px-2 text-[11px] font-semibold text-[#9ca3af]">
                            준비중
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[#f3f4f6] md:hidden">
              {renderedList.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-[#9ca3af]">
                  {list.length > 0 ? "일치하는 업체가 없습니다." : "아직 순위 검색 결과가 없습니다."}
                </div>
              ) : (
                renderedList.map((item) => (
                  <article key={item.placeId || `${item.rank}-${item.name}`} className="px-3.5 py-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="w-7 shrink-0 pt-1 text-[14px] font-black text-[#111827]">{item.rank}</div>
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className={`h-10 w-10 shrink-0 rounded-[9px] ring-1 ring-[#e5e7eb] ${item.placeId?.startsWith("sample-kakao-analysis-") ? "bg-white object-contain p-1" : "object-cover"}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-[#f3f4f6] text-[9px] text-[#9ca3af]">없음</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <a
                          href={item.placeId ? `https://place.map.kakao.com/${item.placeId}` : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-[13px] font-bold text-[#111827]"
                        >
                          {item.name}
                        </a>
                        <div className="mt-0.5 truncate text-[10px] text-[#9ca3af]">{item.address || "주소 정보 없음"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#6b7280]">
                          <span className="max-w-full truncate font-semibold">{item.category || "-"}</span>
                          <span>리뷰 {formatCount(item.review?.total)}</span>
                          <span>평점 {formatRating(item.review?.rating ?? null)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <span className="mr-0.5 text-[10px] font-semibold text-[#9ca3af]">랭킹</span>
                      {renderRegisterButton(item, "ranking")}
                      <span className="ml-1 mr-0.5 text-[10px] font-semibold text-[#9ca3af]">순위</span>
                      {renderRegisterButton(item, "keyword")}
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <p className="mt-2 px-1 text-[10px] leading-4 text-[#9ca3af] md:text-right md:text-[11px]">
            카카오맵 검색 시점과 지역에 따라 순위가 달라질 수 있습니다.
          </p>
        </section>
      </main>
      <LoginRequiredModal open={loginRequiredOpen} onClose={closeLoginRequired} />
    </>
  );
}
