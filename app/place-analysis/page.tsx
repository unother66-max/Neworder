"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TopNav from "@/components/top-nav";
import {
  buildLocationFallbackSearchKeyword,
  countBusinessesItemsInBatch,
  normalizePlaceSearchKeywordTypos,
} from "@/lib/place-keyword-fallback";
import {
  NAVER_PCMAP_GRAPHQL_URL,
  buildGetPlacesListBatch,
  buildGetPlacesListFetchHeaders,
  buildGetPlacesListFetchHeadersForServer,
  pickBusinessesCoords,
  resolveBusinessesCoords,
} from "@/lib/naver-map-businesses-shared";

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
  isPromotedAd?: boolean;
  keywords?: string[]; // 👈 백엔드에서 키워드를 받을 수 있도록 타입 추가
  review?: {
    total?: number;
    visitor?: number;
    blog?: number;
    save?: string | number;
  };
};

function formatCount(value?: string | number | null) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "-" ||
    value === "null"
  ) {
    return "-";
  }

  const onlyNumber = String(value).replace(/,/g, "").trim();
  if (!/^\d+$/.test(onlyNumber)) return String(value);

  return Number(onlyNumber).toLocaleString("ko-KR");
}

type BatchAttempt = {
  label: string;
  body: ReturnType<typeof buildGetPlacesListBatch>;
  headers: Record<string, string>;
};

async function tryFetchBusinessesBatchInBrowser(
  keyword: string,
  signal?: AbortSignal
): Promise<unknown[] | null> {
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const attempts: BatchAttempt[] = [];
  const fb = buildLocationFallbackSearchKeyword(trimmed);

  {
    const coords = pickBusinessesCoords(trimmed);
    attempts.push({
      label: "pcmap:fullQuery",
      body: buildGetPlacesListBatch(trimmed, coords),
      headers: buildGetPlacesListFetchHeadersForServer(trimmed, coords),
    });
  }

  {
    const coords = pickBusinessesCoords(trimmed);
    attempts.push({
      label: "map:fullQuery",
      body: buildGetPlacesListBatch(trimmed, coords),
      headers: buildGetPlacesListFetchHeaders(trimmed),
    });
  }

  if (fb) {
    const coords = resolveBusinessesCoords(fb, trimmed);
    attempts.push({
      label: "pcmap:fallback+anchorCoords",
      body: buildGetPlacesListBatch(fb, coords),
      headers: buildGetPlacesListFetchHeadersForServer(fb, coords),
    });
    attempts.push({
      label: "map:fallback+anchorCoords",
      body: buildGetPlacesListBatch(fb, coords),
      headers: buildGetPlacesListFetchHeaders(fb),
    });
  }

  for (const a of attempts) {
    if (signal?.aborted) return null;
    try {
      const res = await fetch(NAVER_PCMAP_GRAPHQL_URL, {
        method: "POST",
        headers: a.headers,
        credentials: "include",
        body: JSON.stringify(a.body),
        mode: "cors",
        signal,
      });
      const text = await res.text();
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) continue;
      const n = countBusinessesItemsInBatch(parsed);
      if (n > 0) {
        console.log("[place-analysis] businessesGraphQL 성공", {
          label: a.label,
          itemCount: n,
        });
        return parsed;
      }
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
        return null;
      }
      console.warn("[place-analysis] GraphQL 시도 실패", a.label, e);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  console.warn(
    "[place-analysis] 브라우저에서 businesses 0건(CORS·비로그인 등) → 서버 보조"
  );
  return null;
}

