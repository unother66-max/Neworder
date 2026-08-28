import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hash,
  Search,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import {
  cronJobLabel,
  formatCronDateTime,
  formatCronDuration,
  formatCronNumber,
  OTHER_ERROR_RESULT_STATUSES,
  RESULT_STATUS_OPTIONS,
  ResultStatusBadge,
  RunStatusBadge,
} from "../cron-run-ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Props = {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function detailHref(input: {
  runId: string;
  status: string;
  search: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (input.status !== "ALL") params.set("status", input.status);
  if (input.search) params.set("q", input.search);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  const path = `/admin/cron-runs/${encodeURIComponent(input.runId)}`;
  return query ? `${path}?${query}` : path;
}

function SummaryValue({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number | null;
  tone?: "slate" | "emerald" | "rose" | "amber";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums">
        {formatCronNumber(value)}
      </p>
    </div>
  );
}

export default async function AdminCronRunDetailPage({
  params,
  searchParams,
}: Props) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  if (!runId || runId.length > 191) notFound();

  const run = await prisma.cronRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      job: true,
      trigger: true,
      status: true,
      startedAt: true,
      finishedAt: true,
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
      errorMessage: true,
    },
  });
  if (!run) notFound();

  const allowedStatuses = new Set<string>(
    RESULT_STATUS_OPTIONS.map((option) => option.value)
  );
  const requestedStatus = first(query.status).toUpperCase();
  const status = allowedStatuses.has(requestedStatus)
    ? requestedStatus
    : "ALL";
  const search = first(query.q).trim().slice(0, 100);
  const statusWhere: Prisma.CronResultWhereInput =
    status === "ALL"
      ? {}
      : status === "OTHER_ERROR"
        ? { status: { in: [...OTHER_ERROR_RESULT_STATUSES] } }
        : { status };
  const where: Prisma.CronResultWhereInput = {
    runId,
    ...statusWhere,
    ...(search
      ? {
          OR: [
            { placeName: { contains: search, mode: "insensitive" } },
            { keyword: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const filteredCount = await prisma.cronResult.count({ where });
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const page = Math.min(
    positiveInteger(first(query.page), 1),
    totalPages
  );
  const results = await prisma.cronResult.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      placeName: true,
      keyword: true,
      status: true,
      rank: true,
      errorMessage: true,
      httpStatus: true,
      durationMs: true,
      createdAt: true,
    },
  });
  const issueCount =
    run.ncaptcha +
    run.http429 +
    run.timeout +
    run.cooldownSkip +
    run.error;

  return (
    <>
      <div className="mb-5">
        <Link
          href="/admin/cron-runs"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden />
          실행 목록
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
              크론 실행 상세
            </h1>
            <p className="mt-1 flex max-w-full items-center gap-1.5 truncate font-mono text-[11px] text-slate-500">
              <Hash className="h-3 w-3 shrink-0" aria-hidden />
              {run.id}
            </p>
          </div>
          <RunStatusBadge status={run.status} />
        </div>
      </div>

      <section className="mb-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold text-slate-500">작업</dt>
              <dd className="mt-0.5 font-bold text-slate-900">
                {cronJobLabel(run.job)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-slate-500">호출</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-800">
                {run.trigger}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-slate-500">시작</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-slate-800">
                {formatCronDateTime(run.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-slate-500">종료</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-slate-800">
                {formatCronDateTime(run.finishedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-slate-500">소요 시간</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-slate-800">
                {formatCronDuration(run.durationMs)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-slate-500">
                추적 / 이번 실행 대상
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-slate-800">
                {formatCronNumber(run.trackedTotal)} /{" "}
                {formatCronNumber(run.eligibleTotal)}
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryValue label="전체 결과" value={run.total} />
            <SummaryValue
              label="저장 성공"
              value={run.success}
              tone="emerald"
            />
            <SummaryValue label="순위권 밖" value={run.outOfRange} />
            <SummaryValue
              label="오류·차단"
              value={issueCount}
              tone={issueCount > 0 ? "rose" : "slate"}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-5">
          <SummaryValue label="캡차" value={run.ncaptcha} tone="rose" />
          <SummaryValue label="HTTP 429" value={run.http429} tone="rose" />
          <SummaryValue label="시간 초과" value={run.timeout} tone="amber" />
          <SummaryValue
            label="전역 대기"
            value={run.cooldownSkip}
            tone="amber"
          />
          <SummaryValue label="기타 오류" value={run.error} tone="rose" />
        </div>

        {run.errorMessage ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-bold">실행 오류</p>
              <p className="mt-1 break-words font-mono text-[11px] leading-relaxed">
                {run.errorMessage}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue-200/80 bg-blue-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-blue-900">
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          순위 저장 성공·280위 밖 상세 행은 14일, 실패 상세 행과 실행 요약은
          90일 만료 기준으로 기록됩니다. 현재는 expiresAt만 저장하며 자동 삭제는
          별도 정리 작업으로 후속 적용합니다.
        </p>
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
        <form
          action={`/admin/cron-runs/${encodeURIComponent(run.id)}`}
          method="get"
          className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto_auto] md:items-end"
        >
          <label className="text-xs font-semibold text-slate-500">
            결과 상태
            <select
              name="status"
              defaultValue={status}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500"
            >
              {RESULT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            업체·키워드 검색
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="업체명 또는 키워드"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-9 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500"
              />
            </span>
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">
            <Search className="h-4 w-4" aria-hidden /> 조회
          </button>
          <Link
            href={`/admin/cron-runs/${run.id}`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            초기화
          </Link>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            {issueCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            )}
            <h2 className="text-sm font-bold text-slate-900">키워드별 결과</h2>
          </div>
          <p className="text-[11px] text-slate-500">
            조건에 맞는 결과 {formatCronNumber(filteredCount)}건
          </p>
        </div>

        {results.length === 0 ? (
          <p className="px-5 py-12 text-center text-xs text-slate-500">
            조건에 맞는 키워드 결과가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-xs">
              <thead className="bg-slate-50/90 text-[11px] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">업체</th>
                  <th className="px-4 py-3 font-semibold">키워드</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 text-right font-semibold">순위</th>
                  <th className="px-4 py-3 text-right font-semibold">HTTP</th>
                  <th className="px-4 py-3 text-right font-semibold">소요 시간</th>
                  <th className="px-4 py-3 font-semibold">오류 정보</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((result) => (
                  <tr key={result.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="max-w-[220px] px-4 py-3 font-semibold text-slate-900">
                      <span className="block truncate" title={result.placeName}>
                        {result.placeName || "-"}
                      </span>
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-slate-700">
                      <span className="block truncate" title={result.keyword}>
                        {result.keyword || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ResultStatusBadge status={result.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                      {result.rank == null ? "-" : `${formatCronNumber(result.rank)}위`}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-600">
                      {formatCronNumber(result.httpStatus)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatCronDuration(result.durationMs)}
                    </td>
                    <td className="max-w-[300px] px-4 py-3 text-[11px] leading-relaxed text-rose-700">
                      <span
                        className="line-clamp-3 break-words"
                        title={result.errorMessage ?? undefined}
                      >
                        {result.errorMessage || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs">
            <Link
              href={detailHref({
                runId: run.id,
                status,
                search,
                page: Math.max(1, page - 1),
              })}
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
              href={detailHref({
                runId: run.id,
                status,
                search,
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
