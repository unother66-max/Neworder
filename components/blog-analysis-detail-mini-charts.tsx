"use client";

import type { BlogAnalysisHistoryPoint } from "@/lib/blog-analysis-types";
import type { BlogHistoryTrend } from "@/lib/blog-analysis-history-trend";
import {
  CartesianGrid,
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

export function buildVisitorChartRows(points: BlogAnalysisHistoryPoint[]) {
  return points.map((p) => {
    const d = new Date(p.analyzedAt);
    const label =
      !Number.isNaN(d.getTime())
        ? `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
        : "?";
    return { label, visitor: finiteNum(p.visitorCount) ?? null, analyzedAt: p.analyzedAt };
  });
}

export function buildSingleSeriesRows(
  points: BlogAnalysisHistoryPoint[],
  key: "totalRank" | "topicRank" | "validKeywordCount"
) {
  return points.map((p) => {
    const d = new Date(p.analyzedAt);
    const label =
      !Number.isNaN(d.getTime())
        ? `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
        : "?";
    const raw = p[key];
    const v = finiteNum(raw);
    return { label, value: v ?? null, analyzedAt: p.analyzedAt };
  });
}

export function visitorStatsFromHistory(points: BlogAnalysisHistoryPoint[], dailyVisitor: number | null) {
  const vals = points.map((p) => finiteNum(p.visitorCount)).filter((n): n is number => n !== undefined);
  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const avgDisplay =
    avg != null
      ? `${Math.round(avg).toLocaleString()}명`
      : dailyVisitor != null
        ? `${Math.round(dailyVisitor).toLocaleString()}명`
        : "-";

  const withVis = points.filter((p) => finiteNum(p.visitorCount) !== undefined);
  let dayOverDay: string = "-";
  let dayOverDayPct: number | null = null;
  if (withVis.length >= 2) {
    const a = finiteNum(withVis[withVis.length - 2].visitorCount);
    const b = finiteNum(withVis[withVis.length - 1].visitorCount);
    if (a !== undefined && b !== undefined && a > 0) {
      const pct = ((b - a) / a) * 100;
      dayOverDayPct = pct;
      dayOverDay = `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
    }
  }
  return { avgDisplay, dayOverDay, dayOverDayPct };
}

function lastTwoFiniteForKey(points: BlogAnalysisHistoryPoint[], key: "totalRank" | "topicRank" | "validKeywordCount") {
  const found: number[] = [];
  for (let i = points.length - 1; i >= 0 && found.length < 2; i--) {
    const v = finiteNum(points[i][key]);
    if (v !== undefined) found.push(v);
  }
  if (found.length === 0) return { curr: undefined as number | undefined, prev: undefined as number | undefined };
  const curr = found[0];
  const prev = found.length >= 2 ? found[1] : undefined;
  return { curr, prev };
}

function bestForKey(points: BlogAnalysisHistoryPoint[], key: "totalRank" | "topicRank" | "validKeywordCount") {
  const vals = points.map((p) => finiteNum(p[key])).filter((n): n is number => n !== undefined);
  if (!vals.length) return undefined;
  return key === "validKeywordCount" ? Math.max(...vals) : Math.min(...vals);
}

function formatRankY(v: number) {
  return `${Math.round(v).toLocaleString()}위`;
}

function formatKwY(v: number) {
  return `${Math.round(v).toLocaleString()}개`;
}

function tabDeltaLabel(
  tab: "total" | "topic" | "keywords",
  points: BlogAnalysisHistoryPoint[]
): string {
  const key = tab === "total" ? "totalRank" : tab === "topic" ? "topicRank" : "validKeywordCount";
  const { curr, prev } = lastTwoFiniteForKey(points, key);
  if (curr === undefined || prev === undefined) return "변동 데이터 부족";
  if (key === "validKeywordCount") {
    const d = Math.round(curr) - Math.round(prev);
    if (d === 0) return "키워드 개수 변동 없음";
    const sign = d > 0 ? "+" : "";
    return `키워드 ${sign}${d.toLocaleString()}개`;
  }
  const d = Math.round(prev) - Math.round(curr);
  if (d === 0) return "순위 변동 없음";
  if (d > 0) return `순위 ${d.toLocaleString()}계단 개선`;
  return `순위 ${Math.abs(d).toLocaleString()}계단 밀림`;
}

export function VisitorMetricsChartCard({
  historyPoints,
  dailyVisitor,
  totalVisitor,
}: {
  historyPoints: BlogAnalysisHistoryPoint[];
  dailyVisitor: number | null;
  totalVisitor: number;
}) {
  const rows = buildVisitorChartRows(historyPoints);
  const hasVisitorSeries = rows.some((r) => r.visitor != null && Number.isFinite(r.visitor));
  const { avgDisplay, dayOverDay, dayOverDayPct } = visitorStatsFromHistory(historyPoints, dailyVisitor);
  const pctClass =
    dayOverDay === "-" ? "text-gray-400" : dayOverDayPct != null && dayOverDayPct >= 0 ? "text-emerald-600" : "text-rose-600";

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden flex flex-col min-h-[200px]">
      <div className="bg-slate-600 px-3 py-1.5">
        <span className="text-[10px] font-bold text-white tracking-tight">방문자 수 지표</span>
      </div>
      <div className="p-2 sm:p-3 flex flex-col sm:flex-row gap-2 sm:gap-3 flex-1 min-h-0">
        <div className="flex-1 min-h-[140px] sm:min-h-[160px] min-w-0">
          {hasVisitorSeries ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} />
                <YAxis
                  width={32}
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8e0", fontSize: 11 }}
                  formatter={(val) => {
                    const v = typeof val === "number" ? val : Number(val);
                    return Number.isFinite(v) ? [`${Math.round(v).toLocaleString()}명`, "방문"] : ["-", "방문"];
                  }}
                />
                <Line type="monotone" dataKey="visitor" name="visitor" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px] text-gray-400 h-full flex items-center justify-center px-2 text-center">방문자 추이 데이터가 없습니다.</p>
          )}
        </div>
        <div className="sm:w-[120px] shrink-0 flex sm:flex-col flex-row flex-wrap gap-3 sm:gap-2 justify-between sm:justify-start sm:border-l sm:border-gray-100 sm:pl-3 pt-1 sm:pt-0">
          <div>
            <p className="text-[9px] text-gray-400">전일 대비</p>
            <p className={`text-sm font-black tabular-nums ${pctClass}`}>{dayOverDay}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-400">일일 방문</p>
            <p className="text-sm font-black tabular-nums text-[#111827]">
              {dailyVisitor != null ? `${dailyVisitor.toLocaleString()}명` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-gray-400">평균 방문</p>
            <p className="text-sm font-black tabular-nums text-[#111827]">{avgDisplay}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-400">누적 방문</p>
            <p className="text-xs font-black tabular-nums text-slate-800">{totalVisitor.toLocaleString()}명</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistoryTabChartCard({
  historyPoints,
  rankTab,
  setRankTab,
  liveTotalRank,
  liveTopicRank,
  liveValidKeywordCount,
  historyTrend,
}: {
  historyPoints: BlogAnalysisHistoryPoint[];
  rankTab: "total" | "topic" | "keywords";
  setRankTab: (t: "total" | "topic" | "keywords") => void;
  liveTotalRank: number | null;
  liveTopicRank: number | null;
  liveValidKeywordCount: number | null;
  historyTrend: BlogHistoryTrend;
}) {
  const dataKey = rankTab === "total" ? "totalRank" : rankTab === "topic" ? "topicRank" : "validKeywordCount";
  const rows = buildSingleSeriesRows(
    historyPoints,
    rankTab === "total" ? "totalRank" : rankTab === "topic" ? "topicRank" : "validKeywordCount"
  );
  const hasAny = rows.some((r) => r.value != null && Number.isFinite(r.value));
  const rankReversed = rankTab !== "keywords";
  const best = bestForKey(historyPoints, dataKey);
  const { curr, prev } = lastTwoFiniteForKey(historyPoints, dataKey);
  const historySparse = historyPoints.length < 2;

  const displayCurrent =
    curr != null
      ? rankTab === "keywords"
        ? formatKwY(curr)
        : formatRankY(curr)
      : rankTab === "keywords"
        ? liveValidKeywordCount != null
          ? formatKwY(liveValidKeywordCount)
          : "—"
        : rankTab === "topic"
          ? liveTopicRank != null && liveTopicRank >= 1
            ? formatRankY(liveTopicRank)
            : "—"
          : liveTotalRank != null && liveTotalRank >= 1
            ? formatRankY(liveTotalRank)
            : "—";

  const displayPrev = prev != null ? (rankTab === "keywords" ? formatKwY(prev) : formatRankY(prev)) : "—";

  const displayBest =
    best != null ? (rankTab === "keywords" ? formatKwY(best) : formatRankY(best)) : "—";

  return (
    <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm overflow-hidden flex flex-col min-h-[200px]">
      <div className="flex border-b border-gray-100">
        <button
          type="button"
          onClick={() => setRankTab("total")}
          className={`flex-1 px-1.5 py-1.5 text-[9px] sm:text-[10px] font-bold ${rankTab === "total" ? "bg-slate-600 text-white" : "text-gray-400 bg-slate-50"}`}
        >
          전체 순위
        </button>
        <button
          type="button"
          onClick={() => setRankTab("topic")}
          className={`flex-1 px-1.5 py-1.5 text-[9px] sm:text-[10px] font-bold ${rankTab === "topic" ? "bg-slate-600 text-white" : "text-gray-400 bg-slate-50"}`}
        >
          주제 순위
        </button>
        <button
          type="button"
          onClick={() => setRankTab("keywords")}
          className={`flex-1 px-1.5 py-1.5 text-[9px] sm:text-[10px] font-bold ${rankTab === "keywords" ? "bg-slate-600 text-white" : "text-gray-400 bg-slate-50"}`}
        >
          유효키워드
        </button>
      </div>
      <div className="p-2 sm:p-3 flex flex-col sm:flex-row gap-2 sm:gap-3 flex-1 min-h-0">
        <div className="flex-1 min-h-[140px] sm:min-h-[160px] min-w-0">
          {hasAny ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#64748b" }} tickLine={false} />
                <YAxis
                  reversed={rankReversed}
                  width={36}
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  tickLine={false}
                  allowDecimals={rankTab !== "keywords"}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8e0", fontSize: 11 }}
                  formatter={(val) => {
                    const v = typeof val === "number" ? val : Number(val);
                    if (!Number.isFinite(v)) return ["-", ""];
                    return rankTab === "keywords" ? [formatKwY(v), "유효 키워드"] : [formatRankY(v), "순위"];
                  }}
                />
                <Line type="monotone" dataKey="value" name="value" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[11px] text-gray-400 h-full flex items-center justify-center px-2 text-center">
              표시할 값이 없습니다.
            </p>
          )}
        </div>
        <div className="sm:w-[128px] shrink-0 flex sm:flex-col flex-row flex-wrap gap-2 sm:gap-1.5 justify-between sm:justify-start sm:border-l sm:border-gray-100 sm:pl-3 pt-1 sm:pt-0 text-[9px]">
          <div>
            <p className="text-gray-400">최근 변화</p>
            <p className="font-bold text-[#111827] leading-tight mt-0.5">{historyTrend.compactLabel}</p>
            <p className="text-gray-500 leading-snug mt-0.5 line-clamp-2">{historyTrend.narrative}</p>
          </div>
          <div className="w-full border-t border-gray-50 pt-1.5 sm:pt-1 space-y-1">
            <div className="flex justify-between gap-1">
              <span className="text-gray-400 shrink-0">최고</span>
              <span className="font-bold text-[#111827] tabular-nums truncate text-right">{displayBest}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-gray-400 shrink-0">이번 분석</span>
              <span className="font-black text-[#111827] tabular-nums truncate text-right">{displayCurrent}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-gray-400 shrink-0">지난 분석</span>
              <span className="font-semibold text-slate-700 tabular-nums truncate text-right">{displayPrev}</span>
            </div>
            <p className="text-gray-400 pt-0.5 leading-tight">{tabDeltaLabel(rankTab, historyPoints)}</p>
            {historySparse ? <p className="text-[9px] text-gray-400 pt-0.5">변동 데이터 부족</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
