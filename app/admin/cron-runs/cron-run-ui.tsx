const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const RUN_STATUS_OPTIONS = [
  { value: "ALL", label: "전체 실행 상태" },
  { value: "RUNNING", label: "실행 중" },
  { value: "COMPLETED", label: "완료" },
  { value: "FAILED", label: "실행 실패" },
  { value: "ABORTED", label: "중단" },
] as const;

export const RESULT_STATUS_OPTIONS = [
  { value: "ALL", label: "전체 결과 상태" },
  { value: "SUCCESS", label: "순위 저장 성공" },
  { value: "OUT_OF_RANGE", label: "280위 밖" },
  { value: "NCAPTCHA", label: "네이버 캡차 감지" },
  { value: "HTTP_429", label: "네이버 요청 제한" },
  { value: "TIMEOUT", label: "응답 시간 초과" },
  { value: "GLOBAL_COOLDOWN_SKIP", label: "전역 차단 대기" },
  { value: "OTHER_ERROR", label: "기타 오류 (4종)" },
] as const;

export const OTHER_ERROR_RESULT_STATUSES = [
  "FETCH_ERROR",
  "DEADLINE_SKIP",
  "CLAIM_LOST",
  "UNKNOWN_ERROR",
] as const;

const RUN_STATUS_META: Record<string, { label: string; className: string }> = {
  RUNNING: {
    label: "실행 중",
    className: "bg-blue-100 text-blue-800 ring-blue-600/20",
  },
  COMPLETED: {
    label: "완료",
    className: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  },
  FAILED: {
    label: "실행 실패",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
  ABORTED: {
    label: "중단 · 비정상 종료 추정",
    className: "bg-amber-100 text-amber-900 ring-amber-600/25",
  },
};

const RESULT_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  SUCCESS: {
    label: "정상 저장",
    className: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  },
  OUT_OF_RANGE: {
    label: "조회 완료 · 280위 밖",
    className: "bg-slate-100 text-slate-700 ring-slate-500/15",
  },
  NCAPTCHA: {
    label: "네이버 CAPTCHA 차단",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
  HTTP_429: {
    label: "네이버 요청 제한(429)",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
  TIMEOUT: {
    label: "조회 시간 초과",
    className: "bg-orange-100 text-orange-900 ring-orange-600/25",
  },
  FETCH_ERROR: {
    label: "조회 요청 실패",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
  GLOBAL_COOLDOWN_SKIP: {
    label: "글로벌 쿨다운으로 조회 생략",
    className: "bg-amber-100 text-amber-900 ring-amber-600/25",
  },
  DEADLINE_SKIP: {
    label: "Cron 전체 제한시간으로 조회 생략",
    className: "bg-amber-100 text-amber-900 ring-amber-600/25",
  },
  CLAIM_LOST: {
    label: "작업 선점 실패",
    className: "bg-slate-100 text-slate-700 ring-slate-500/15",
  },
  UNKNOWN_ERROR: {
    label: "알 수 없는 오류",
    className: "bg-rose-100 text-rose-800 ring-rose-600/20",
  },
};

function StatusBadge({
  value,
  meta,
}: {
  value: string;
  meta: Record<string, { label: string; className: string }>;
}) {
  const item = meta[value] ?? {
    label: value || "-",
    className: "bg-slate-100 text-slate-700 ring-slate-500/15",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${item.className}`}
    >
      {item.label}
    </span>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  return <StatusBadge value={status} meta={RUN_STATUS_META} />;
}

export function ResultStatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <StatusBadge value={status} meta={RESULT_STATUS_META} />
      <span className="font-mono text-[9px] leading-none text-slate-500">
        {status || "-"}
      </span>
    </span>
  );
}

export function formatCronDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : DATE_TIME_FORMATTER.format(date);
}

export function formatCronNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "-"
    : NUMBER_FORMATTER.format(value);
}

export function formatCronDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value < 1_000) return `${Math.max(0, Math.round(value))}ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)}초`;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1_000);
  return `${minutes}분 ${seconds}초`;
}

export function cronJobLabel(job: string) {
  return job === "PLACE_RANK_TRACKING" ? "플레이스 순위 추적" : job;
}
