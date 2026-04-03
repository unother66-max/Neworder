"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import TopNav from "@/components/top-nav";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type PlaceRankHistory = {
  id: string;
  rank: number | null;
  createdAt: string;
};

type PlaceKeyword = {
  id: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  isTracking: boolean;
  histories: PlaceRankHistory[];
};

type PlaceDetail = {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  placeUrl: string | null;
  imageUrl: string | null;
  keywords: PlaceKeyword[];
  rankHistory: {
    id: string;
    placeId: string;
    keyword: string;
    rank: number | null;
    createdAt: string;
  }[];

  placeMonthlyVolume?: number | null;
  placeMobileVolume?: number | null;
  placePcVolume?: number | null;
};

function formatDateLabel(value: string) {
  const date = new Date(value);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function formatCount(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("ko-KR");
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

function buildPlaceLinks(publicPlaceId: string, name: string) {
  const encodedQuery = encodeURIComponent(name.trim());

  return {
    mobilePlaceLink: publicPlaceId
      ? `https://m.place.naver.com/restaurant/${publicPlaceId}/home`
      : `https://m.map.naver.com/search2/search.naver?query=${encodedQuery}`,
    pcPlaceLink: publicPlaceId
      ? `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`
      : `https://map.naver.com/p/search/${encodedQuery}`,
  };
}

function getRankMeta(rank: number | null) {
  if (rank === null || rank === undefined) {
    return { main: "-", sub: "-" };
  }

  const page = Math.ceil(rank / 15);
  const pagePosition = ((rank - 1) % 15) + 1;

  return {
    main: `${rank}위`,
    sub: `${page}p ${pagePosition}위`,
  };
}


function getDateKey(value: string) {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function PlaceDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const [mounted, setMounted] = useState(false);
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKeywordId, setSelectedKeywordId] = useState<string>("");
  const [updating, setUpdating] = useState(false);
  const [trackingUpdating, setTrackingUpdating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!id) return;

    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/place-detail?id=${id}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "상세 조회 실패");
          return;
        }

        setPlace(data.place || null);
      } catch (e) {
        console.error(e);
        setError("상세 조회 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  useEffect(() => {
    if (!place?.keywords?.length) return;
    if (selectedKeywordId) return;
    setSelectedKeywordId(place.keywords[0].id);
  }, [place, selectedKeywordId]);

  const handleUpdateRanks = async () => {
  if (!place) return;

  const publicPlaceId = extractPublicPlaceId(place.placeUrl);

  if (!publicPlaceId) {
    alert("placeId가 없어 업데이트할 수 없어요.");
    return;
  }

  if (!place.keywords.length) {
    alert("등록된 키워드가 없어요.");
    return;
  }


  try {
    setUpdating(true);

    await Promise.all(
      place.keywords.map(async (keyword) => {
        const response = await fetch("/api/check-place-rank", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            keyword: keyword.keyword,
            placeId: publicPlaceId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          return;
        }

        if (keyword.id && data.rank && data.rank !== "-") {
          await fetch("/api/place-rank-history-save", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              placeKeywordId: keyword.id,
              rank: Number(String(data.rank).match(/\d+/)?.[0] ?? 0),
            }),
          });
        }
      })
    );

    const res = await fetch(`/api/place-detail?id=${id}`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "업데이트 후 새로고침 실패");
      return;
    }

    setPlace(data.place || null);
    alert("순위 업데이트 완료");
  } catch (error) {
    console.error(error);
    alert("업데이트 중 오류가 발생했습니다.");
  } finally {
    setUpdating(false);
  }
};

