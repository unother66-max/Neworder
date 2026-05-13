"use client";

import type { BlogAnalysisHistoryPoint } from "@/lib/blog-analysis-types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function finiteNum(v: number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function chartRows(points: BlogAnalysisHistoryPoint[]) {
  return points.map((p) => {
    const d = new Date(p.analyzedAt);
    const label =
      !Number.isNaN(d.getTime())
        ? `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
        : "?";
    return {
      analyzedAt: p.analyzedAt,
      label,
      totalRank: finiteNum(p.totalRank),
      topicRank: finiteNum(p.topicRank),
      validKeywordCount: finiteNum(p.validKeywordCount),
      totalScore: finiteNum(p.totalScore),
    };
  });
}

/** 순위: 숫자가 낮을수록 상승 → prev - curr */
function formatRankDelta(prev: number | null | undefined, curr: number | null | undefined): string {
  const a = finiteNum(prev);
  const b = finiteNum(curr);
  if (a === undefined || b === undefined) return "-";
  const delta = Math.round(a) - Math.round(b);
  if (delta === 0) return "변동 없음";
  if (delta > 0) return `+${delta.toLocaleString()} 상승`;
  return `${delta.toLocaleString()} 하락`;
}

function formatScoreDelta(prev: number | null | undefined, curr: number | null | undefined): string {
  const a = finiteNum(prev);
  const b = finiteNum(curr);
  if (a === undefined || b === undefined) return "-";
  const delta = Math.round((b - a) * 10) / 10;
  if (delta === 0) return "변동 없음";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}점 ${delta > 0 ? "상승" : "하락"}`;
}

function formatKeywordDelta(prev: number | null | undefined, curr: number | null | undefined): string {
  const a = finiteNum(prev);
  const b = finiteNum(curr);
  if (a === undefined || b === undefined) return "-";
  const delta = Math.round(b) - Math.round(a);
  if (delta === 0) return "변동 없음";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()}개 ${delta > 0 ? "상승" : "하락"}`;
}

export function BlogAnalysisHistoryPanel({
  points,
  trendNarrative,
}: {
  points: BlogAnalysisHistoryPoint[];
  trendNarrative?: string | null;
}) {
  const rows = chartRows(points);
  const hasAnyPoint = rows.length > 0;
  const canDelta = points.length >= 2;
  const prev = canDelta ? points[points.length - 2] : null;
  const curr = canDelta ? points[points.length - 1] : null;

  return (
    <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
      <h4 className="text-[13px] font-bold text-gray-500 mb-1 tracking-tighter">● 순위 변동 히스토리</h4>
      <p className="text-[11px] text-gray-400 mb-2">최근 분석 기록 기준 · 순위 축은 낮을수록 위쪽이 좋음</p>
      {trendNarrative != null && String(trendNarrative).trim() !== "" ? (
        <p className="text-[12px] font-semibold text-slate-800 mb-4 leading-relaxed rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          {trendNarrative}
        </p>
      ) : null}

      {!hasAnyPoint ? (
        <p className="text-sm text-gray-400 py-8 text-center">히스토리가 없습니다.</p>
      ) : (
        <>
          <div className="h-[200px] w-full min-h-[160px] sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} />
                <YAxis
                  yAxisId="rank"
                  reversed
                  width={44}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={36}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => {
                    const v = typeof value === "number" ? value : Number(value);
                    const nm = String(name);
                    const label =
                      nm === "totalRank"
                        ? "전체 순위"
                        : nm === "topicRank"
                          ? "주제 순위"
                          : nm === "totalScore"
                            ? "영향력 점수"
                            : nm === "validKeywordCount"
                              ? "유효 키워드"
                              : nm;
                    if (!Number.isFinite(v)) return ["-", label];
                    if (nm === "totalScore") return [`${v.toFixed(1)}점`, label];
                    if (nm === "validKeywordCount") return [`${Math.round(v).toLocaleString()}개`, label];
                    return [`${Math.round(v).toLocaleString()}위`, label];
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { analyzedAt?: string };
                    if (!row?.analyzedAt) return "";
                    const d = new Date(row.analyzedAt);
                    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR");
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v) =>
                    v === "totalRank"
                      ? "전체 순위"
                      : v === "topicRank"
                        ? "주제 순위"
                        : v === "validKeywordCount"
                          ? "유효 키워드"
                          : v === "totalScore"
                            ? "영향력 점수"
                            : v
                  }
                />
                <Line
                  yAxisId="rank"
                  type="monotone"
                  dataKey="totalRank"
                  name="totalRank"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="rank"
                  type="monotone"
                  dataKey="topicRank"
                  name="topicRank"
                  stroke="#ea580c"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalScore"
                  name="totalScore"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="validKeywordCount"
                  name="validKeywordCount"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-[11px] font-bold text-gray-500 mb-2">직전 분석 대비</p>
            {!canDelta ? (
              <p className="text-[13px] text-gray-400 text-center py-2">변동 데이터 부족</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-[11px]">
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-gray-400 mb-1">전체 순위</p>
                  <p className="font-bold text-[#111827] tabular-nums">{formatRankDelta(prev?.totalRank, curr?.totalRank)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-gray-400 mb-1">주제 순위</p>
                  <p className="font-bold text-[#111827] tabular-nums">{formatRankDelta(prev?.topicRank, curr?.topicRank)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-gray-400 mb-1">유효 키워드</p>
                  <p className="font-bold text-[#111827] tabular-nums">{formatKeywordDelta(prev?.validKeywordCount, curr?.validKeywordCount)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-gray-400 mb-1">영향력 점수</p>
                  <p className="font-bold text-[#111827] tabular-nums">{formatScoreDelta(prev?.totalScore, curr?.totalScore)}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
