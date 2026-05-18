"use client";

import type { BlogAnalysisHistoryPoint, BlogVisitorChartPoint } from "@/lib/blog-analysis-types";
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

function kstMonthDayLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "?";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const month = parts.find((part) => part.type === "month")?.value ?? "??";
  const day = parts.find((part) => part.type === "day")?.value ?? "??";
  return `${month}.${day}`;
}

export function buildVisitorChartRows(points: BlogAnalysisHistoryPoint[], visitorChartData?: BlogVisitorChartPoint[]) {
  if (visitorChartData?.length) {
    return visitorChartData.map((p) => ({
      label: p.label || kstMonthDayLabel(`${p.date}T12:00:00+09:00`),
      visitor: finiteNum(p.visitorCount) ?? null,
      analyzedAt: p.date,
      source: p.source ?? "naver",
    }));
  }

  return points.map((p) => {
    return { label: kstMonthDayLabel(p.analyzedAt), visitor: finiteNum(p.visitorCount) ?? null, analyzedAt: p.analyzedAt, source: "history" };
  });
}

export function buildSingleSeriesRows(
  points: BlogAnalysisHistoryPoint[],
  key: "totalRank" | "topicRank" | "validKeywordCount"
) {
  return points.map((p) => {
    const label = kstMonthDayLabel(p.analyzedAt);
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

const CARD_BORDER = "border-slate-200/70";
const CARD_HEADER = "bg-gradient-to-r from-slate-700 to-slate-800 px-3 py-1.5";
const CARD_HEADER_LABEL = "text-[10px] font-semibold text-white/90 tracking-wider uppercase";
const CHART_STROKE = "#6366f1";

export function VisitorMetricsChartCard({
  historyPoints,
  visitorChartData,
  dailyVisitor,
  totalVisitor,
}: {
  historyPoints: BlogAnalysisHistoryPoint[];
  visitorChartData?: BlogVisitorChartPoint[];
  dailyVisitor: number | null;
  totalVisitor: number;
}) {
  const rows = buildVisitorChartRows(historyPoints, visitorChartData);
  const hasVisitorSeries = rows.some((r) => r.visitor != null && Number.isFinite(r.visitor));
  const { avgDisplay, dayOverDay, dayOverDayPct } = visitorStatsFromHistory(historyPoints, dailyVisitor);
  const pctClass =
    dayOverDay === "-" ? "text-slate-400" : dayOverDayPct != null && dayOverDayPct >= 0 ? "text-emerald-600" : "text-rose-500";

  if (process.env.NODE_ENV === "development") {
    console.log("[blog-analysis] visitor card render", {
      dailyVisitCount: dailyVisitor,
      averageVisitCount: avgDisplay,
      totalVisitCount: totalVisitor,
      chartData: rows.map((row) => ({
        date: row.analyzedAt,
        label: row.label,
        value: row.visitor,
        source: row.source,
      })),
    });
  }

  return (
    <div className={`bg-white rounded-2xl border ${CARD_BORDER} shadow-sm overflow-hidden flex flex-col`}>
      <div className={CARD_HEADER}>
        <span className={CARD_HEADER_LABEL}>방문자 수 지표</span>
      </div>
      <div className="p-2 sm:p-2.5 flex flex-col sm:flex-row gap-2 flex-1 min-h-0">
        <div className="flex-1 min-h-[108px] sm:min-h-[120px] min-w-0 w-full overflow-hidden">
          {hasVisitorSeries ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis
                  width={28}
                  tick={{ fontSize: 8, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                  formatter={(val) => {
                    const v = typeof val === "number" ? val : Number(val);
                    return Number.isFinite(v) ? [`${Math.round(v).toLocaleString()}명`, "방문"] : ["-", "방문"];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="visitor"
                  name="visitor"
                  stroke={CHART_STROKE}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: CHART_STROKE, strokeWidth: 0 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full min-h-[96px] flex flex-col items-center justify-center rounded-xl bg-slate-50/80 mx-0.5 px-3 py-4 text-center border border-slate-100/60">
              <p className="text-[10px] font-medium text-slate-500 leading-snug">방문자 추이 데이터가 없습니다</p>
              <p className="text-[9px] text-slate-400 mt-1">히스토리에 방문 수가 쌓이면 그래프가 표시돼요</p>
            </div>
          )}
        </div>
        <div className="sm:w-[104px] shrink-0 flex sm:flex-col flex-row flex-wrap gap-x-3 gap-y-2 justify-between sm:justify-start sm:border-l sm:border-slate-100 sm:pl-2.5 pt-1 sm:pt-0">
          <div>
            <p className="text-[8px] font-medium text-slate-400 uppercase tracking-wider">전일 대비</p>
            <p className={`text-sm font-bold tabular-nums leading-tight tracking-tight mt-0.5 ${pctClass}`}>{dayOverDay}</p>
          </div>
          <div>
            <p className="text-[8px] font-medium text-slate-400">일일 방문</p>
            <p className="text-sm font-bold tabular-nums text-slate-800 leading-tight tracking-tight mt-0.5">
              {dailyVisitor != null ? `${dailyVisitor.toLocaleString()}명` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-medium text-slate-400">평균 방문</p>
            <p className="text-sm font-bold tabular-nums text-slate-800 leading-tight tracking-tight mt-0.5">{avgDisplay}</p>
          </div>
          <div>
            <p className="text-[8px] font-medium text-slate-400">누적 방문</p>
            <p className="text-sm font-bold tabular-nums text-slate-700 leading-tight tracking-tight mt-0.5">{totalVisitor.toLocaleString()}명</p>
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

  const displayBest = best != null ? (rankTab === "keywords" ? formatKwY(best) : formatRankY(best)) : "—";

  const tabBtn = (id: "total" | "topic" | "keywords", label: string) => (
    <button
      type="button"
      onClick={() => setRankTab(id)}
      className={`flex-1 px-1 py-1.5 text-[9px] sm:text-[10px] font-semibold transition-colors duration-150 ${
        rankTab === id
          ? "bg-gradient-to-r from-slate-700 to-slate-800 text-white"
          : "bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`bg-white rounded-2xl border ${CARD_BORDER} shadow-sm overflow-hidden flex flex-col`}>
      <div className="flex border-b border-slate-200/60">
        {tabBtn("total", "전체 랭킹")}
        {tabBtn("topic", "주제 랭킹")}
        {tabBtn("keywords", "유효키워드")}
      </div>
      <div className="p-2 sm:p-2.5 flex flex-col sm:flex-row gap-2 flex-1 min-h-0">
        <div className="flex-1 min-h-[108px] sm:min-h-[120px] min-w-0 w-full overflow-hidden">
          {hasAny ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis
                  reversed={rankReversed}
                  width={30}
                  tick={{ fontSize: 8, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={rankTab !== "keywords"}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                  formatter={(val) => {
                    const v = typeof val === "number" ? val : Number(val);
                    if (!Number.isFinite(v)) return ["-", ""];
                    return rankTab === "keywords" ? [formatKwY(v), "유효 키워드"] : [formatRankY(v), "순위"];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="value"
                  stroke={CHART_STROKE}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: CHART_STROKE, strokeWidth: 0 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full min-h-[96px] flex flex-col items-center justify-center rounded-xl bg-slate-50/80 mx-0.5 px-3 py-4 text-center border border-slate-100/60">
              <p className="text-[10px] font-medium text-slate-500 leading-snug">표시할 값이 없습니다</p>
              <p className="text-[9px] text-slate-400 mt-1">
                {rankTab === "keywords" ? "키워드 기록이 쌓이면 그래프가 나타나요" : "PostLabs 자체 순위 데이터가 쌓이면 그래프가 나타나요"}
              </p>
            </div>
          )}
        </div>
        <div className="sm:w-[108px] shrink-0 flex sm:flex-col flex-row flex-wrap gap-x-3 gap-y-1.5 justify-between sm:justify-start sm:border-l sm:border-slate-100 sm:pl-2.5 pt-1 sm:pt-0 text-[8px]">
          <div className="min-w-0 w-full sm:w-auto">
            <p className="text-slate-400 font-medium uppercase tracking-wider">최근 변화</p>
            <p className="text-[10px] font-bold text-slate-800 leading-tight mt-0.5 tracking-tight">{historyTrend.compactLabel}</p>
            <p className="text-[9px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{historyTrend.narrative}</p>
          </div>
          <div className="w-full border-t border-slate-100 pt-1.5 space-y-1 sm:min-w-0">
            <div className="flex justify-between gap-0.5">
              <span className="text-slate-400 shrink-0">최고</span>
              <span className="font-semibold text-slate-700 tabular-nums truncate text-right text-[9px]">{displayBest}</span>
            </div>
            <div className="flex justify-between gap-0.5">
              <span className="text-slate-400 shrink-0">이번</span>
              <span className="font-bold text-slate-800 tabular-nums truncate text-right text-[10px] tracking-tight">{displayCurrent}</span>
            </div>
            <div className="flex justify-between gap-0.5">
              <span className="text-slate-400 shrink-0">지난</span>
              <span className="font-semibold text-slate-500 tabular-nums truncate text-right text-[9px]">{displayPrev}</span>
            </div>
            <p className="text-slate-400 pt-0.5 leading-tight text-[8px]">{tabDeltaLabel(rankTab, historyPoints)}</p>
            {historySparse ? (
              <p className="text-[8px] text-slate-400 pt-0.5 leading-tight">
                이 블로그는 오늘부터 변화 기록이 쌓입니다. 내일부터 방문자·키워드·순위 변화를 확인할 수 있어요.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
