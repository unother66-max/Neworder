import type { Prisma } from "@prisma/client";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Search,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import {
  cronJobLabel,
  formatCronDateTime,
  formatCronDuration,
  formatCronNumber,
  RUN_STATUS_OPTIONS,
  RunStatusBadge,
} from "./cron-run-ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const PERIOD_OPTIONS = [
  { value: "1", label: "최근 24시간" },
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
] as const;

type SearchParams = Promise<{
  status?: string | string[];
  period?: string | string[];
  page?: string | string[];
}>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function periodStartDate(periodDays: number): Date {
  return new Date(Date.now() - periodDays * 24 * 60 * 60 * 1_000);
}

function listHref(input: { status: string; period: string; page: number }) {
  const params = new URLSearchParams();
  if (input.status !== "ALL") params.set("status", input.status);
  if (input.period !== "7") params.set("period", input.period);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/admin/cron-runs?${query}` : "/admin/cron-runs";
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: "slate" | "emerald" | "rose" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200/90 bg-white text-slate-900",
    emerald: "border-emerald-200/85 bg-emerald-50/50 text-emerald-950",
    rose: "border-rose-200/80 bg-rose-50/40 text-rose-950",
    amber: "border-amber-200/85 bg-amber-50/40 text-amber-950",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
        <Icon className="h-4 w-4 shrink-0 opacity-75" aria-hidden />
        {label}
      </div>
      <p className="text-xl font-bold tabular-nums md:text-2xl">
        {formatCronNumber(value)}
      </p>
    </div>
  );
}

export default async function AdminCronRunsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const allowedStatuses = new Set<string>(
    RUN_STATUS_OPTIONS.map((option) => option.value)
  );
  const requestedStatus = first(query.status).toUpperCase();
  const status = allowedStatuses.has(requestedStatus)
    ? requestedStatus
    : "ALL";
  const requestedPeriod = first(query.period);
  const period = PERIOD_OPTIONS.some((option) => option.value === requestedPeriod)
    ? requestedPeriod
    : "7";
  const periodDays = positiveInteger(period, 7);
  const since = periodStartDate(periodDays);
  const periodWhere: Prisma.CronRunWhereInput = {
    startedAt: { gte: since },
  };
  const where: Prisma.CronRunWhereInput = {
    ...periodWhere,
    ...(status === "ALL" ? {} : { status }),
  };

  const [filteredCount, groupedStatuses] = await Promise.all([
    prisma.cronRun.count({ where }),
    prisma.cronRun.groupBy({
      by: ["status"],
      where: periodWhere,
      _count: { _all: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(
    positiveInteger(first(query.page), 1),
    totalPages
  );
  const runs = await prisma.cronRun.findMany({
    where,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      job: true,
      trigger: true,
      status: true,
      startedAt: true,
      durationMs: true,
      trackedTotal: true,
      eligibleTotal: true,
      total: true,
      success: true,
      outOfRange: true,
      ncaptcha: true,
      http429: true,
      timeout: true,
      cooldownSkip: true,
      error: true,
    },
  });

  const statusCounts = new Map(
    groupedStatuses.map((row) => [row.status, row._count._all])
  );
  const periodTotal = groupedStatuses.reduce(
    (sum, row) => sum + row._count._all,
    0
  );
  const attentionCount =
    (statusCounts.get("FAILED") ?? 0) +
    (statusCounts.get("ABORTED") ?? 0);

  return (
    <>
      <div className="mb-5">
        <Link
          href="/admin/users"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden />
          운영 대시보드
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
              크론 실행 기록
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 md:text-[13px]">
              플레이스 순위 추적 작업의 실행 요약과 키워드별 결과를 확인합니다.
              시간 기준은 Asia/Seoul입니다.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            <Clock3 className="h-3 w-3" aria-hidden />
            최근 기록부터 표시
          </span>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="기간 내 실행"
          value={periodTotal}
          icon={Activity}
          tone="slate"
        />
        <StatCard
          label="완료"
          value={statusCounts.get("COMPLETED") ?? 0}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="실패·중단"
          value={attentionCount}
          icon={AlertTriangle}
          tone={attentionCount > 0 ? "rose" : "slate"}
        />
        <StatCard
          label="실행 중"
          value={statusCounts.get("RUNNING") ?? 0}
          icon={Clock3}
          tone={(statusCounts.get("RUNNING") ?? 0) > 0 ? "amber" : "slate"}
        />
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
        <form
          action="/admin/cron-runs"
          method="get"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end"
        >
          <label className="text-xs font-semibold text-slate-500">
            실행 상태
            <select
              name="status"
              defaultValue={status}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
            >
              {RUN_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            조회 기간
            <select
              name="period"
              defaultValue={period}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">
            <Search className="h-4 w-4" aria-hidden />
            조회
          </button>
          <Link
            href="/admin/cron-runs"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            초기화
          </Link>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-slate-600" aria-hidden />
            <h2 className="text-sm font-bold text-slate-900">실행 목록</h2>
          </div>
          <p className="text-[11px] text-slate-500">
            조건에 맞는 기록 {formatCronNumber(filteredCount)}건
          </p>
        </div>

        {runs.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-slate-500">
            조건에 맞는 실행 기록이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-xs">
              <thead className="bg-slate-50/90 text-[11px] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">시작 시각</th>
                  <th className="px-4 py-3 font-semibold">작업</th>
                  <th className="px-4 py-3 font-semibold">호출</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 text-right font-semibold">저장 성공</th>
                  <th className="px-4 py-3 text-right font-semibold">순위권 밖</th>
                  <th className="px-4 py-3 text-right font-semibold">원인별 오류·차단</th>
                  <th className="px-4 py-3 text-right font-semibold">소요 시간</th>
                  <th className="px-4 py-3 text-right font-semibold">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => {
                  const issueCount =
                    run.ncaptcha +
                    run.http429 +
                    run.timeout +
                    run.cooldownSkip +
                    run.error;
                  return (
                    <tr key={run.id} className="transition hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-slate-800">
                        {formatCronDateTime(run.startedAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {cronJobLabel(run.job)}
                        <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                          추적 {formatCronNumber(run.trackedTotal)} · 후보{" "}
                          {formatCronNumber(run.eligibleTotal)} · 선택{" "}
                          {formatCronNumber(run.total)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                        {run.trigger}
                      </td>
                      <td className="px-4 py-3">
                        <RunStatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-700">
                        {formatCronNumber(run.success)}/{formatCronNumber(run.total)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatCronNumber(run.outOfRange)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold tabular-nums ${
                          issueCount > 0 ? "text-rose-700" : "text-slate-500"
                        }`}
                      >
                        {formatCronNumber(issueCount)}
                        <span className="mt-0.5 block whitespace-nowrap text-[9px] font-medium text-slate-500">
                          캡차 {formatCronNumber(run.ncaptcha)} · 429{" "}
                          {formatCronNumber(run.http429)} · 시간 초과{" "}
                          {formatCronNumber(run.timeout)} · 대기{" "}
                          {formatCronNumber(run.cooldownSkip)} · 기타{" "}
                          {formatCronNumber(run.error)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatCronDuration(run.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/cron-runs/${run.id}`}
                          className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        >
                          열기
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
            <Link
              href={listHref({ status, period, page: Math.max(1, page - 1) })}
              aria-disabled={page <= 1}
              className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold ${
                page <= 1
                  ? "pointer-events-none text-slate-300"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> 이전
            </Link>
            <span className="font-medium tabular-nums text-slate-600">
              {page} / {totalPages}
            </span>
            <Link
              href={listHref({
                status,
                period,
                page: Math.min(totalPages, page + 1),
              })}
              aria-disabled={page >= totalPages}
              className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold ${
                page >= totalPages
                  ? "pointer-events-none text-slate-300"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              다음 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : null}
      </section>
    </>
  );
}