const handleToggleTracking = async () => {
  if (!place) return;

  if (!place.keywords.length) {
    alert("먼저 키워드를 등록해주세요.");
    return;
  }

  const nextValue = !place.keywords.every((keyword) => keyword.isTracking);

  try {
    setTrackingUpdating(true);

    const res = await fetch("/api/toggle-tracking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placeId: place.id,
        isTracking: nextValue,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "자동추적 상태 변경 실패");
      return;
    }

    setPlace((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        keywords: prev.keywords.map((keyword) => ({
          ...keyword,
          isTracking: nextValue,
        })),
      };
    });
  } catch (error) {
    console.error(error);
    alert("자동추적 상태 변경 중 오류가 발생했습니다.");
  } finally {
    setTrackingUpdating(false);
  }
};

  const placeLinks = useMemo(() => {
    if (!place) {
      return {
        mobilePlaceLink: "",
        pcPlaceLink: "",
      };
    }


    const publicPlaceId = extractPublicPlaceId(place.placeUrl);
    return buildPlaceLinks(publicPlaceId, place.name);
  }, [place]);

  const summaryKeyword = place?.keywords?.[0] ?? null;

const isAllTrackingOn =
  !!place?.keywords?.length &&
  place.keywords.every((keyword) => keyword.isTracking);

  const allHistoryRows = useMemo(() => {
  if (!place) return [];

  const map = new Map<
    string,
    {
      createdAt: string;
      values: Record<
        string,
        {
          rank: number | null;
          historyId: string;
        }
      >;
    }
  >();

  place.keywords.forEach((keyword) => {
    (keyword.histories || []).forEach((history) => {
      const key = getDateKey(history.createdAt);

      if (!map.has(key)) {
        map.set(key, {
          createdAt: key,
          values: {},
        });
      }

      map.get(key)!.values[keyword.id] = {
        rank: history.rank,
        historyId: history.id,
      };
    });
  });

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
}, [place]);

  const selectedKeyword = useMemo(() => {
    if (!place) return null;
    return (
      place.keywords.find((keyword) => keyword.id === selectedKeywordId) ?? null
    );
  }, [place, selectedKeywordId]);

