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
  currentRank?: string;
};

type PlaceDetail = {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  placeUrl: string | null;
  imageUrl: string | null;
  x?: string | null;
  y?: string | null;
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
  jibunAddress?: string | null;
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

  const PAGE_SIZE = 70;
  const page = Math.ceil(rank / PAGE_SIZE);
  const pagePosition = ((rank - 1) % PAGE_SIZE) + 1;

  return {
    main: `${rank}위`,
    sub: `${page}p ${pagePosition}위`,
  };
}

function getDateKey(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseRankStringToNumber(rank?: string) {
  if (!rank || rank === "-" || rank === "오류") return null;
  const matched = String(rank).match(/\d+/);
  if (!matched) return null;
  const num = Number(matched[0]);
  return Number.isFinite(num) ? num : null;
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
  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

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

  const loadPlaceDetail = async () => {
    if (!id) return;

    try {
      const res = await fetch(`/api/place-detail?id=${id}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        console.error(data.error || "상세 다시 불러오기 실패");
        return;
      }

      setPlace(data.place || null);
    } catch (e) {
      console.error("상세 다시 불러오기 오류:", e);
    }
  };

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

      const keywordResults: any[] = [];

      console.log("전송 좌표 확인", {
        placeName: place.name,
        x: place.x,
        y: place.y,
      });

      for (const keyword of place.keywords) {
        const response = await fetch("/api/check-place-rank", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            keyword: keyword.keyword,
            targetName: place.name,
            x: place.x,
            y: place.y,
            placeKeywordId: keyword.id,
          }),
        });

        let data = null;

        try {
          data = await response.json();
        } catch (e) {
          console.error("JSON 파싱 실패:", e);
          keywordResults.push({
            keywordId: keyword.id,
            monthly: keyword.totalVolume,
            mobile: keyword.mobileVolume,
            pc: keyword.pcVolume,
            currentRank: "오류",
          });
          continue;
        }

        if (!response.ok) {
          keywordResults.push({
            keywordId: keyword.id,
            monthly: keyword.totalVolume,
            mobile: keyword.mobileVolume,
            pc: keyword.pcVolume,
            currentRank: "오류",
          });
          continue;
        }

        if (keyword.id && data?.rank && data.rank !== "-") {
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

        keywordResults.push({
          keywordId: keyword.id,
          monthly:
            data?.monthly === undefined ||
            data?.monthly === null ||
            data?.monthly === "-"
              ? keyword.totalVolume
              : Number(String(data.monthly).replace(/,/g, "")),
          mobile:
            data?.mobile === undefined ||
            data?.mobile === null ||
            data?.mobile === "-"
              ? keyword.mobileVolume
              : Number(String(data.mobile).replace(/,/g, "")),
          pc:
            data?.pc === undefined || data?.pc === null || data?.pc === "-"
              ? keyword.pcVolume
              : Number(String(data.pc).replace(/,/g, "")),
          currentRank: data?.rank ?? "-",
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setPlace((prev) => {
        if (!prev) return prev;

        const now = new Date().toISOString();

        return {
          ...prev,
          keywords: prev.keywords.map((keyword) => {
            const found = keywordResults.find(
              (item) => item.keywordId === keyword.id
            );
            if (!found) return keyword;

            const nextRankNumber =
              found.currentRank &&
              found.currentRank !== "-" &&
              found.currentRank !== "오류"
                ? Number(String(found.currentRank).match(/\d+/)?.[0] ?? 0)
                : null;

            const nextHistories =
              nextRankNumber === null
                ? keyword.histories
                : [
                    {
                      id: `temp-${keyword.id}-${Date.now()}`,
                      rank: nextRankNumber,
                      createdAt: now,
                    },
                    ...(keyword.histories || []),
                  ];

            return {
              ...keyword,
              totalVolume:
                found.monthly === null || found.monthly === undefined
                  ? keyword.totalVolume
                  : found.monthly,
              mobileVolume:
                found.mobile === null || found.mobile === undefined
                  ? keyword.mobileVolume
                  : found.mobile,
              pcVolume:
                found.pc === null || found.pc === undefined
                  ? keyword.pcVolume
                  : found.pc,
              currentRank: found.currentRank,
              histories: nextHistories,
            };
          }),

          rankHistory: [
            ...(prev.rankHistory || []),
            ...keywordResults
              .filter(
                (item) =>
                  item.currentRank &&
                  item.currentRank !== "-" &&
                  item.currentRank !== "오류"
              )
              .map((item) => {
                const targetKeyword = prev.keywords.find(
                  (k) => k.id === item.keywordId
                );

                return {
                  id: `temp-rank-${item.keywordId}-${Date.now()}`,
                  placeId: prev.id,
                  keyword: targetKeyword?.keyword ?? "",
                  rank: Number(
                    String(item.currentRank).match(/\d+/)?.[0] ?? 0
                  ),
                  createdAt: now,
                };
              }),
          ],
        };
      });

      await loadPlaceDetail();
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
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [place]);

  const selectedKeyword = useMemo(() => {
    if (!place) return null;
    return (
      place.keywords.find((keyword) => keyword.id === selectedKeywordId) ?? null
    );
  }, [place, selectedKeywordId]);

  const selectedKeywordCurrentRank = useMemo(() => {
    if (!selectedKeyword) return null;
    return parseRankStringToNumber(selectedKeyword.currentRank);
  }, [selectedKeyword]);

  const chartData = useMemo(() => {
    if (!selectedKeyword || !place) return [];

    const filtered = (place.rankHistory || [])
      .filter(
        (item) =>
          item.keyword === selectedKeyword.keyword &&
          item.rank !== null &&
          item.rank !== undefined
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

    const dailyMap = new Map<
      string,
      {
        label: string;
        shortLabel: string;
        rank: number;
        fullDate: string;
      }
    >();

    filtered.forEach((item) => {
      const dateKey = getDateKey(item.createdAt);

      dailyMap.set(dateKey, {
        label: formatDateLabel(item.createdAt),
        shortLabel: formatDateLabel(item.createdAt).slice(0, 5),
        rank: item.rank as number,
        fullDate: item.createdAt,
      });
    });

    return Array.from(dailyMap.values()).sort(
      (a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()
    );
  }, [selectedKeyword, place]);

  const rankValues = chartData.map((item) => item.rank);
  const yMin = rankValues.length ? Math.max(1, Math.min(...rankValues) - 2) : 1;
  const yMax = rankValues.length ? Math.max(...rankValues) + 2 : 50;

  const openKeywordModal = () => {
    if (!place) return;
    setIsKeywordModalOpen(true);
  };

  if (!mounted) return null;

  return (
    <>
      <TopNav active="place" />

      <main className="min-h-screen bg-[#f8fafc] text-[#111827]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          {loading ? (
            <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-6 py-8 text-[14px] text-[#6b7280] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              불러오는 중...
            </div>
          ) : error ? (
            <div className="rounded-[22px] border border-[#fecaca] bg-white px-6 py-8 text-[14px] text-[#dc2626] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              {error}
            </div>
          ) : !place ? (
            <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-6 py-8 text-[14px] text-[#6b7280] shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              매장 정보가 없습니다.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 gap-4">
                    {place.imageUrl ? (
                      <img
                        src={place.imageUrl}
                        alt={place.name}
                        className="h-[74px] w-[74px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">
                        이미지
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-[21px] font-black tracking-[-0.03em] text-[#111827]">
                          {place.name}
                        </h1>

                        {place.category ? (
                          <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                            {place.category}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1.5 text-[13px] text-[#6b7280]">
                        {place.address || "-"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                          <div className="text-[11px] text-[#9ca3af]">월 검색량</div>
                          <div className="mt-1 text-[15px] font-semibold text-[#111827]">
                            {formatCount(place.placeMonthlyVolume)}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                          <div className="text-[11px] text-[#9ca3af]">모바일</div>
                          <div className="mt-1 text-[14px] font-semibold text-[#111827]">
                            {formatCount(place.placeMobileVolume)}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                          <div className="text-[11px] text-[#9ca3af]">PC</div>
                          <div className="mt-1 text-[14px] font-semibold text-[#111827]">
                            {formatCount(place.placePcVolume)}
                          </div>
                        </div>

                        <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                          <div className="text-[11px] text-[#9ca3af]">자동 추적</div>
                          <div
                            className={`mt-1 text-[14px] font-semibold ${
                              isAllTrackingOn ? "text-[#b91c1c]" : "text-[#6b7280]"
                            }`}
                          >
                            {trackingUpdating
                              ? "변경중..."
                              : isAllTrackingOn
                                ? "ON"
                                : "OFF"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="font-semibold text-[#6b7280]">
                          바로가기
                        </span>

                        <a
                          href={placeLinks.mobilePlaceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                        >
                          모바일
                        </a>

                        <a
                          href={placeLinks.pcPlaceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                        >
                          PC
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto xl:overflow-visible">
                    <button
                      onClick={handleToggleTracking}
                      disabled={trackingUpdating || !place?.keywords?.length}
                      className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] px-4 text-[14px] font-bold transition ${
                        isAllTrackingOn
                          ? "bg-[#b91c1c] text-white shadow-[0_10px_22px_rgba(185,28,28,0.16)] hover:bg-[#991b1b]"
                          : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {trackingUpdating
                        ? "처리 중..."
                        : `자동추적 ${isAllTrackingOn ? "ON" : "OFF"}`}
                    </button>

                    <button
                      onClick={openKeywordModal}
                      className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                    >
                      키워드관리
                    </button>

                    <button
                      onClick={handleUpdateRanks}
                      disabled={updating}
                      className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] bg-[#111827] px-4 text-[14px] font-bold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updating ? "업데이트 중..." : "업데이트"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="border-b border-[#f3f4f6] px-5 py-4 md:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                      추적 키워드
                    </h2>
                    <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                      {place.keywords.length}개
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#f9fafb]">
                      <tr>
                        <th className="px-5 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                          날짜
                        </th>
                        {place.keywords.map((keyword) => (
                          <th
                            key={keyword.id}
                            className="min-w-[180px] border-l border-[#e5e7eb] px-4 py-3.5 text-left"
                          >
                            <div className="text-[13px] font-bold text-[#111827]">
                              {keyword.keyword}
                            </div>
                            <div className="mt-2 space-y-1 text-[11px] text-[#6b7280]">
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
        className="px-6 py-14 text-center text-[13px] text-[#9ca3af]"
      >
        아직 저장된 순위 이력이 없습니다.
      </td>
    </tr>
  ) : (
    allHistoryRows.map((row, rowIndex) => (
      <tr
        key={row.createdAt}
        className="border-t border-[#f3f4f6] bg-white"
      >
        <td className="whitespace-nowrap px-5 py-4 align-top text-[12px] font-semibold text-[#6b7280]">
          {formatDateLabel(row.createdAt)}
        </td>

        {place.keywords.map((keyword) => {
          const current = row.values[keyword.id];
          const currentRank = current?.rank ?? null;
          const rankMeta = getRankMeta(currentRank);

          const previousRow = allHistoryRows[rowIndex + 1];
          const previousRank = previousRow?.values?.[keyword.id]?.rank ?? null;

          let diff: number | null = null;

          if (
            currentRank !== null &&
            currentRank !== undefined &&
            previousRank !== null &&
            previousRank !== undefined
          ) {
            diff = previousRank - currentRank;
          }

          return (
            <td
              key={`${row.createdAt}-${keyword.id}`}
              className="border-l border-[#f3f4f6] px-4 py-4 align-top"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-black text-[#111827]">
                    {rankMeta.main}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#9ca3af]">
                    {rankMeta.sub}
                  </div>
                </div>

                <div className="pt-[2px] text-[11px] font-bold">
                  {diff === null ? (
                    <span className="text-[#9ca3af]">-</span>
                  ) : diff > 0 ? (
                    <span className="text-[#ef4444]">▲ {diff}</span>
                  ) : diff < 0 ? (
                    <span className="text-[#2563eb]">
                      ▼ {Math.abs(diff)}
                    </span>
                  ) : (
                    <span className="text-[#9ca3af]">-</span>
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

              <div className="rounded-[22px] border border-[#e5e7eb] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:p-6">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                      순위 변화 그래프
                    </div>
                    <div className="mt-1 text-[12px] text-[#9ca3af]">
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
                            ? "rounded-full bg-[#111827] px-3 py-1.5 text-[12px] font-bold text-white"
                            : "rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111827] hover:bg-[#f9fafb]"
                        }
                      >
                        {keyword.keyword}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedKeyword &&
                selectedKeyword.currentRank !== "-" &&
                chartData.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                        <div className="text-[11px] text-[#9ca3af]">선택 키워드</div>
                        <div className="mt-1 text-[13px] font-bold text-[#111827]">
                          {selectedKeyword.keyword}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                        <div className="text-[11px] text-[#9ca3af]">현재 순위</div>
                        <div className="mt-1 text-[13px] font-bold text-[#111827]">
                          {selectedKeyword.currentRank ??
                            (chartData[chartData.length - 1]?.rank ?? "-")}
                          {selectedKeyword.currentRank ? "" : "위"}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                        <div className="text-[11px] text-[#9ca3af]">최고 순위</div>
                        <div className="mt-1 text-[13px] font-bold text-[#111827]">
                          {selectedKeywordCurrentRank !== null
                            ? `${selectedKeywordCurrentRank}위`
                            : chartData.length
                              ? `${Math.min(...chartData.map((item) => item.rank))}위`
                              : "-"}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                        <div className="text-[11px] text-[#9ca3af]">기록 수</div>
                        <div className="mt-1 text-[13px] font-bold text-[#111827]">
                          {chartData.length}개
                        </div>
                      </div>
                    </div>

                    <div className="h-[320px] rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-4">
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
                  <div className="flex h-[220px] items-center justify-center rounded-[16px] border border-dashed border-[#d1d5db] bg-[#fafafa] text-[13px] text-[#9ca3af]">
                    현재 조회 결과로는 노출 순위를 찾지 못했어요.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {isKeywordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[720px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="border-b border-[#f3f4f6] bg-white px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
                      KEYWORD MANAGER
                    </p>
                    <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                      키워드 관리
                    </h2>
                    <p className="mt-2 text-[14px] text-[#6b7280]">
                      키워드를 추가하거나 삭제할 수 있습니다.
                    </p>
                  </div>

                  <button
                    onClick={() => setIsKeywordModalOpen(false)}
                    className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="max-h-[78vh] overflow-y-auto px-6 py-6">
                <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-[13px] font-bold text-[#4b5563]">
                    직접 키워드 추가
                  </p>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="키워드 입력 (쉼표로 여러개)"
                      className="h-[48px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[14px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
                    />
                    <button
                      onClick={async () => {
                        if (!place) return;

                        const keywords = keywordInput
                          .split(",")
                          .map((k) => k.trim())
                          .filter(Boolean);

                        for (const keyword of keywords) {
                          await fetch("/api/place-keyword-save", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              placeId: place.id,
                              keyword,
                            }),
                          });
                        }

                        setKeywordInput("");
                        await loadPlaceDetail();
                      }}
                      className="h-[48px] rounded-[16px] bg-[#111827] px-5 text-[14px] font-bold text-white transition hover:bg-[#1f2937]"
                    >
                      추가
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-bold text-[#4b5563]">
                      등록된 키워드
                    </p>
                    <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">
                      {place?.keywords.length ?? 0}개
                    </span>
                  </div>

                  <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto">
                    {place?.keywords.length ? (
                      place.keywords.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-3 text-[13px]"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-[#111827]">
                              {item.keyword}
                            </div>
                            <div className="mt-1 text-[11px] text-[#9ca3af]">
                              월 {formatCount(item.totalVolume)} / 모바일{" "}
                              {formatCount(item.mobileVolume)} / PC{" "}
                              {formatCount(item.pcVolume)}
                            </div>
                          </div>

                          <button
                            onClick={async () => {
                              await fetch("/api/place-keyword-delete", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  placeKeywordId: item.id,
                                }),
                              });

                              await loadPlaceDetail();
                            }}
                            className="shrink-0 rounded-[12px] border border-[#fecaca] bg-white px-3 py-2 text-[12px] font-bold text-[#dc2626] transition hover:bg-[#fafafa]"
                          >
                            삭제
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-8 text-center text-[14px] text-[#9ca3af]">
                        등록된 키워드가 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}