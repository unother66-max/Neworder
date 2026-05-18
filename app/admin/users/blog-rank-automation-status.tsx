"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  ListChecks,
  RefreshCw,
  Trophy,
} from "lucide-react";

type BlogRankStatusResponse = {
  ok: boolean;
  generatedAt?: string;
  queue?: {
    total: number;
    pending: number;
    analyzed: number;
    failed: number;
    latestDiscoveredAt: string | null;
    latestAnalyzedAt: string | null;
    latestFailedAt: string | null;
    recentFailedItems: Array<{
      blogId: string;
      seedKeyword: string | null;
      errorMessage: string | null;
      lastTriedAt: string | null;
    }>;
  };
  profiles?: {
    total: number;
    createdToday: number;
    analyzedToday: number;
    latestCreatedAt: string | null;
    latestAnalyzedAt: string | null;
  };
  metrics?: {
    total: number;
    createdToday: number;
    latestAnalyzedAt: string | null;
  };
  ranks?: {
    total: number;
    latestCalculatedAt: string | null;
    latestTotalBlogsCount: number | null;
    latestRankSource: string | null;
    latestTopOverall: Array<{
      blogId: string;
      overallRank: number | null;
      topicRank: number | null;
      officialBlogTopic: string | null;
      totalScore?: number;
    }>;
  };
  health?: {
    discoveryOk: boolean;
    analyzeOk: boolean;
    rankOk: boolean;
    failedCountToday: number;
    warnings: string[];
  };
};

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("ko-KR").format(Number(value));
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        ok
          ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20"
          : "bg-amber-100 text-amber-900 ring-1 ring-amber-600/25"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}
      {ok ? "정상" : "주의"}
    </span>
  );
}

function StatBox({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "emerald" | "blue" | "amber" | "rose";
}) {
  const toneClass = {
    slate: "bg-slate-50 text-slate-900 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-950 border-emerald-200",
    blue: "bg-blue-50 text-blue-950 border-blue-200",
    amber: "bg-amber-50 text-amber-950 border-amber-200",
    rose: "bg-rose-50 text-rose-950 border-rose-200",
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
    </div>
  );
}

