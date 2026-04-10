"use client";

import { useEffect, useMemo, useState } from "react";
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
    visitor?: number;
    blog?: number;
    save?: string | number;
  };
};

type SavedPlaceItem = {
  id: string;
  name: string;
  placeUrl?: string | null;
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

function extractPublicPlaceId(placeUrl?: string | null) {
  if (!placeUrl) return "";

  const matched =
    placeUrl.match(/restaurant\/(\d+)/) ||
    placeUrl.match(/place\/(\d+)/) ||
    placeUrl.match(/placeId=(\d+)/) ||
    placeUrl.match(/entry\/place\/(\d+)/);

  return matched?.[1] ?? "";
}

function buildMobilePlaceLink(placeId?: string) {
  if (!placeId) return "";
  return `https://m.place.naver.com/restaurant/${placeId}/home`;
}

export default function PlaceAnalysisPage() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedKeyword, setSearchedKeyword] = useState("");
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordItem[]>(
    []
  );
  const [list, setList] = useState<RankPlaceItem[]>([]);
  const [error, setError] = useState("");

  const [savedRankPlaceIds, setSavedRankPlaceIds] = useState<Set<string>>(new Set());
  const [savedReviewPlaceIds, setSavedReviewPlaceIds] = useState<Set<string>>(new Set());
  const [registeringKey, setRegisteringKey] = useState<string | null>(null);

 const loadSavedPlaces = async () => {
  try {
    const [rankRes, reviewRes] = await Promise.all([
      fetch("/api/place-list", {
        cache: "no-store",
        credentials: "include",
      }),
      fetch("/api/place-review-list", {
        cache: "no-store",
        credentials: "include",
      }),
    ]);

    const rankSet = new Set<string>();
    const reviewSet = new Set<string>();

    if (rankRes.ok) {
      const rankData = await rankRes.json();
      const rankPlaces: SavedPlaceItem[] = Array.isArray(rankData?.places)
        ? rankData.places
        : [];

      for (const place of rankPlaces) {
        const publicPlaceId = extractPublicPlaceId(place.placeUrl);
        if (publicPlaceId) rankSet.add(publicPlaceId);
      }
    }

    if (reviewRes.ok) {
      const reviewData = await reviewRes.json();
      const reviewPlaces: SavedPlaceItem[] = Array.isArray(reviewData?.places)
        ? reviewData.places
        : [];

      for (const place of reviewPlaces) {
        const publicPlaceId = extractPublicPlaceId(place.placeUrl);
        if (publicPlaceId) reviewSet.add(publicPlaceId);
      }
    }

    setSavedRankPlaceIds(rankSet);
    setSavedReviewPlaceIds(reviewSet);
  } catch (e) {
    console.error("saved places load error:", e);
  }
};

  useEffect(() => {
    loadSavedPlaces();
  }, []);

  const handleAnalyze = async () => {
    const trimmed = keyword.trim();

    if (!trimmed) {
      alert("키워드를 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/place-rank-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
      console.error(e);
      setError("분석 중 오류가 발생했습니다.");
      setRelatedKeywords([]);
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPlace = async (
  item: RankPlaceItem,
  mode: "review" | "rank"
) => {
  const placeId = String(item.placeId || "").trim();
  const key = `${mode}-${placeId || item.name}`;

  if (!placeId) {
    alert("placeId가 없어 등록할 수 없습니다.");
    return;
  }

  try {
    setRegisteringKey(key);

    const endpoint =
      mode === "review" ? "/api/place-review-save" : "/api/place-save";

    const saveRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: item.name,
        category: item.category || "",
        address: item.address || "",
        jibunAddress: item.address || "",
        placeUrl: buildMobilePlaceLink(placeId),
        imageUrl: item.imageUrl || "",
        x: null,
        y: null,
      }),
    });

    const saveData = await saveRes.json();

    if (!saveRes.ok) {
      alert(saveData?.error || saveData?.message || "매장 등록 실패");
      return;
    }

   if (mode === "review") {
  const createdPlaceId = String(
    saveData?.place?.id || saveData?.data?.id || ""
  ).trim();

  if (createdPlaceId) {
    try {
      await fetch("/api/place-review-track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: createdPlaceId,
        }),
      });
    } catch (e) {
      console.error("review track init error:", e);
    }
  }

  setSavedReviewPlaceIds((prev) => {
    const next = new Set(prev);
    next.add(placeId);
    return next;
  });

  alert("리뷰추적 등록 완료");
  await loadSavedPlaces();
  return;
}

