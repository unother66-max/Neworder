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

type ReviewHistoryRow = {
  id: string;
  totalReviewCount: number;
  totalReviewDiff?: number | null;
  visitorReviewCount: number;
  visitorReviewDiff?: number | null;
  blogReviewCount: number;
  blogReviewDiff?: number | null;
  saveCount: string;
  saveCountDiff?: number | null;
  keywords: string[];
  createdAt: string;
  updatedAt?: string;
};

type PlaceDetail = {
  id: string;
  name: string;
  address: string | null;
  jibunAddress?: string | null;
  imageUrl: string | null;
  placeUrl: string | null;
  reviewAutoTracking?: boolean;
  reviewPinned?: boolean;
  placeMonthlyVolume?: number | null;
  placeMobileVolume?: number | null;
  placePcVolume?: number | null;
  reviewHistory: ReviewHistoryRow[];
};

function formatDateLabel(value: string) {
  const date = new Date(value);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function formatNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === "" || value === "-") return "-";
  const n = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("ko-KR").format(n);
}

function parseSaveCount(value: string) {
  const onlyNumber = String(value || "").replace(/[^\d]/g, "");
  const parsed = Number(onlyNumber);
  return Number.isFinite(parsed) ? parsed : 0;
}

type MetricKey = "total" | "visitor" | "blog" | "save";

