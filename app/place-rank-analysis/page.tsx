"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";

import { GlobalLoading } from "@/components/global-loading";
import PlaceRankComparisonControls from "@/components/place-rank-comparison-controls";
import PlaceRankMobileResultItem, {
  PlaceRankMobileResultHeader,
} from "@/components/place-rank-mobile-result-item";
import {
  LoginRequiredModal,
  PublicPreviewBanner,
  useLoginRequiredPreview,
} from "@/components/login-required-preview";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import TopNav from "@/components/top-nav";
import {
  buildPreviousTop300RankMap,
  getDefaultTop300ComparisonDays,
  getTop300RankMovement,
  getTop300RankMovementLabel,
  type Top300ComparisonDays,
  type Top300RankHistory,
  type Top300RankMovement,
} from "@/lib/place-rank-top300-history";

const ROWS_PER_PAGE = 100;

type PlaceRankRow = {
  rank: number;
  placeId: string;
  name: string;
  category: string;
  thumbnail?: string;
  address?: string;
  rating: string | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCount: string | null;
};

type RankAnalysisResponse = {
  ok: boolean;
  message?: string;
  keyword: string;
  total: number;
  availableTotal: number;
  results: PlaceRankRow[];
  searchMode: "restaurant" | "place";
  source: "pcmap-place-list";
  naverRequestCount: number;
  requestOperationCount: number;
  completedPages: number;
  duplicateCount: number;
  partial: boolean;
  rankHistory?: Top300RankHistory;
  snapshotSaved?: boolean;
  snapshotWarning?: string;
};

const SAMPLE_PLACE_RANK_ROWS = [
  {
    placeId: "sample-place-01",
    name: "포스트 카페 성수",
    category: "카페, 디저트",
    rating: "4.8",
    visitorReviewCount: 2841,
    blogReviewCount: 728,
    saveCount: "12,480",
  },
  {
    placeId: "sample-place-02",
    name: "서울숲 브런치 키친",
    category: "브런치",
    rating: "4.7",
    visitorReviewCount: 2156,
    blogReviewCount: 614,
    saveCount: "9,320",
  },
  {
    placeId: "sample-place-03",
    name: "성수 베이커리 랩",
    category: "베이커리",
    rating: "4.6",
    visitorReviewCount: 1934,
    blogReviewCount: 482,
    saveCount: "8,760",
  },
  {
    placeId: "sample-place-04",
    name: "어반 로스터스",
    category: "카페",
    rating: "4.7",
    visitorReviewCount: 1752,
    blogReviewCount: 395,
    saveCount: "7,910",
  },
  {
    placeId: "sample-place-05",
    name: "스튜디오 다이닝",
    category: "이탈리아음식",
    rating: "4.5",
    visitorReviewCount: 1628,
    blogReviewCount: 351,
    saveCount: "6,840",
  },
  {
    placeId: "sample-place-06",
    name: "모먼트 커피바",
    category: "카페, 디저트",
    rating: "4.6",
    visitorReviewCount: 1489,
    blogReviewCount: 327,
    saveCount: "6,210",
  },
  {
    placeId: "sample-place-07",
    name: "테라스 파스타 하우스",
    category: "스파게티, 파스타전문",
    rating: "4.5",
    visitorReviewCount: 1314,
    blogReviewCount: 298,
    saveCount: "5,740",
  },
  {
    placeId: "sample-place-08",
    name: "데일리 샐러드 성수",
    category: "다이어트, 샐러드",
    rating: "4.4",
    visitorReviewCount: 1186,
    blogReviewCount: 244,
    saveCount: "4,980",
  },
  {
    placeId: "sample-place-09",
    name: "브릭하우스 디저트",
    category: "디저트",
    rating: "4.6",
    visitorReviewCount: 1042,
    blogReviewCount: 221,
    saveCount: "4,620",
  },
  {
    placeId: "sample-place-10",
    name: "오후의 티룸",
    category: "차",
    rating: "4.5",
    visitorReviewCount: 938,
    blogReviewCount: 184,
    saveCount: "4,110",
  },
  {
    placeId: "sample-place-11",
    name: "레이어드 샌드위치",
    category: "샌드위치",
    rating: "4.4",
    visitorReviewCount: 824,
    blogReviewCount: 169,
    saveCount: "3,670",
  },
  {
    placeId: "sample-place-12",
    name: "그린테이블 성수",
    category: "양식",
    rating: "4.3",
    visitorReviewCount: 716,
    blogReviewCount: 142,
    saveCount: "3,240",
  },
].map(
  (row, index): PlaceRankRow => ({
    rank: index + 1,
    ...row,
  })
);