export default function PlaceAnalysisPage() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordItem[]>([]);
  const [list, setList] = useState<RankPlaceItem[]>([]);
  const [error, setError] = useState("");
  
  const [naverMapDataSource, setNaverMapDataSource] = useState<null | "batch" | "allSearch">(null);
  const [placeSearchHint, setPlaceSearchHint] = useState("");
  const [analysisDiagnostics, setAnalysisDiagnostics] = useState<{
    failureCode: string | null;
    dataSourceHint: string | null;
    hints: string[];
    resolvedSource: string;
    compactSummary?: string | null;
  } | null>(null);

  const analyzeGenRef = useRef(0);
  const analyzeAbortRef = useRef<AbortController | null>(null);

  // --- 디자인 통일용 호버 상태값 ---
  const [isAnalyzeHovered, setIsAnalyzeHovered] = useState(false);
  const [analyzeMousePos, setAnalyzeMousePos] = useState({ x: 0, y: 0 });

  const handleAnalyze = async () => {
    const trimmedRaw = keyword.trim();

    if (!trimmedRaw) {
      alert("키워드를 입력해주세요.");
      return;
    }

    const { normalized: trimmed, typoCorrected } =
      normalizePlaceSearchKeywordTypos(trimmedRaw);
    if (typoCorrected && trimmed !== trimmedRaw) {
      setKeyword(trimmed);
    }

    analyzeAbortRef.current?.abort();
    const ac = new AbortController();
    analyzeAbortRef.current = ac;
    const signal = ac.signal;
    const myGen = ++analyzeGenRef.current;
    const alive = () => myGen === analyzeGenRef.current;

    try {
      setLoading(true);
      setError("");
      setNaverMapDataSource(null);
      setPlaceSearchHint("");
      setAnalysisDiagnostics(null);

      let clientBatch: unknown[] | null = null;
      let mapAllSearchPlaces: unknown[] | null = null;
      let mapAllSearchTotalCount: number | undefined;
      let clientMapAllSearch:
        | { tokenSent: boolean; apiOk?: boolean; apiCode?: string }
        | undefined;

      try {
        const proxyRes = await fetch("/api/pcmap-businesses-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: trimmed }),
          signal,
        });
        if (proxyRes.ok) {
          const pj = (await proxyRes.json()) as {
            typoCorrected?: boolean;
            normalizedKeyword?: string;
            batch?: unknown[];
            itemCount?: number;
            mode?: string;
          };
          if (
            pj.typoCorrected &&
            typeof pj.normalizedKeyword === "string" &&
            pj.normalizedKeyword
          ) {
            setKeyword(pj.normalizedKeyword);
          }
          if (pj.batch?.length && (pj.itemCount ?? 0) > 0) {
            clientBatch = pj.batch;
            console.log("[place-analysis] pcmap-businesses-batch", {
              mode: pj.mode,
              itemCount: pj.itemCount,
            });
          }
        }
      } catch (e) {
        if (
          signal.aborted ||
          (e instanceof Error && e.name === "AbortError")
        ) {
          return;
        }
        console.warn("[place-analysis] pcmap-businesses-batch 실패", e);
      }

      if (!alive()) return;

      if (!clientBatch || countBusinessesItemsInBatch(clientBatch) === 0) {
        const fromBrowser = await tryFetchBusinessesBatchInBrowser(
          trimmed,
          signal
        );
        if (
          fromBrowser?.length &&
          countBusinessesItemsInBatch(fromBrowser) > 0
        ) {
          clientBatch = fromBrowser;
        }
      }

      if (!alive()) return;

      const hasClientItems =
        Boolean(clientBatch?.length) &&
        countBusinessesItemsInBatch(clientBatch) > 0;

      if (!hasClientItems) {
        try {
          const mapToken =
            typeof sessionStorage !== "undefined"
              ? sessionStorage
                  .getItem("PLACE_ANALYSIS_NAVER_MAP_TOKEN")
                  ?.trim() ?? ""
              : "";
          clientMapAllSearch = { tokenSent: Boolean(mapToken) };
          const mapRes = await fetch("/api/naver-map-all-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: trimmed,
              ...(mapToken ? { token: mapToken } : {}),
            }),
            signal,
          });
          if (mapRes.ok) {
            const mj = (await mapRes.json()) as {
              ok?: boolean;
              places?: unknown[];
              totalCount?: number;
              code?: string;
            };
            clientMapAllSearch.apiOk = mj.ok === true;
            clientMapAllSearch.apiCode =
              typeof mj.code === "string" ? mj.code : undefined;
            if (mj.ok && Array.isArray(mj.places) && mj.places.length > 0) {
              mapAllSearchPlaces = mj.places;
              mapAllSearchTotalCount =
                typeof mj.totalCount === "number" ? mj.totalCount : undefined;
              setNaverMapDataSource("allSearch");
              console.log("[place-analysis] naver-map-all-search (폴백)", {
                n: mj.places.length,
                totalCount: mj.totalCount,
              });
            }
          } else {
            clientMapAllSearch.apiOk = false;
          }
        } catch (e) {
          if (
            signal.aborted ||
            (e instanceof Error && e.name === "AbortError")
          ) {
            return;
          }
          console.warn("[place-analysis] naver-map-all-search 실패", e);
          if (clientMapAllSearch) {
            clientMapAllSearch.apiOk = false;
          }
        }
      }

      if (!alive()) return;

      const payload: {
        keyword: string;
        mapAllSearchPlaces?: unknown[];
        mapAllSearchTotalCount?: number;
        businessesGraphqlBatch?: unknown[];
        clientMapAllSearch?: {
          tokenSent: boolean;
          apiOk?: boolean;
          apiCode?: string;
        };
      } = { keyword: trimmed };

      if (clientMapAllSearch) {
        payload.clientMapAllSearch = clientMapAllSearch;
      }

      if (hasClientItems && clientBatch) {
        payload.businessesGraphqlBatch = clientBatch;
        setNaverMapDataSource("batch");
        console.log("[place-analysis] businessesGraphqlBatch 전달", {
          batchLength: clientBatch.length,
        });
      } else if (mapAllSearchPlaces?.length) {
        payload.mapAllSearchPlaces = mapAllSearchPlaces;
        if (mapAllSearchTotalCount != null) {
          payload.mapAllSearchTotalCount = mapAllSearchTotalCount;
        }
      }

      const res = await fetch("/api/place-rank-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      const data = await res.json();

      if (!alive()) return;

      if (!res.ok || !data?.ok) {
        setError(data?.message || "분석 중 오류가 발생했습니다.");
        setRelatedKeywords([]);
        setList([]);
        setPlaceSearchHint("");
        setAnalysisDiagnostics(null);
        return;
      }

      setSearchedKeyword(data.keyword || trimmed);
      setRelatedKeywords(Array.isArray(data.related) ? data.related : []);
      const listArr = Array.isArray(data.list) ? data.list : [];
      setList(listArr);

      const diag = data.diagnostics as
        | {
            failureCode?: string | null;
            dataSourceHint?: string | null;
            hints?: unknown;
            resolvedSource?: string;
            compactSummary?: string | null;
          }
        | undefined;

      if (diag && typeof diag === "object") {
        const hintList = Array.isArray(diag.hints)
          ? diag.hints.filter((h): h is string => typeof h === "string")
          : [];
        setAnalysisDiagnostics({
          failureCode:
            typeof diag.failureCode === "string" ? diag.failureCode : null,
          dataSourceHint:
            typeof diag.dataSourceHint === "string"
              ? diag.dataSourceHint
              : null,
          hints: hintList,
          resolvedSource:
            typeof diag.resolvedSource === "string" ? diag.resolvedSource : "",
          compactSummary:
            typeof diag.compactSummary === "string"
              ? diag.compactSummary
              : diag.compactSummary === null
                ? null
                : undefined,
        });
      } else {
        setAnalysisDiagnostics(null);
      }

      if (
        listArr.length === 0 &&
        !(Array.isArray(diag?.hints) && diag.hints.length > 0)
      ) {
        setPlaceSearchHint(
          "결과가 비었습니다. map.naver.com에서 로그인·검색 후 다시 시도하거나, allSearch token을 sessionStorage(PLACE_ANALYSIS_NAVER_MAP_TOKEN) 또는 NAVER_MAP_ALL_SEARCH_TOKEN으로 설정해 보세요."
        );
      } else {
        setPlaceSearchHint("");
      }
    } catch (e) {
      if (!alive()) return;
      if (e instanceof Error && e.name === "AbortError") return;
      console.error(e);
      setError("분석 중 오류가 발생했습니다.");
      setRelatedKeywords([]);
      setList([]);
      setPlaceSearchHint("");
      setAnalysisDiagnostics(null);
    } finally {
      if (myGen === analyzeGenRef.current) {
        setLoading(false);
      }
    }
  };

  const renderedList = useMemo(() => list, [list]);

  return (
    <>
      <TopNav active="place-analysis" />

      <main className="min-h-screen bg-[#f8fafc] text-[#111827] pt-24">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    플레이스 키워드 분석
                  </h1>
                </div>

                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  검색한 키워드 기준으로 네이버 플레이스 순위와 리뷰 지표를 확인합니다.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAnalyze();
                      }
                    }}
                    placeholder="예: 한남동 맛집"
                    className="h-[54px] w-full rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[15px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white"
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
                  className={`relative inline-flex h-[54px] min-w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#333333] px-7 text-[15px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed ${
                    loading ? "opacity-60" : ""
                  }`}
                >
                  <span className="relative z-30 pointer-events-none">
                    {loading ? "분석 중..." : "분석"}
                  </span>
                  <div
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{
                      transformOrigin: "left",
                      transform: isAnalyzeHovered ? "scaleX(1)" : "scaleX(0)",
                      transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                      backgroundColor: "#2563EB",
                    }}
                  />
                  <div
                    className={`
                      absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                      transition-opacity duration-200 ease-out
                      ${isAnalyzeHovered ? "opacity-100" : "opacity-0"}
                    `}
                    style={{
                      left: `${analyzeMousePos.x}px`,
                      top: `${analyzeMousePos.y}px`,
                      pointerEvents: "none",
                      zIndex: 25,
                      backgroundImage:
                        "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                      mixBlendMode: "soft-light",
                      filter:
                        "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                    }}
                  />
                </button>
              </div>

              {relatedKeywords.length > 0 && (
                <div className="pt-1">
                  <div className="mb-3 text-[13px] font-bold text-[#4b5563]">
                    연관 검색어
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {relatedKeywords.map((item, idx) => (
                      <button
                        key={`${item.keyword}-${idx}`}
                        type="button"
                        onClick={() => setKeyword(item.keyword)}
                        className={`rounded-[14px] border px-4 py-3 text-left transition ${
                          item.keyword === searchedKeyword
                            ? "border-[#2563EB] bg-[#eff6ff]"
                            : "border-[#e5e7eb] bg-white hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className={`text-[13px] font-bold ${item.keyword === searchedKeyword ? "text-[#2563EB]" : "text-[#111827]"}`}>
                          {item.keyword}
                        </div>
                        <div className="mt-1 text-[12px] text-[#6b7280]">
                          전체 {formatCount(item.total)} · 모바일{" "}
                          {formatCount(item.mobile)} · PC{" "}
                          {formatCount(item.pc)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#f3f4f6] pt-4">
                <div className="text-[14px] font-semibold text-[#4b5563]">
                  {searchedKeyword
                    ? `“${searchedKeyword}” 분석 결과`
                    : "분석 결과가 여기에 표시됩니다."}
                </div>

                <div className="text-[12px] text-[#9ca3af]">
                  IP, 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-[18px] border border-[#fecaca] bg-white px-5 py-4 text-[14px] text-[#dc2626]">
              {error}
            </div>
          ) : null}

          {naverMapDataSource === "allSearch" ? (
            <div className="mt-4 rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
              네이버 지도 통합검색(allSearch) 목록 순서를 반영했습니다.
              token은 map.naver.com 검색 후 Network → allSearch → Query String
              token을 복사해 sessionStorage 키{" "}
              <code className="rounded bg-white/80 px-1">PLACE_ANALYSIS_NAVER_MAP_TOKEN</code>
              에 저장하거나 서버 환경변수{" "}
              <code className="rounded bg-white/80 px-1">NAVER_MAP_ALL_SEARCH_TOKEN</code>
              로 넣을 수 있습니다.
            </div>
          ) : null}
         
          {placeSearchHint ? (
            <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
              {placeSearchHint}
            </div>
          ) : null}

          {analysisDiagnostics?.compactSummary ? (
            <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-950">
              {analysisDiagnostics.compactSummary}
            </div>
          ) : analysisDiagnostics &&
            (analysisDiagnostics.hints.length > 0 ||
              analysisDiagnostics.dataSourceHint ||
              analysisDiagnostics.failureCode) ? (
            <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
              {analysisDiagnostics.failureCode ? (
                <div className="mb-2 text-[11px] font-medium text-amber-900/90">
                  진단 코드: {analysisDiagnostics.failureCode}
                  {analysisDiagnostics.resolvedSource
                    ? ` · 소스: ${analysisDiagnostics.resolvedSource}`
                    : ""}
                </div>
              ) : null}
              {analysisDiagnostics.dataSourceHint ? (
                <p className="mb-2 leading-relaxed">
                  {analysisDiagnostics.dataSourceHint}
                </p>
              ) : null}
              {analysisDiagnostics.hints.length > 0 ? (
                <ul className="list-disc space-y-1.5 pl-4 leading-relaxed">
                  {analysisDiagnostics.hints.map((h, i) => (
                    <li key={`${i}-${h.slice(0, 24)}`}>{h}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full">
                <thead>
                  <tr className="border-b border-[#f3f4f6] bg-[#fafafa]">
                    <th className="px-5 py-4 text-left text-[13px] font-bold text-[#6b7280]">
                      순위
                    </th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold text-[#6b7280]">
                      매장명
                    </th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold text-[#6b7280]">
                      카테고리
                    </th>
                    <th className="px-5 py-4 text-right text-[13px] font-bold text-[#6b7280]">
                      전체 리뷰
                    </th>
                    <th className="px-5 py-4 text-right text-[13px] font-bold text-[#6b7280]">
                      방문자
                    </th>
                    <th className="px-5 py-4 text-right text-[13px] font-bold text-[#6b7280]">
                      블로그
                    </th>
                    <th className="px-5 py-4 text-right text-[13px] font-bold text-[#6b7280]">
                      저장수
                    </th>
                    <th className="px-5 py-4 text-left text-[13px] font-bold text-[#6b7280]">
                      특징 키워드
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {renderedList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-14 text-center text-[14px] text-[#9ca3af]"
                      >
                        아직 분석 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    renderedList.map((item, idx) => (
                      <tr
                        key={`${item.placeId || item.name}-${idx}`}
                        className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]"
                      >
                        <td className="px-5 py-5 text-[18px] font-black text-[#111827]">
                          {item.rank}
                        </td>

                        <td className="px-5 py-5">
                          <div className="flex items-center gap-3">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-[56px] w-[56px] rounded-[12px] object-cover ring-1 ring-[#e5e7eb]"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[11px] text-[#9ca3af]">
                                없음
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[15px] font-bold text-[#111827]">
                                  {item.name}
                                </span>
                                {item.isPromotedAd ? (
                                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                    광고
                                  </span>
                                ) : null}
                              </div>
                              {item.address ? (
                                <div className="mt-1 text-[12px] text-[#9ca3af]">
                                  {item.address}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-5 text-[14px] font-semibold text-[#4b5563]">
                          {item.category || "-"}
                        </td>

                        <td className="px-5 py-5 text-right text-[15px] font-bold text-[#111827]">
                          {formatCount(item.review?.total)}
                        </td>

                        <td className="px-5 py-5 text-right text-[15px] font-semibold text-[#6b7280]">
                          {formatCount(item.review?.visitor)}
                        </td>

                        <td className="px-5 py-5 text-right text-[15px] font-semibold text-[#6b7280]">
                          {formatCount(item.review?.blog)}
                        </td>

                        <td className="px-5 py-5 text-right text-[15px] font-semibold text-[#111827]">
                          {formatCount(item.review?.save)}
                        </td>

                        <td className="px-5 py-5">
                          <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                            {item.keywords && item.keywords.length > 0 ? (
                              item.keywords.map((kw, i) => (
                                <span
                                  key={i}
                                  className="rounded-[6px] bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600 border border-blue-100"
                                >
                                  #{kw}
                                </span>
                              ))
                            ) : (
                              <span className="text-[12px] text-[#9ca3af]">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
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