setSavedRankPlaceIds((prev) => {
  const next = new Set(prev);
  next.add(placeId);
  return next;
});

alert("순위추적 등록 완료");
await loadSavedPlaces();

 


  } catch (e) {
    console.error(e);
    alert("등록 중 오류가 발생했습니다.");
  } finally {
    setRegisteringKey(null);
  }
};

  const renderedList = useMemo(() => list, [list]);

  return (
    <>
      <TopNav active="place-analysis" />

      <main className="min-h-screen bg-[#f4f4f5] text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    매장 순위 분석
                  </h1>
                </div>

                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  검색한 키워드 기준으로 네이버 플레이스 순위와 리뷰 지표를
                  확인합니다.
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
                    className="h-[54px] w-full rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[15px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
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
                  onClick={handleAnalyze}
                  disabled={loading}
                  className={`h-[54px] rounded-[16px] bg-[#b91c1c] px-7 text-[15px] font-bold text-white transition hover:bg-[#991b1b] ${
                    loading ? "opacity-60" : ""
                  }`}
                >
                  {loading ? "분석 중..." : "분석"}
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
                            ? "border-[#b91c1c] bg-[#fef2f2]"
                            : "border-[#e5e7eb] bg-white hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className="text-[13px] font-bold text-[#111827]">
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

          <div className="mt-5 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full">
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
                    <th className="px-5 py-4 text-center text-[13px] font-bold text-[#6b7280]">
                      리뷰추적
                    </th>
                    <th className="px-5 py-4 text-center text-[13px] font-bold text-[#6b7280]">
                      순위추적
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {renderedList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-5 py-14 text-center text-[14px] text-[#9ca3af]"
                      >
                        아직 분석 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    renderedList.map((item, idx) => {
                      const placeId = String(item.placeId || "").trim();
                      const isReviewRegistered = savedReviewPlaceIds.has(placeId);
const isRankRegistered = savedRankPlaceIds.has(placeId);
                      const reviewKey = `review-${placeId || item.name}`;
                      const rankKey = `rank-${placeId || item.name}`;

                      return (
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
                                <div className="text-[15px] font-bold text-[#111827]">
                                  {item.name}
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

                          <td className="px-5 py-5 text-center">
                            {isReviewRegistered ? (
                              <button
                                disabled
                                className="h-[42px] rounded-[14px] border border-[#d1d5db] bg-[#f9fafb] px-5 text-[14px] font-bold text-[#9ca3af]"
                              >
                                등록됨
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handleRegisterPlace(item, "review")
                                }
                                disabled={registeringKey === reviewKey}
                                className={`h-[42px] rounded-[14px] bg-[#b91c1c] px-5 text-[14px] font-bold text-white transition hover:bg-[#991b1b] ${
                                  registeringKey === reviewKey
                                    ? "opacity-60"
                                    : ""
                                }`}
                              >
                                {registeringKey === reviewKey
                                  ? "등록 중..."
                                  : "등록"}
                              </button>
                            )}
                          </td>

                          <td className="px-5 py-5 text-center">
                            {isRankRegistered ? (
                              <button
                                disabled
                                className="h-[42px] rounded-[14px] border border-[#d1d5db] bg-[#f9fafb] px-5 text-[14px] font-bold text-[#9ca3af]"
                              >
                                등록됨
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRegisterPlace(item, "rank")}
                                disabled={registeringKey === rankKey}
                                className={`h-[42px] rounded-[14px] bg-[#b91c1c] px-5 text-[14px] font-bold text-white transition hover:bg-[#991b1b] ${
                                  registeringKey === rankKey ? "opacity-60" : ""
                                }`}
                              >
                                {registeringKey === rankKey
                                  ? "등록 중..."
                                  : "등록"}
                              </button>
                            )}
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