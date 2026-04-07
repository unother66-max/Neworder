"use client";

import Link from "next/link";
import TopNav from "@/components/top-nav";
import {
  Search,
  MapPin,
  Smartphone,
  Monitor,
  MoreVertical,
  Pin,
  HelpCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ReviewHistoryRow = {
  id: string;
  dateLabel: string;
  totalReviewCount: number;
  totalReviewDiff?: number | null;
  visitorReviewCount: number;
  visitorReviewDiff?: number | null;
  blogReviewCount: number;
  blogReviewDiff?: number | null;
  saveCount: string;
  keywords: string[];
};

type ApiReviewHistory = {
  id: string;
  totalReviewCount: number;
  visitorReviewCount: number;
  blogReviewCount: number;
  saveCount: string;
  keywords: string[];
  createdAt: string;
};

type ApiPlace = {
  id: string;
  name: string;
  address: string | null;
  jibunAddress?: string | null;
  imageUrl: string | null;
  placeUrl: string | null;
  x?: string | null;
  y?: string | null;
  reviewAutoTracking?: boolean;
  keywords?: {
    id: string;
    mobileVolume: number | null;
    pcVolume: number | null;
    totalVolume: number | null;
  }[];
  reviewHistory: ApiReviewHistory[];
};

type StoreItem = {
  id: string;
  name: string;
  displayName: string;
  address: string;
  imageUrl: string;
  searchVolume: number;
  mobileVolume: number;
  pcVolume: number;
  mobileUrl: string;
  pcUrl: string;
  isAutoTracking: boolean;
  isPinned?: boolean;
  updatedAt: string;
  history: ReviewHistoryRow[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDateLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  const weekNames = ["일", "월", "화", "수", "목", "금", "토"];
  const week = weekNames[date.getDay()];

  return `${month}/${day} (${week})\n${hour}:${minute}`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function mapApiPlaceToStore(place: ApiPlace): StoreItem {
  const sortedHistory = [...(place.reviewHistory || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const history: ReviewHistoryRow[] = sortedHistory.map((row, index) => {
    const prev = sortedHistory[index + 1];

    return {
      id: row.id,
      dateLabel: formatDateLabel(row.createdAt),
      totalReviewCount: row.totalReviewCount,
      totalReviewDiff: prev ? row.totalReviewCount - prev.totalReviewCount : null,
      visitorReviewCount: row.visitorReviewCount,
      visitorReviewDiff: prev ? row.visitorReviewCount - prev.visitorReviewCount : null,
      blogReviewCount: row.blogReviewCount,
      blogReviewDiff: prev ? row.blogReviewCount - prev.blogReviewCount : null,
      saveCount: row.saveCount,
      keywords: row.keywords || [],
    };
  });

  const keywordList = place.keywords || [];
  const mobileVolume = keywordList.reduce(
    (sum, item) => sum + (item.mobileVolume || 0),
    0
  );
  const pcVolume = keywordList.reduce(
    (sum, item) => sum + (item.pcVolume || 0),
    0
  );
  const totalVolume = keywordList.reduce(
    (sum, item) => sum + (item.totalVolume || 0),
    0
  );

  const latestCreatedAt =
    sortedHistory.length > 0
      ? sortedHistory[0].createdAt
      : new Date().toISOString();

  const publicPlaceId = extractPublicPlaceId(place.placeUrl);
  const links = buildPlaceLinks(publicPlaceId, place.name);

  return {
    id: place.id,
    name: place.name,
    displayName: place.name,
    address: place.jibunAddress || place.address || "-",
    imageUrl:
      place.imageUrl ||
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop",
    searchVolume: totalVolume,
    mobileVolume,
    pcVolume,
    mobileUrl: links.mobilePlaceLink,
    pcUrl: links.pcPlaceLink,
    isAutoTracking: !!place.reviewAutoTracking,
    isPinned: false,
    updatedAt: formatUpdatedAt(latestCreatedAt),
    history,
  };
}

function DiffText({ value }: { value?: number | null }) {
  if (value === null || value === undefined || value === 0) {
    return (
      <span className="ml-2 text-[12px] font-semibold text-[#9ca3af]">-</span>
    );
  }

  const isUp = value > 0;

  return (
    <span
      className={`ml-2 inline-flex items-center text-[12px] font-bold ${
        isUp ? "text-[#ef4444]" : "text-[#2563eb]"
      }`}
    >
      {isUp ? "▲" : "▼"} {formatNumber(Math.abs(value))}
    </span>
  );
}

export default function PlaceReviewPage() {
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingStoreId, setUpdatingStoreId] = useState<string | null>(null);
  const [trackingStoreId, setTrackingStoreId] = useState<string | null>(null);

  async function fetchPlaces() {
    try {
      setLoading(true);

      const res = await fetch("/api/place-review-list", {
        cache: "no-store",
      });
      const data = await res.json();

      const places: ApiPlace[] = Array.isArray(data?.places) ? data.places : [];
      setStores(places.map(mapApiPlaceToStore));
    } catch (error) {
      console.error("place-review-list fetch error:", error);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPlaces();
  }, []);

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return stores;

    return stores.filter((store) => {
      return (
        store.name.toLowerCase().includes(keyword) ||
        store.displayName.toLowerCase().includes(keyword) ||
        store.address.toLowerCase().includes(keyword)
      );
    });
  }, [search, stores]);

  async function handleUpdateStore(storeId: string) {
    try {
      setUpdatingStoreId(storeId);

      const res = await fetch("/api/place-review-track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: storeId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data?.message || "리뷰 데이터 업데이트 실패");
        return;
      }

      await fetchPlaces();
    } catch (error) {
      console.error("place-review-track error:", error);
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setUpdatingStoreId(null);
    }
  }

  async function handleToggleAutoTracking(storeId: string, nextValue: boolean) {
    try {
      setTrackingStoreId(storeId);

      const res = await fetch("/api/place-review-toggle-tracking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: storeId,
          enabled: nextValue,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data?.message || "자동추적 상태 변경 실패");
        return;
      }

      setStores((prev) =>
        prev.map((store) =>
          store.id === storeId
            ? { ...store, isAutoTracking: nextValue }
            : store
        )
      );
    } catch (error) {
      console.error("place-review-toggle-tracking error:", error);
      alert("자동추적 변경 중 오류가 발생했습니다.");
    } finally {
      setTrackingStoreId(null);
    }
  }

  const handleTogglePin = (storeId: string) => {
    setStores((prev) =>
      prev.map((store) =>
        store.id === storeId
          ? { ...store, isPinned: !store.isPinned }
          : store
      )
    );
  };

  return (
    <>
      <TopNav active="place" />

      <main className="min-h-screen bg-[#f4f4f5] text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    매장 리뷰 추적
                  </h1>

                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6]"
                    aria-label="도움말"
                  >
                    <HelpCircle className="h-5 w-5" strokeWidth={2.1} />
                  </button>
                </div>

                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  매일 등록된 매장의 리뷰수와 저장수를 한 화면에서 관리합니다.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
                <div className="relative w-full sm:w-[320px]">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="등록된 매장 검색"
                    className="h-[44px] w-full rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
                  />
                  <Search
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]"
                    strokeWidth={2.2}
                  />
                </div>

                <Link
                  href="/place"
                  className="inline-flex h-[44px] min-w-[108px] items-center justify-center rounded-[14px] bg-[#b91c1c] px-4 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b]"
                >
                  매장 등록
                </Link>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    등록된 매장
                  </h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                    {filteredStores.length}개
                  </span>

                  <button
                    type="button"
                    className="ml-1 inline-flex h-[36px] items-center justify-center rounded-[12px] bg-[#f3f4f6] px-4 text-[12px] font-bold text-[#374151] transition hover:bg-[#e5e7eb]"
                  >
                    매장 관리
                  </button>
                </div>

                <p className="mt-2 text-[12px] text-[#6b7280]">
                  {loading
                    ? "📍 리뷰 데이터 불러오는 중..."
                    : "📍 리뷰/저장수 변화 조회중"}
                </p>
              </div>

              <div className="text-[11px] text-[#9ca3af]">
                수집 시점에 따라 리뷰/저장수 차이가 발생할 수 있습니다.
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">
                  불러오는 중...
                </p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  등록된 리뷰 추적 매장을 확인하고 있습니다.
                </p>
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">
                  등록된 리뷰 추적 매장이 없습니다.
                </p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  상단의 매장 등록 버튼으로 첫 매장을 추가해보세요.
                </p>
              </div>
            ) : (
              filteredStores.map((store) => (
                <section
                  key={store.id}
                  className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-5 py-4 md:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <div className="h-[70px] w-[70px] shrink-0 overflow-hidden rounded-[16px] bg-[#f3f4f6] ring-1 ring-[#e5e7eb]">
                          <img
                            src={store.imageUrl}
                            alt={store.name}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[20px] font-black tracking-[-0.03em] text-[#111827]">
                              {store.name}
                            </h3>

                            <span className="text-[13px] font-semibold text-[#6b7280]">
                              {store.displayName}
                            </span>

                            <span className="text-[13px] font-semibold text-[#9ca3af]">
                              |
                            </span>
                          </div>

                          <p className="mt-1.5 text-[13px] text-[#6b7280]">
                            {store.address}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="text-[10px] font-semibold text-[#6b7280]">
                                검색량
                              </div>
                              <div className="mt-1 text-[15px] font-black text-[#111827]">
                                {formatNumber(store.searchVolume)}
                              </div>
                            </div>

                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="flex items-center gap-1 text-[10px] font-semibold text-[#6b7280]">
                                <Smartphone className="h-3.5 w-3.5" />
                                모바일
                              </div>
                              <div className="mt-1 text-[14px] font-extrabold text-[#111827]">
                                {formatNumber(store.mobileVolume)}
                              </div>
                            </div>

                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="flex items-center gap-1 text-[10px] font-semibold text-[#6b7280]">
                                <Monitor className="h-3.5 w-3.5" />
                                PC
                              </div>
                              <div className="mt-1 text-[14px] font-extrabold text-[#111827]">
                                {formatNumber(store.pcVolume)}
                              </div>
                            </div>

                            <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                              <div className="text-[10px] font-semibold text-[#6b7280]">
                                자동 추적
                              </div>
                              <div className="mt-1 text-[14px] font-black text-[#111827]">
                                {store.isAutoTracking ? "ON" : "OFF"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                            <span className="inline-flex items-center gap-1 font-semibold text-[#6b7280]">
                              <MapPin className="h-3.5 w-3.5" />
                              매장 바로가기
                            </span>

                            <a
                              href={store.mobileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                            >
                              모바일
                            </a>

                            <a
                              href={store.pcUrl}
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
                          type="button"
                          onClick={() => handleTogglePin(store.id)}
                          className={`inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border text-[#111827] transition ${
                            store.isPinned
                              ? "border-[#d1d5db] bg-[#f8fafc]"
                              : "border-[#d1d5db] bg-white hover:bg-[#f9fafb]"
                          }`}
                          aria-label="핀 고정"
                        >
                          <Pin className="h-4.5 w-4.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStore(store.id)}
                          disabled={updatingStoreId === store.id}
                          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb] disabled:opacity-60"
                        >
                          {updatingStoreId === store.id ? "업데이트 중..." : "업데이트"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleToggleAutoTracking(
                              store.id,
                              !store.isAutoTracking
                            )
                          }
                          disabled={trackingStoreId === store.id}
                          className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] px-4 text-[14px] font-bold transition disabled:opacity-60 ${
                            store.isAutoTracking
                              ? "bg-[#b91c1c] text-white shadow-[0_10px_22px_rgba(185,28,28,0.16)] hover:bg-[#991b1b]"
                              : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                          }`}
                        >
                          {trackingStoreId === store.id
                            ? "변경 중..."
                            : `자동추적 ${store.isAutoTracking ? "ON" : "OFF"}`}
                        </button>

                        <button
                          type="button"
                          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border border-transparent bg-transparent text-[#111827] transition hover:bg-[#f3f4f6]"
                          aria-label="더보기"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-5 md:px-6">
                    <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb]">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead className="bg-[#f9fafb]">
                            <tr>
                              <th className="px-5 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                날짜
                              </th>
                              <th className="px-4 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                전체 리뷰수
                              </th>
                              <th className="px-4 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                방문자 리뷰
                              </th>
                              <th className="px-4 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                블로그 리뷰
                              </th>
                              <th className="px-4 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                저장수
                              </th>
                              <th className="px-5 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                키워드
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {store.history.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="px-5 py-10 text-center text-[14px] text-[#9ca3af]"
                                >
                                  아직 리뷰 추적 데이터가 없습니다.
                                </td>
                              </tr>
                            ) : (
                              store.history.map((row) => (
                                <tr
                                  key={row.id}
                                  className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]"
                                >
                                  <td className="whitespace-pre-line px-5 py-4 text-[14px] font-bold leading-[1.4] text-[#374151]">
                                    {row.dateLabel}
                                  </td>

                                  <td className="px-4 py-4 text-[14px] font-semibold text-[#111827]">
                                    {formatNumber(row.totalReviewCount)}
                                    <DiffText value={row.totalReviewDiff} />
                                  </td>

                                  <td className="px-4 py-4 text-[14px] font-semibold text-[#111827]">
                                    {formatNumber(row.visitorReviewCount)}
                                    <DiffText value={row.visitorReviewDiff} />
                                  </td>

                                  <td className="px-4 py-4 text-[14px] font-semibold text-[#111827]">
                                    {formatNumber(row.blogReviewCount)}
                                    <DiffText value={row.blogReviewDiff} />
                                  </td>

                                  <td className="px-4 py-4 text-[14px] font-semibold text-[#111827]">
                                    {row.saveCount}
                                  </td>

                                  <td className="px-5 py-4 text-[14px] font-semibold leading-[1.5] text-[#374151]">
                                    {row.keywords.join(", ")}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end text-[11px] text-[#9ca3af]">
                      <div>
                        최근 업데이트:{" "}
                        <span className="font-semibold text-[#6b7280]">
                          {store.updatedAt}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}