const SAMPLE_PLACE_RANK_ANALYSIS: RankAnalysisResponse = {
  ok: true,
  keyword: "성수 카페",
  total: SAMPLE_PLACE_RANK_ROWS.length,
  availableTotal: 842,
  results: SAMPLE_PLACE_RANK_ROWS,
  searchMode: "restaurant",
  source: "pcmap-place-list",
  naverRequestCount: 0,
  requestOperationCount: 0,
  completedPages: 0,
  duplicateCount: 0,
  partial: false,
};

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString("ko-KR") : "-";
}

function formatTextMetric(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function mobileNaverPlaceUrl(
  placeId: string,
  searchMode: "restaurant" | "place"
): string {
  return `https://m.place.naver.com/${searchMode}/${encodeURIComponent(
    placeId
  )}/home`;
}

function pcNaverPlaceUrl(placeId: string): string {
  return `https://map.naver.com/p/entry/place/${encodeURIComponent(
    placeId
  )}?c=15.00,0,0,0,dh`;
}

function rankMovementTone(movement: Top300RankMovement): string {
  if (movement.kind === "up") return "text-[#ef4444]";
  if (movement.kind === "down") return "text-[#2563eb]";
  if (movement.kind === "new") return "text-[#2563eb]";
  return "text-[#9ca3af]";
}

function rankMovementAccessibleLabel(movement: Top300RankMovement): string {
  if (movement.kind === "up") {
    return `이전 ${movement.previousRank}위 대비 ${movement.amount}위 상승`;
  }
  if (movement.kind === "down") {
    return `이전 ${movement.previousRank}위 대비 ${movement.amount}위 하락`;
  }
  if (movement.kind === "new") return "비교일 TOP300 신규 진입";
  return `이전 ${movement.previousRank}위와 동일`;
}

function PlaceRankCell({
  rank,
  placeId,
  previousRanks,
}: {
  rank: number;
  placeId: string;
  previousRanks: ReadonlyMap<string, number> | null;
}) {
  const movement = previousRanks
    ? getTop300RankMovement(rank, placeId, previousRanks)
    : null;

  return (
    <td className="px-3 py-2.5 text-center font-black tabular-nums">
      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
        <span className="text-[#2563eb]">{rank}</span>
        {movement ? (
          <span
            data-rank-movement={movement.kind}
            aria-label={rankMovementAccessibleLabel(movement)}
            className={`text-[10px] font-extrabold md:text-[11px] ${rankMovementTone(
              movement
            )}`}
          >
            {getTop300RankMovementLabel(movement)}
          </span>
        ) : null}
      </div>
    </td>
  );
}

export default function PlaceRankAnalysisPage() {
  const { status } = useSession();
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<RankAnalysisResponse | null>(null);
  const [resultQuery, setResultQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedComparisonDays, setSelectedComparisonDays] =
    useState<Top300ComparisonDays | null>(null);
  const isPreview = status === "unauthenticated";
  const { guardAction, loginRequiredOpen, closeLoginRequired } =
    useLoginRequiredPreview(isPreview);
  const displayedAnalysis = isPreview ? SAMPLE_PLACE_RANK_ANALYSIS : analysis;
  const rankHistory = isPreview ? undefined : displayedAnalysis?.rankHistory;

  const historySnapshotsByDays = useMemo(
    () =>
      new Map(
        (rankHistory?.snapshots ?? []).map((snapshot) => [
          snapshot.daysAgo,
          snapshot,
        ] as const)
      ),
    [rankHistory]
  );
  const selectedSnapshot =
    selectedComparisonDays === null
      ? null
      : historySnapshotsByDays.get(selectedComparisonDays) ?? null;
  const previousRanks = useMemo(
    () =>
      selectedSnapshot
        ? buildPreviousTop300RankMap(selectedSnapshot.rankedPlaceIds)
        : null,
    [selectedSnapshot]
  );

  const filteredResults = useMemo(() => {
    if (!displayedAnalysis) return [];
    const query = resultQuery.trim().toLowerCase();
    if (!query) return displayedAnalysis.results;
    return displayedAnalysis.results.filter(
      (row) =>
        row.name.toLowerCase().includes(query) ||
        row.placeId.toLowerCase().includes(query)
    );
  }, [displayedAnalysis, resultQuery]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredResults.length / ROWS_PER_PAGE)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const visibleResults = filteredResults.slice(
    (safeCurrentPage - 1) * ROWS_PER_PAGE,
    safeCurrentPage * ROWS_PER_PAGE
  );

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "loading") return;
    if (guardAction(event)) return;
    if (loading) return;

    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("검색 키워드를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysis(null);
    setResultQuery("");
    setCurrentPage(1);
    setSelectedComparisonDays(null);

    try {
      const response = await fetch("/api/rank-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed }),
      });
      const raw = await response.text();
      let data: RankAnalysisResponse | null = null;

      try {
        data = JSON.parse(raw) as RankAnalysisResponse;
      } catch {
        data = null;
      }

      if (!response.ok || !data?.ok) {
        setError(
          data?.message ||
            `순위 분석 서버 응답을 확인할 수 없습니다. (${response.status})`
        );
        return;
      }

      setAnalysis({
        ...data,
        results: Array.isArray(data.results) ? data.results : [],
      });
      setSelectedComparisonDays(
        getDefaultTop300ComparisonDays(data.rankHistory?.snapshots ?? [])
      );
    } catch (requestError) {
      console.error("rank-analysis request error", requestError);
      setError("순위 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopNav active="place-rank-analysis" />
      {loading ? (
        <GlobalLoading message="PC TOP 300 순위를 조회하고 있습니다..." />
      ) : null}

      <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111827] md:pt-24">
        <section className="mx-auto max-w-[1240px] px-3 py-2 md:px-6 md:py-5 lg:px-8">
          {isPreview ? (
            <PublicPreviewBanner message="비로그인 미리보기 화면입니다. 샘플 데이터와 화면 구성을 확인할 수 있으며, 실제 순위 조회는 로그인 후 이용 가능합니다." />
          ) : null}
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-5 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-3 md:gap-4">
              <div>
                <h1 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                  네이버 플레이스 순위분석 TOP300
                </h1>
                <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">
                  검색 키워드를 기준으로 네이버 PC 플레이스 검색 순위를 최대
                  300위까지 빠르게 확인합니다.
                </p>
              </div>

              <form
                className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3"
                onSubmit={handleSearch}
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={keyword}
                    onChange={(event) => {
                      setKeyword(event.target.value);
                      if (error) setError("");
                    }}
                    placeholder="검색 키워드를 입력하세요"
                    aria-label="플레이스 순위 검색 키워드"
                    maxLength={100}
                    className="h-[40px] w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[12px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white md:h-[54px] md:rounded-[16px] md:px-4 md:pr-11 md:text-[15px]"
                  />
                  {keyword ? (
                    <button
                      type="button"
                      onClick={() => setKeyword("")}
                      aria-label="키워드 지우기"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#6b7280] md:right-4 md:text-[22px]"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <PostlabsSlideHoverButton
                  type="submit"
                  variant="primary"
                  disabled={loading || status === "loading"}
                  className="h-[40px] min-w-[96px] shrink-0 rounded-[12px] bg-[#333333] px-4 text-[12px] font-bold text-white disabled:opacity-60 md:h-[54px] md:min-w-[116px] md:rounded-[16px] md:px-7 md:text-[15px]"
                >
                  {loading ? "조회 중..." : "순위 검색"}
                </PostlabsSlideHoverButton>
              </form>

              {error ? (
                <div
                  role="alert"
                  className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-semibold text-red-700 md:rounded-[14px] md:px-4 md:text-[13px]"
                >
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          {displayedAnalysis ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4 md:gap-3">
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    분석 키워드
                  </div>
                  <div className="mt-1 truncate text-[14px] font-black text-[#111827] md:text-[16px]">
                    {displayedAnalysis.keyword}
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    조회 결과
                  </div>
                  <div className="mt-1 text-[14px] font-black text-[#111827] md:text-[16px]">
                    {formatCount(displayedAnalysis.total)}개
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:mt-4 md:rounded-[22px]">
                <div className="border-b border-[#e5e7eb] px-3 py-3 md:px-5 md:py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-[14px] font-black text-[#111827] md:text-[17px]">
                        플레이스 순위표
                      </h2>
                      <p className="mt-0.5 text-[10px] text-[#9ca3af] md:text-[11px]">
                        {resultQuery
                          ? `검색 결과 ${formatCount(filteredResults.length)}개`
                          : `${formatCount(displayedAnalysis.total)}개 결과 중 ${
                              visibleResults[0]?.rank ?? 0
                            }~${visibleResults.at(-1)?.rank ?? 0}위`}
                      </p>
                    </div>
                    <input
                      type="search"
                      value={resultQuery}
                      onChange={(event) => {
                        setResultQuery(event.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="업체명·플레이스ID 검색"
                      aria-label="수집 결과에서 업체명 또는 플레이스ID 검색"
                      className="h-9 w-full rounded-[10px] border border-[#d1d5db] bg-[#fafafa] px-3 text-[11px] outline-none placeholder:text-[#9ca3af] focus:border-[#2563eb] focus:bg-white md:w-[260px] md:text-[12px]"
                    />
                  </div>

                  <PlaceRankComparisonControls
                    history={rankHistory}
                    selectedDays={selectedComparisonDays}
                    warning={displayedAnalysis.snapshotWarning}
                    onSelect={setSelectedComparisonDays}
                  />
                </div>

                <div
                  data-mobile-place-rank-results
                  className="md:hidden"
                >
                  <PlaceRankMobileResultHeader />
                  <div
                    role="list"
                    aria-label="모바일 플레이스 순위 결과"
                    className="divide-y divide-[#eef0f3]"
                  >
                    {visibleResults.map((row) => (
                      <PlaceRankMobileResultItem
                        key={row.placeId}
                        row={row}
                        previousRanks={previousRanks}
                      />
                    ))}
                  </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[1000px] table-fixed border-collapse">
                    <thead className="bg-[#f8fafc]">
                      <tr className="border-b border-[#e5e7eb] text-[10px] font-bold text-[#6b7280] md:text-[11px]">
                        <th className="w-[92px] px-3 py-2.5 text-center">순위</th>
                        <th className="px-3 py-2.5 text-left">업체명</th>
                        <th className="w-[76px] px-3 py-2.5 text-right">평점</th>
                        <th className="w-[112px] px-3 py-2.5 text-right">방문자리뷰</th>
                        <th className="w-[112px] px-3 py-2.5 text-right">블로그리뷰</th>
                        <th className="w-[108px] px-3 py-2.5 text-right">저장수</th>
                        <th className="w-[132px] px-3 py-2.5 text-center">바로가기</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResults.map((row) => (
                        <tr
                          key={row.placeId}
                          className="border-b border-[#eef0f3] text-[11px] last:border-b-0 hover:bg-[#f8fafc] md:text-[12px]"
                        >
                          <PlaceRankCell
                            rank={row.rank}
                            placeId={row.placeId}
                            previousRanks={previousRanks}
                          />
                          <td className="px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              {row.thumbnail ? (
                                <img
                                  src={row.thumbnail}
                                  alt={`${row.name} 대표 이미지`}
                                  width={40}
                                  height={40}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="h-10 w-10 shrink-0 rounded-[9px] border border-[#eef0f3] object-cover"
                                />
                              ) : (
                                <div
                                  aria-hidden="true"
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-[#eef0f3] bg-[#f8fafc] text-[8px] font-bold text-[#cbd5e1]"
                                >
                                  이미지
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="truncate font-bold text-[#111827]">
                                  {row.name}
                                </div>
                                <div className="mt-0.5 truncate text-[10px] text-[#9ca3af]">
                                  {row.category || "카테고리 정보 없음"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#374151]">
                            {formatTextMetric(row.rating)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#4b5563]">
                            {formatCount(row.visitorReviewCount)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#4b5563]">
                            {formatCount(row.blogReviewCount)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[#4b5563]">
                            {formatTextMetric(row.saveCount)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <a
                                href={
                                  isPreview
                                    ? "#login-required"
                                    : mobileNaverPlaceUrl(
                                        row.placeId,
                                        displayedAnalysis.searchMode
                                      )
                                }
                                target={isPreview ? undefined : "_blank"}
                                rel={isPreview ? undefined : "noopener noreferrer"}
                                onClick={
                                  isPreview
                                    ? (event) => void guardAction(event)
                                    : undefined
                                }
                                aria-label={`${row.name} 모바일 네이버 플레이스${
                                  isPreview ? " (로그인 필요)" : " 새 탭에서 열기"
                                }`}
                                className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-[8px] border border-[#dbe3ee] bg-white px-2 text-[10px] font-bold text-[#2563eb] transition hover:border-[#93b4f8] hover:bg-[#eff6ff]"
                              >
                                모바일
                              </a>
                              <a
                                href={
                                  isPreview
                                    ? "#login-required"
                                    : pcNaverPlaceUrl(row.placeId)
                                }
                                target={isPreview ? undefined : "_blank"}
                                rel={isPreview ? undefined : "noopener noreferrer"}
                                onClick={
                                  isPreview
                                    ? (event) => void guardAction(event)
                                    : undefined
                                }
                                aria-label={`${row.name} PC 네이버 플레이스${
                                  isPreview ? " (로그인 필요)" : " 새 탭에서 열기"
                                }`}
                                className="inline-flex h-7 items-center justify-center rounded-[8px] border border-[#dbe3ee] bg-white px-2.5 text-[10px] font-bold text-[#2563eb] transition hover:border-[#93b4f8] hover:bg-[#eff6ff]"
                              >
                                PC
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {visibleResults.length === 0 ? (
                  <div className="px-4 py-12 text-center text-[12px] text-[#9ca3af]">
                    일치하는 업체가 없습니다.
                  </div>
                ) : null}

                {filteredResults.length > ROWS_PER_PAGE ? (
                  <div className="flex items-center justify-center gap-1 border-t border-[#e5e7eb] px-3 py-3">
                    <button
                      type="button"
                      disabled={safeCurrentPage === 1}
                      onClick={() =>
                        setCurrentPage((page) => Math.max(1, page - 1))
                      }
                      className="h-8 rounded-[9px] border border-[#d1d5db] px-3 text-[11px] font-bold text-[#4b5563] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      이전
                    </button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                      (page) => (
                        <button
                          key={page}
                          type="button"
                          aria-current={safeCurrentPage === page ? "page" : undefined}
                          onClick={() => setCurrentPage(page)}
                          className={`h-8 min-w-8 rounded-[9px] px-2 text-[11px] font-black ${
                            safeCurrentPage === page
                              ? "bg-[#2563eb] text-white"
                              : "border border-[#d1d5db] bg-white text-[#4b5563]"
                          }`}
                        >
                          {page}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      disabled={safeCurrentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((page) => Math.min(totalPages, page + 1))
                      }
                      className="h-8 rounded-[9px] border border-[#d1d5db] px-3 text-[11px] font-bold text-[#4b5563] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      다음
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      </main>
      <LoginRequiredModal
        open={loginRequiredOpen}
        onClose={closeLoginRequired}
      />
    </>
  );
}