export default function PlaceReviewDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<MetricKey>("total");
  const [updating, setUpdating] = useState(false);
  const [trackingUpdating, setTrackingUpdating] = useState(false);

  // --- 디자인 통일용 호버 상태값 ---
  const [trackingHover, setTrackingHover] = useState(false);
  const [trackingMousePos, setTrackingMousePos] = useState({ x: 0, y: 0 });
  const [updateHover, setUpdateHover] = useState(false);
  const [updateMousePos, setUpdateMousePos] = useState({ x: 0, y: 0 });

  const loadDetail = async () => {
    if (!id) return;
    const res = await fetch(
      `/api/place-review-detail?id=${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || "상세 조회 실패");
    }
    setPlace(data.place as PlaceDetail);
  };

  useEffect(() => {
    if (!id) return;
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        await loadDetail();
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "상세 조회 중 오류가 발생했습니다.");
        setPlace(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  const chartData = useMemo(() => {
    if (!place) return [];
    const rows = [...(place.reviewHistory || [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const dailyMap = new Map<
      string,
      { label: string; shortLabel: string; value: number; fullDate: string }
    >();
    for (const r of rows) {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(r.createdAt));
      const value =
        metric === "total"
          ? r.totalReviewCount
          : metric === "visitor"
            ? r.visitorReviewCount
            : metric === "blog"
              ? r.blogReviewCount
              : parseSaveCount(r.saveCount);
      dailyMap.set(key, {
        label: formatDateLabel(r.createdAt),
        shortLabel: formatDateLabel(r.createdAt),
        value,
        fullDate: r.createdAt,
      });
    }
    return Array.from(dailyMap.values()).sort(
      (a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()
    );
  }, [place, metric]);

  const valueLabel =
    metric === "total"
      ? "전체 리뷰수"
      : metric === "visitor"
        ? "방문자 리뷰"
        : metric === "blog"
          ? "블로그 리뷰"
          : "저장수";

  const values = chartData.map((d) => d.value);
  const yMin = values.length ? Math.max(0, Math.min(...values) - 3) : 0;
  const yMax = values.length ? Math.max(...values) + 3 : 10;

  return (
    <>
      <TopNav active="place-review" />

      {/* 🚨 상단 겹침 해결: pt-24 추가 */}
      <main className="min-h-screen bg-[#f8fafc] text-[#111827] pt-24">
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
                    <h1 className="text-[21px] font-black tracking-[-0.03em] text-[#111827]">
                      {place.name}
                    </h1>
                    <p className="mt-1.5 text-[13px] text-[#6b7280]">
                      {place.jibunAddress || place.address || "-"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                        <div className="text-[11px] text-[#9ca3af]">월 검색량</div>
                        <div className="mt-1 text-[15px] font-semibold text-[#111827]">
                          {formatNumber(place.placeMonthlyVolume ?? 0)}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                        <div className="text-[11px] text-[#9ca3af]">모바일</div>
                        <div className="mt-1 text-[14px] font-semibold text-[#111827]">
                          {formatNumber(place.placeMobileVolume ?? 0)}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
                        <div className="text-[11px] text-[#9ca3af]">PC</div>
                        <div className="mt-1 text-[14px] font-semibold text-[#111827]">
                          {formatNumber(place.placePcVolume ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto xl:overflow-visible">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!place) return;
                        try {
                          setTrackingUpdating(true);
                          const res = await fetch(
                            "/api/place-review-toggle-tracking",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                placeId: place.id,
                                enabled: !place.reviewAutoTracking,
                              }),
                            }
                          );
                          const data = await res.json();
                          if (!res.ok) {
                            throw new Error(
                              data?.message || data?.error || "자동추적 변경 실패"
                            );
                          }
                          await loadDetail();
                        } catch (e) {
                          console.error(e);
                          alert(
                            e instanceof Error
                              ? e.message
                              : "자동추적 변경 중 오류가 발생했습니다."
                          );
                        } finally {
                          setTrackingUpdating(false);
                        }
                      }}
                      disabled={trackingUpdating}
                      onMouseEnter={() => setTrackingHover(true)}
                      onMouseLeave={() => setTrackingHover(false)}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTrackingMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      className={`relative inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] px-4 text-[14px] font-bold transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-60 ${
                        place.reviewAutoTracking
                          ? "bg-[#2563EB] text-white"
                          : trackingHover
                            ? "bg-transparent border border-[#2563EB] text-white"
                            : "bg-transparent border border-[#d1d5db] text-[#111827]"
                      }`}
                    >
                      <span className="relative z-30 pointer-events-none">
                        {trackingUpdating ? "변경 중..." : `자동추적 ${place.reviewAutoTracking ? "ON" : "OFF"}`}
                      </span>
                      <div
                        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                        style={{
                          transformOrigin: "left",
                          transform: trackingHover ? "scaleX(1)" : "scaleX(0)",
                          transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                          backgroundColor: "#2563EB",
                        }}
                      />
                      <div
                        className={`
                          absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl
                          transition-opacity duration-200 ease-out
                          ${trackingHover ? "opacity-100" : "opacity-0"}
                        `}
                        style={{
                          left: `${trackingMousePos.x}px`,
                          top: `${trackingMousePos.y}px`,
                          pointerEvents: "none",
                          zIndex: 25,
                          backgroundImage:
                            "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                          mixBlendMode: "soft-light",
                          filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                        }}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!place) return;
                        try {
                          setUpdating(true);
                          const res = await fetch("/api/place-review-track", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ placeId: place.id }),
                          });
                          const data = await res.json();
                          if (!res.ok || !data?.ok) {
                            throw new Error(
                              data?.message ||
                                data?.error ||
                                "리뷰 데이터 업데이트 실패"
                            );
                          }
                          await loadDetail();
                        } catch (e) {
                          console.error(e);
                          alert(
                            e instanceof Error
                              ? e.message
                              : "업데이트 중 오류가 발생했습니다."
                          );
                        } finally {
                          setUpdating(false);
                        }
                      }}
                      disabled={updating}
                      onMouseEnter={() => setUpdateHover(true)}
                      onMouseLeave={() => setUpdateHover(false)}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setUpdateMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                      }}
                      className="relative inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="relative z-30 pointer-events-none">
                        {updating ? "업데이트 중..." : "업데이트"}
                      </span>
                      <div
                        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                        style={{
                          transformOrigin: "left",
                          transform: updateHover ? "scaleX(1)" : "scaleX(0)",
                          transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                          backgroundColor: "#2563EB",
                        }}
                      />
                      <div
                        className={`
                          absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl
                          transition-opacity duration-200 ease-out
                          ${updateHover ? "opacity-100" : "opacity-0"}
                        `}
                        style={{
                          left: `${updateMousePos.x}px`,
                          top: `${updateMousePos.y}px`,
                          pointerEvents: "none",
                          zIndex: 25,
                          backgroundImage:
                            "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                          mixBlendMode: "soft-light",
                          filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#e5e7eb] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:p-6">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                      리뷰 변화 그래프
                    </div>
                    <div className="mt-1 text-[12px] text-[#9ca3af]">
                      날짜별 {valueLabel} 추이를 표시합니다.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: "total", label: "전체" },
                        { key: "visitor", label: "방문자" },
                        { key: "blog", label: "블로그" },
                        { key: "save", label: "저장" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setMetric(m.key)}
                        className={
                          metric === m.key
                            ? "rounded-full bg-[#111827] px-3 py-1.5 text-[12px] font-bold text-white"
                            : "rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111827] hover:bg-[#f9fafb]"
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {chartData.length > 0 ? (
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
                          domain={[yMin, yMax]}
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={42}
                          allowDecimals={false}
                        />
                        <Tooltip
                          formatter={(value) => [formatNumber(value as any), valueLabel]}
                          labelFormatter={(label, payload) => {
                            const item = payload?.[0]?.payload;
                            return item?.label || label;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[220px] items-center justify-center rounded-[16px] border border-dashed border-[#d1d5db] bg-[#fafafa] text-[13px] text-[#9ca3af]">
                    아직 저장된 리뷰 이력이 없습니다.
                  </div>
                )}
              </div>

              <div className="rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="border-b border-[#f3f4f6] px-5 py-4 md:px-6">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    리뷰 히스토리
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#f9fafb]">
                      <tr>
                        {["날짜", "전체", "방문자", "블로그", "저장"].map((h) => (
                          <th
                            key={h}
                            className="px-5 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(place.reviewHistory || []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-14 text-center text-[13px] text-[#9ca3af]"
                          >
                            아직 저장된 리뷰 이력이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        place.reviewHistory.map((row) => (
                          <tr
                            key={row.id}
                            className="border-t border-[#f3f4f6] bg-white"
                          >
                            <td className="whitespace-nowrap px-5 py-4 text-[12px] font-semibold text-[#6b7280]">
                              {formatDateLabel(row.updatedAt || row.createdAt)}
                              <div className="mt-1 text-[10px] font-semibold text-[#9ca3af]">
                                업데이트
                              </div>
                            </td>
                            <td className="px-5 py-4 text-[14px] font-semibold text-[#111827]">
                              {formatNumber(row.totalReviewCount)}
                            </td>
                            <td className="px-5 py-4 text-[14px] font-semibold text-[#111827]">
                              {formatNumber(row.visitorReviewCount)}
                            </td>
                            <td className="px-5 py-4 text-[14px] font-semibold text-[#111827]">
                              {formatNumber(row.blogReviewCount)}
                            </td>
                            <td className="px-5 py-4 text-[14px] font-semibold text-[#111827]">
                              {row.saveCount || "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}