const chartData = useMemo(() => {
  if (!selectedKeyword || !place) return [];

  return (place.rankHistory || [])
    .filter(
      (item) =>
        item.keyword === selectedKeyword.keyword &&
        item.rank !== null &&
        item.rank !== undefined
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .map((item) => ({
      label: formatDateLabel(item.createdAt),
      shortLabel: formatDateLabel(item.createdAt).slice(0, 5),
      rank: item.rank as number,
      fullDate: item.createdAt,
    }));
}, [selectedKeyword, place]);

  const rankValues = chartData.map((item) => item.rank);
  const yMin = rankValues.length ? Math.max(1, Math.min(...rankValues) - 2) : 1;
  const yMax = rankValues.length ? Math.max(...rankValues) + 2 : 50;

  if (!mounted) return null;

  return (
    <>
      <TopNav active="place" />

      <main
        className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]"
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard", "Noto Sans KR", sans-serif',
        }}
      >
        <section className="mx-auto max-w-[1280px] px-6 py-8">
          {loading ? (
            <div className="rounded-[18px] border border-[#e5e5ea] bg-white px-6 py-8 text-[13px] text-[#6e6e73]">
              불러오는 중...
            </div>
          ) : error ? (
            <div className="rounded-[18px] border border-[#ffd6d6] bg-white px-6 py-8 text-[13px] text-[#ff4d4f]">
              {error}
            </div>
          ) : !place ? (
            <div className="rounded-[18px] border border-[#e5e5ea] bg-white px-6 py-8 text-[13px] text-[#6e6e73]">
              매장 정보가 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-[20px] border border-[#e5e5ea] bg-white px-6 py-6 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-start gap-4">
                    {place.imageUrl ? (
                      <img
                        src={place.imageUrl}
                        alt={place.name}
                        className="h-[88px] w-[88px] rounded-[14px] object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[14px] bg-[#f2f2f7] text-[12px] text-[#8e8e93]">
                        이미지
                      </div>
                    )}

                    <div className="pt-1">
                      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#6e6e73]">
                        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                          {place.name}
                        </h1>
                        <span>{place.category || "-"}</span>
                        <span>|</span>
                        <span>{place.address || "-"}</span>
                      </div>

                     <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-[#6e6e73]">
  <span>
    월 검색량{" "}
    <strong className="font-semibold text-[#1d1d1f]">
      {formatCount(place.placeMonthlyVolume)}
    </strong>
  </span>
  <span>📱 {formatCount(place.placeMobileVolume)}</span>
  <span>🖥 {formatCount(place.placePcVolume)}</span>
</div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                        <span className="text-[#6e6e73]">매장 바로가기</span>

                        <a
                          href={placeLinks.mobilePlaceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[#1d1d1f] underline underline-offset-2"
                        >
                          모바일
                        </a>

                        <a
                          href={placeLinks.pcPlaceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[#1d1d1f] underline underline-offset-2"
                        >
                          PC
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                  <button
  onClick={handleToggleTracking}
  disabled={trackingUpdating || !place?.keywords?.length}
  className="rounded-[12px] bg-[#f2f2f7] px-4 py-2 text-[12px] font-semibold text-[#1d1d1f] disabled:cursor-not-allowed disabled:opacity-60"
>
  자동 추적{" "}
  <span
    className={
      isAllTrackingOn
        ? "text-[#10b981]"
        : "text-[#ff6b6b]"
    }
  >
    {trackingUpdating
      ? "변경중..."
      : isAllTrackingOn
        ? "ON"
        : "OFF"}
  </span>
</button>

                    <button className="rounded-[12px] bg-[#f2f2f7] px-4 py-2 text-[12px] font-semibold text-[#1d1d1f]">
                      키워드 관리
                    </button>

                    <button
  onClick={handleUpdateRanks}
  disabled={updating}
  className="rounded-[12px] bg-[#f2f2f7] px-4 py-2 text-[12px] font-semibold text-[#1d1d1f] disabled:cursor-not-allowed disabled:opacity-60"
>
  {updating ? "업데이트중..." : "업데이트"}
</button>
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-[#e5e5ea] bg-white shadow-sm">
                <div className="border-b border-[#ececf1] px-6 py-4">
                  <div className="text-[18px] font-semibold tracking-[-0.02em]">
                    추적 키워드 {place.keywords.length}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#f7f7fa]">
                      <tr>
                        <th className="px-5 py-4 text-left text-[12px] font-semibold text-[#6e6e73]">
                          키워드
                        </th>
                        {place.keywords.map((keyword) => (
                          <th
                            key={keyword.id}
                            className="min-w-[180px] border-l border-[#ececf1] px-4 py-4 text-left"
                          >
                            <div className="text-[13px] font-semibold text-[#1d1d1f]">
                              {keyword.keyword}
                            </div>
                            <div className="mt-2 space-y-1 text-[11px] text-[#6e6e73]">
                              <div>월 검색량 {formatCount(keyword.totalVolume)}</div>
                              <div>📱 {formatCount(keyword.mobileVolume)}</div>
                              <div>🖥 {formatCount(keyword.pcVolume)}</div>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {allHistoryRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={place.keywords.length + 1}
                            className="px-6 py-14 text-center text-[12px] text-[#8e8e93]"
                          >
                            아직 저장된 순위 이력이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        allHistoryRows.map((row) => (
                          <tr key={row.createdAt} className="border-t border-[#ececf1]">
                            <td className="whitespace-nowrap px-5 py-4 align-top text-[12px] text-[#3a3a3c]">
                              {formatDateLabel(row.createdAt)}
                            </td>

                            {place.keywords.map((keyword) => {
                              const current = row.values[keyword.id];
                              const currentRank = current?.rank ?? null;

                              const rankMeta = getRankMeta(currentRank);

                              const keywordHistories = keyword.histories || [];
                              const currentIndex = keywordHistories.findIndex(
  (item) => getDateKey(item.createdAt) === row.createdAt
);

                              const previousRank =
                                currentIndex >= 0 &&
                                currentIndex + 1 < keywordHistories.length
                                  ? keywordHistories[currentIndex + 1].rank
                                  : null;

                              let diff: number | null = null;
                              if (
                                currentRank !== null &&
                                previousRank !== null &&
                                currentRank !== undefined &&
                                previousRank !== undefined
                              ) {
                                diff = previousRank - currentRank;
                              }

                              return (
                                <td
                                  key={`${row.createdAt}-${keyword.id}`}
                                  className="border-l border-[#ececf1] px-4 py-4 align-top"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-[13px] font-semibold text-[#1d1d1f]">
                                        {rankMeta.main}
                                      </div>
                                      <div className="mt-1 text-[11px] text-[#8e8e93]">
                                        {rankMeta.sub}
                                      </div>
                                    </div>

                                    <div className="pt-[2px] text-[11px] font-semibold">
                                      {diff === null ? (
                                        <span className="text-[#8e8e93]">-</span>
                                      ) : diff > 0 ? (
                                        <span className="text-[#2563eb]">▼ {diff}</span>
                                      ) : diff < 0 ? (
                                        <span className="text-[#ef4444]">
                                          ▲ {Math.abs(diff)}
                                        </span>
                                      ) : (
                                        <span className="text-[#8e8e93]">-</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[20px] border border-[#e5e5ea] bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[14px] font-semibold text-[#1d1d1f]">
                      순위 변화 그래프
                    </div>
                    <div className="mt-1 text-[12px] text-[#8e8e93]">
                      숫자가 작을수록 좋은 순위라서 위쪽이 상위 노출입니다.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {place.keywords.map((keyword) => (
                      <button
                        key={keyword.id}
                        onClick={() => setSelectedKeywordId(keyword.id)}
                        className={
                          selectedKeywordId === keyword.id
                            ? "rounded-[999px] bg-[#111827] px-3 py-1.5 text-[12px] font-semibold text-white"
                            : "rounded-[999px] bg-[#f2f2f7] px-3 py-1.5 text-[12px] font-semibold text-[#1d1d1f]"
                        }
                      >
                        {keyword.keyword}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedKeyword && chartData.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-[14px] bg-[#f7f7fa] px-4 py-3">
                        <div className="text-[11px] text-[#8e8e93]">선택 키워드</div>
                        <div className="mt-1 text-[13px] font-semibold text-[#1d1d1f]">
                          {selectedKeyword.keyword}
                        </div>
                      </div>

                      <div className="rounded-[14px] bg-[#f7f7fa] px-4 py-3">
                        <div className="text-[11px] text-[#8e8e93]">현재 순위</div>
                        <div className="mt-1 text-[13px] font-semibold text-[#1d1d1f]">
                          {chartData[chartData.length - 1]?.rank ?? "-"}위
                        </div>
                      </div>

                      <div className="rounded-[14px] bg-[#f7f7fa] px-4 py-3">
                        <div className="text-[11px] text-[#8e8e93]">최고 순위</div>
                        <div className="mt-1 text-[13px] font-semibold text-[#1d1d1f]">
                          {Math.min(...chartData.map((item) => item.rank))}위
                        </div>
                      </div>

                      <div className="rounded-[14px] bg-[#f7f7fa] px-4 py-3">
                        <div className="text-[11px] text-[#8e8e93]">기록 수</div>
                        <div className="mt-1 text-[13px] font-semibold text-[#1d1d1f]">
                          {chartData.length}개
                        </div>
                      </div>
                    </div>

                    <div className="h-[320px] rounded-[16px] border border-[#ececf1] bg-white px-3 py-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="shortLabel"
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            reversed
                            domain={[yMin, yMax]}
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={42}
                            allowDecimals={false}
                          />
                          <Tooltip
                            formatter={(value) => [`${value}위`, "순위"]}
                            labelFormatter={(label, payload) => {
                              const item = payload?.[0]?.payload;
                              return item?.label || label;
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="rank"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[220px] items-center justify-center rounded-[14px] bg-[#fafafa] text-[12px] text-[#8e8e93]">
                    그래프로 표시할 순위 이력이 없습니다.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}