export function BlogRankAutomationStatus() {
  const [data, setData] = useState<BlogRankStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/admin/blog-rank-status", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as BlogRankStatusResponse;
        if (!json.ok) throw new Error("상태 응답이 올바르지 않습니다.");
        if (alive) setData(json);
      } catch {
        if (alive) setError("상태 정보를 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const warnings = data?.health?.warnings ?? [];
  const healthItems = useMemo(
    () => [
      { label: "후보 수집", ok: data?.health?.discoveryOk ?? false },
      { label: "후보 분석", ok: data?.health?.analyzeOk ?? false },
      { label: "랭킹 계산", ok: data?.health?.rankOk ?? false },
    ],
    [data]
  );

  return (
    <section id="blog-rank-status" className="mb-8 rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-600" aria-hidden />
            <h2 className="text-sm font-bold text-slate-900">블로그 랭킹 자동화 상태</h2>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            PostLabs 자체 블로그 랭킹 DB 수집/분석/순위 계산 상태입니다.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
          <Clock className="h-3 w-3" aria-hidden />
          {loading ? "불러오는 중..." : `갱신 ${formatDateTime(data?.generatedAt)}`}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
          {error}
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-slate-600" aria-hidden />
                <h3 className="text-xs font-bold text-slate-900">자동화 건강 상태</h3>
              </div>
              <div className="space-y-2">
                {healthItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-600">{item.label}</span>
                    <StatusBadge ok={item.ok} />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-slate-600">오늘 실패 수</span>
                  <span className="font-black tabular-nums text-slate-900">
                    {formatNumber(data.health?.failedCountToday)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-blue-600" aria-hidden />
                <h3 className="text-xs font-bold text-slate-900">후보 큐</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="전체" value={formatNumber(data.queue?.total)} tone="blue" />
                <StatBox label="대기" value={formatNumber(data.queue?.pending)} />
                <StatBox label="완료" value={formatNumber(data.queue?.analyzed)} tone="emerald" />
                <StatBox label="실패" value={formatNumber(data.queue?.failed)} tone={data.queue?.failed ? "rose" : "slate"} />
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                최근 수집 {formatDateTime(data.queue?.latestDiscoveredAt)} · 최근 분석{" "}
                {formatDateTime(data.queue?.latestAnalyzedAt)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-violet-600" aria-hidden />
                <h3 className="text-xs font-bold text-slate-900">분석 데이터</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="Profile" value={formatNumber(data.profiles?.total)} tone="blue" />
                <StatBox label="오늘 생성" value={formatNumber(data.profiles?.createdToday)} />
                <StatBox label="오늘 분석" value={formatNumber(data.profiles?.analyzedToday)} tone="emerald" />
                <StatBox label="Metric" value={formatNumber(data.metrics?.total)} tone="slate" />
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                Metric 오늘 생성 {formatNumber(data.metrics?.createdToday)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-600" aria-hidden />
                <h3 className="text-xs font-bold text-slate-900">랭킹 스냅샷</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="Snapshot" value={formatNumber(data.ranks?.total)} tone="amber" />
                <StatBox label="대상 블로그" value={formatNumber(data.ranks?.latestTotalBlogsCount)} />
              </div>
              <dl className="mt-3 space-y-1 text-[10px] text-slate-500">
                <div className="flex justify-between gap-2">
                  <dt>최근 계산</dt>
                  <dd className="font-semibold tabular-nums text-slate-700">
                    {formatDateTime(data.ranks?.latestCalculatedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>rankSource</dt>
                  <dd className="font-bold text-slate-700">{data.ranks?.latestRankSource ?? "-"}</dd>
                </div>
              </dl>
            </div>
          </div>

          {warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-900">
              <p className="mb-1 font-bold">확인 필요</p>
              <ul className="list-inside list-disc space-y-0.5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-600" aria-hidden />
                <h3 className="text-xs font-bold text-slate-900">TOP 10</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[520px] w-full text-left text-[11px]">
                  <thead className="border-b border-slate-100 text-slate-500">
                    <tr>
                      <th className="py-2 pr-3 font-bold">순위</th>
                      <th className="py-2 pr-3 font-bold">blogId</th>
                      <th className="py-2 pr-3 font-bold">주제</th>
                      <th className="py-2 pr-3 text-right font-bold">주제 순위</th>
                      <th className="py-2 text-right font-bold">점수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.ranks?.latestTopOverall ?? []).map((row) => (
                      <tr key={`${row.overallRank}-${row.blogId}`}>
                        <td className="py-2 pr-3 font-black tabular-nums text-slate-900">
                          {formatNumber(row.overallRank)}
                        </td>
                        <td className="py-2 pr-3 font-mono font-semibold text-slate-700">{row.blogId}</td>
                        <td className="py-2 pr-3 text-slate-600">{row.officialBlogTopic ?? "-"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                          {formatNumber(row.topicRank)}
                        </td>
                        <td className="py-2 text-right font-bold tabular-nums text-slate-900">
                          {formatScore(row.totalScore)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(data.ranks?.latestTopOverall ?? []).length === 0 ? (
                  <p className="py-6 text-center text-[11px] text-slate-500">랭킹 데이터가 없습니다.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                <h3 className="text-xs font-bold text-slate-900">최근 실패 후보</h3>
              </div>
              {(data.queue?.recentFailedItems ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {data.queue?.recentFailedItems.map((item) => (
                    <li key={`${item.blogId}-${item.lastTriedAt}`} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold text-slate-900">{item.blogId}</span>
                        <span className="tabular-nums text-slate-500">{formatDateTime(item.lastTriedAt)}</span>
                      </div>
                      <p className="mt-1 text-slate-600">키워드 {item.seedKeyword ?? "-"}</p>
                      <p className="mt-1 break-words text-rose-700">{item.errorMessage ?? "-"}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg bg-emerald-50 px-3 py-6 text-center text-[11px] font-semibold text-emerald-800">
                  최근 실패 없음
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
