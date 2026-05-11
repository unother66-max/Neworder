import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarPlus,
  ClipboardList,
  Clock,
  Database,
  Eye,
  Layers,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Shield,
  Store,
  Users,
} from "lucide-react";
import { getServerSession } from "next-auth/next";

import TopNav from "@/components/top-nav";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin-emails";
import { maskedFingerprint } from "@/lib/mask-hash";
import {
  referrerCategoryLabel,
  REFERRER_ORDER,
  type ReferrerCategory,
} from "@/lib/referrer-category";
import {
  utcRangeSeoulCalendarDay,
  formatSeoulDateTime,
  seoulCalendarDateString,
  recentSeoulDateStrings,
  utcRangeForSeoulDateString,
} from "@/lib/seoul-calendar";
import { uaDeviceBrowserHint } from "@/lib/user-agent-hint";

import { AdminTrendChart } from "./admin-trend-chart";
import { AdminUserMemoBlock } from "./admin-user-memo";

/** findMany(select) 결과와 동일 구조 — prisma schema User와 맞춤 */
interface RecentUserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: Date;
  createdAtReliable: boolean;
  adminMemo: string | null;
}

interface VisitorLogDailyCountRow {
  visitDate: string;
  _count: { _all: number } | null;
}

interface VisitorEventRecentRow {
  id: string;
  createdAt: Date;
  path: string | null;
  referrerCategory: string;
  ipHash: string;
  uaSnippet: string | null;
}

interface SignupCountByIso {
  iso: string;
  c: number;
}

interface AdminAlertListItem {
  id: string;
  type: string;
  level: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

const RECENT_TAKE = 40;

export const dynamic = "force-dynamic";

async function distinctIpSince(since: Date): Promise<number> {
  try {
    const rows = await prisma.visitorEvent.groupBy({
      by: ["ipHash"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    return rows.length;
  } catch (err) {
    console.error("[admin/users] visitorEvent distinctIpSince failed", err);
    return 0;
  }
}

function unwrapSettled<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  label: string
): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[admin/users] ${label} failed`, result.reason);
  return fallback;
}

type VisitorEventReferrerGroupRow = {
  referrerCategory: string;
  _count: { _all: number } | null;
};

function refCountsMap(rows: VisitorEventReferrerGroupRow[]): Record<string, number> {
  return Object.fromEntries(
    rows.map((r) => [r.referrerCategory, r._count?._all ?? 0])
  );
}

function adminAlertLevelBadgeClass(level: string): string {
  switch (level) {
    case "error":
      return "bg-red-100 text-red-800 ring-red-600/20";
    case "warning":
      return "bg-orange-100 text-orange-900 ring-orange-600/25";
    case "success":
      return "bg-emerald-100 text-emerald-800 ring-emerald-600/20";
    case "info":
      return "bg-blue-100 text-blue-900 ring-blue-600/20";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-500/15";
  }
}

const QUICK_LINKS = [
  { href: "/admin/users", label: "회원관리", icon: Shield },
  { href: "/place", label: "플레이스", icon: MapPin },
  { href: "/place-review", label: "리뷰추적", icon: ClipboardList },
  { href: "/smartstore", label: "스마트스토어", icon: Store },
  { href: "/kakao-place", label: "카카오맵", icon: Navigation },
  { href: "#collect-status", label: "수집·크론", icon: RefreshCw },
] as const;

export default async function AdminUsersPage() {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null };
  } | null;
  const email = session?.user?.email?.trim();

  if (!email) redirect("/login?callbackUrl=%2Fadmin%2Fusers");

  if (!isAdminEmail(email)) {
    redirect("/");
  }

  const todaySeoulStr = seoulCalendarDateString();
  const { start: startSeoulToday, endExclusive: endExclusiveSeoulToday } =
    utcRangeSeoulCalendarDay();
  const dateKeysSeven = recentSeoulDateStrings(7);
  const nowMs = Date.now();
  const window5 = new Date(nowMs - 5 * 60 * 1000);
  const window30 = new Date(nowMs - 30 * 60 * 1000);
  const windowRecent = new Date(nowMs - 2 * 60 * 1000);

  const signupFallback: SignupCountByIso[] = dateKeysSeven.map((iso) => ({
    iso,
    c: 0,
  }));

  const dashboardSettled = await Promise.allSettled([
    prisma.user.count(),
    prisma.user.count({
      where: {
        createdAtReliable: true,
        createdAt: {
          gte: startSeoulToday,
          lt: endExclusiveSeoulToday,
        },
      },
    }),
    prisma.visitorLog.count({
      where: { visitDate: todaySeoulStr },
    }),
    distinctIpSince(window5),
    distinctIpSince(window30),
    distinctIpSince(windowRecent),
    prisma.visitorEvent.groupBy({
      by: ["referrerCategory"],
      where: { visitDate: todaySeoulStr },
      _count: { _all: true },
    }),
    prisma.visitorEvent.groupBy({
      by: ["referrerCategory"],
      where: { visitDate: { in: dateKeysSeven } },
      _count: { _all: true },
    }),
    prisma.visitorEvent.findMany({
      where: { visitDate: { in: dateKeysSeven } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        path: true,
        referrerCategory: true,
        ipHash: true,
        uaSnippet: true,
      },
    }),
    prisma.visitorLog.groupBy({
      by: ["visitDate"],
      where: { visitDate: { in: dateKeysSeven } },
      _count: { _all: true },
    }),
    Promise.all(
      dateKeysSeven.map(async (iso) => {
        const { start, endExclusive } = utcRangeForSeoulDateString(iso);
        const c = await prisma.user.count({
          where: {
            createdAtReliable: true,
            createdAt: { gte: start, lt: endExclusive },
          },
        });
        return { iso, c };
      })
    ),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_TAKE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        createdAtReliable: true,
        adminMemo: true,
      },
    }),
    prisma.adminAlert.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        level: true,
        title: true,
        message: true,
        isRead: true,
        createdAt: true,
      },
    }),
  ]);

  const totalUsers = unwrapSettled(dashboardSettled[0], 0, "user.count");
  const joinedTodayCount = unwrapSettled(
    dashboardSettled[1],
    0,
    "user.count joinedToday"
  );
  const visitorsToday = unwrapSettled(
    dashboardSettled[2],
    0,
    "visitorLog.count today"
  );
  const distinct5m = unwrapSettled(dashboardSettled[3], 0, "distinctIp 5m");
  const distinct30m = unwrapSettled(dashboardSettled[4], 0, "distinctIp 30m");
  const distinctRecent = unwrapSettled(
    dashboardSettled[5],
    0,
    "distinctIp 2m"
  );
  const refTodayRows = unwrapSettled(
    dashboardSettled[6],
    [] as VisitorEventReferrerGroupRow[],
    "visitorEvent.groupBy refToday"
  );
  const ref7Rows = unwrapSettled(
    dashboardSettled[7],
    [] as VisitorEventReferrerGroupRow[],
    "visitorEvent.groupBy ref7d"
  );
  const recentEvents = unwrapSettled(
    dashboardSettled[8],
    [] as VisitorEventRecentRow[],
    "visitorEvent.findMany recent"
  );
  const visitorLogByDay = unwrapSettled(
    dashboardSettled[9],
    [] as VisitorLogDailyCountRow[],
    "visitorLog.groupBy 7d"
  );
  const signupRowsRaw = unwrapSettled(
    dashboardSettled[10],
    signupFallback,
    "signup counts by day"
  );
  const recentUsers = unwrapSettled(
    dashboardSettled[11],
    [] as RecentUserRow[],
    "user.findMany recent"
  );
  const recentAdminAlerts = unwrapSettled(
    dashboardSettled[12],
    [] as AdminAlertListItem[],
    "adminAlert.findMany"
  );

  const visitorByDayMap = Object.fromEntries(
    visitorLogByDay.map((r: VisitorLogDailyCountRow) => [
      r.visitDate,
      r._count?._all ?? 0,
    ])
  );
  const signupByDayMap = Object.fromEntries(
    signupRowsRaw.map((x: SignupCountByIso) => [x.iso, x.c])
  );
  const chartData = dateKeysSeven.map((day) => ({
    day,
    visitors: visitorByDayMap[day] ?? 0,
    signups: signupByDayMap[day] ?? 0,
  }));

  const mapToday = refCountsMap(refTodayRows);
  const map7 = refCountsMap(ref7Rows);

  return (
    <div className="min-h-screen bg-[#f5f8fc]">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-14 md:pt-8">
        <div className="mb-5">
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft size={14} aria-hidden />
            홈으로
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
            운영 대시보드
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 md:text-[13px]">
            회원 가입 및 일 방문(고유) 집계는 기존과 동일하게 유지됩니다.
            시간·달력 기준은 <span className="font-medium text-slate-700">Asia/Seoul</span>.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <Users className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              전체 회원
            </div>
            <p className="text-xl font-bold tabular-nums text-slate-900 md:text-2xl">
              {totalUsers}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200/85 bg-emerald-50/50 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-900">
              <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
              오늘 가입
            </div>
            <p className="text-xl font-bold tabular-nums text-emerald-950 md:text-2xl">
              {joinedTodayCount}
            </p>
            <p className="mt-1 text-[10px] text-emerald-800/85">신뢰 레코드만</p>
          </div>
          <div className="rounded-xl border border-violet-200/85 bg-violet-50/40 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-violet-900">
              <Eye className="h-4 w-4 shrink-0" aria-hidden />
              오늘 방문
            </div>
            <p className="text-xl font-bold tabular-nums text-violet-950 md:text-2xl">
              {visitorsToday}
            </p>
            <p className="mt-1 text-[10px] text-violet-800/85">일 고유</p>
          </div>
          <div className="rounded-xl border border-sky-200/80 bg-sky-50/40 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-sky-900">
              <Activity className="h-4 w-4 shrink-0" aria-hidden />
              최근 5분
            </div>
            <p className="text-xl font-bold tabular-nums text-sky-950 md:text-2xl">
              {distinct5m}
            </p>
            <p className="mt-1 text-[10px] text-sky-800/85">고유 IP(추정)</p>
          </div>
          <div className="rounded-xl border border-amber-200/85 bg-amber-50/40 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
              <Clock className="h-4 w-4 shrink-0" aria-hidden />
              최근 30분
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-950 md:text-2xl">
              {distinct30m}
            </p>
            <p className="mt-1 text-[10px] text-amber-900/80">고유 IP(추정)</p>
          </div>
          <div className="rounded-xl border border-rose-200/80 bg-rose-50/35 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-900">
              <Radio className="h-4 w-4 shrink-0" aria-hidden />
              현재 접속 추정
            </div>
            <p className="text-xl font-bold tabular-nums text-rose-950 md:text-2xl">
              {distinctRecent}
            </p>
            <p className="mt-1 text-[10px] text-rose-800/85">최근 2분 고유</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              {label}
            </Link>
          ))}
        </div>

        <div className="mb-8 grid gap-5 lg:grid-cols-12">
          <div className="space-y-5 lg:col-span-8">
            <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-slate-600" aria-hidden />
                <h2 className="text-sm font-bold text-slate-900">
                  최근 7일 방문 vs 가입
                </h2>
              </div>
              <AdminTrendChart data={chartData} />
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <Layers className="h-4 w-4 text-slate-600" aria-hidden />
                최근 가입 회원
              </h2>
              <ul className="grid gap-2.5 sm:gap-3">
                {recentUsers.map((u: RecentUserRow) => {
                  const hasImage =
                    typeof u.image === "string" && u.image.trim().length > 0;
                  const displayEmail = u.email?.trim() || "—";
                  const displayName = u.name?.trim() || "이름 미등록";

                  return (
                    <li
                      key={u.id}
                      className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {displayName}
                          </p>
                          <p className="truncate font-mono text-[11px] text-slate-600 sm:text-xs">
                            {displayEmail}
                          </p>
                        </div>
                        <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-600 sm:flex sm:w-auto sm:flex-col sm:gap-1 sm:text-right sm:text-xs">
                          <div className="col-span-2 sm:text-right">
                            <dt className="inline text-slate-500 sm:block">가입일</dt>{" "}
                            <dd className="inline sm:block">
                              {!u.createdAtReliable ? (
                                <span className="text-amber-800">
                                  <span className="font-medium">
                                    가입일 확인 불가
                                  </span>
                                  <span className="ml-1 text-[10px] text-amber-700">
                                    (기존 회원)
                                  </span>
                                </span>
                              ) : (
                                <span className="font-medium tabular-nums text-slate-800">
                                  {formatSeoulDateTime(u.createdAt)}
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className="col-span-2 sm:text-right">
                            <dt className="inline text-slate-500 sm:block">
                              프로필 이미지
                            </dt>{" "}
                            <dd className="inline sm:block">
                              <span
                                className={
                                  hasImage
                                    ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                                    : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                                }
                              >
                                {hasImage ? "있음" : "없음"}
                              </span>
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <AdminUserMemoBlock userId={u.id} initialMemo={u.adminMemo} />
                    </li>
                  );
                })}
              </ul>
              {recentUsers.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-xs text-slate-500">
                  등록된 회원이 없습니다.
                </p>
              )}
            </section>
          </div>

          <div className="space-y-4 lg:col-span-4">
            <section className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-[13px] font-bold text-slate-900">
                유입 (오늘)
              </h2>
              <ul className="space-y-1.5">
                {(REFERRER_ORDER as readonly ReferrerCategory[]).map((key) => (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="text-slate-600">{referrerCategoryLabel(key)}</span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {mapToday[key] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-[13px] font-bold text-slate-900">
                유입 (최근 7일)
              </h2>
              <ul className="space-y-1.5">
                {(REFERRER_ORDER as readonly ReferrerCategory[]).map((key) => (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="text-slate-600">{referrerCategoryLabel(key)}</span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {map7[key] ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-900">
                <Bell className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                최근 알림
              </h2>
              {recentAdminAlerts.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  저장된 알림이 없습니다. 크론 실패 또는 순위 조회 차단 시 여기에
                  표시됩니다.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentAdminAlerts.map((a: AdminAlertListItem) => (
                    <li
                      key={a.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-[11px]"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${adminAlertLevelBadgeClass(a.level)}`}
                        >
                          {a.level}
                        </span>
                        <span className="rounded bg-slate-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          {a.type}
                        </span>
                        {!a.isRead ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-800">
                            new
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 font-semibold text-slate-900">{a.title}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-slate-600">
                        {a.message}
                      </p>
                      <p className="mt-2 tabular-nums text-[10px] text-slate-500">
                        {formatSeoulDateTime(a.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-[13px] font-bold text-slate-900">
                최근 방문 로그
              </h2>
              {recentEvents.length === 0 ? (
                <p className="text-[11px] text-slate-500">아직 이벤트가 없습니다.</p>
              ) : (
                <ul className="space-y-2.5">
                  {recentEvents.map((ev: VisitorEventRecentRow) => (
                    <li
                      key={ev.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px]"
                    >
                      <div className="font-semibold tabular-nums text-slate-900">
                        {formatSeoulDateTime(ev.createdAt)}
                      </div>
                      <div className="mt-1 text-slate-600">
                        경로{" "}
                        <span className="font-mono font-medium text-slate-800">
                          {ev.path?.trim() || "—"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                        <span>유입 {referrerCategoryLabel(ev.referrerCategory)}</span>
                        <span>· 단말 {uaDeviceBrowserHint(ev.uaSnippet)}</span>
                        <span title="식별 해시 마스킹">
                          · {maskedFingerprint(ev.ipHash)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              id="collect-status"
              className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-400" aria-hidden />
                <h2 className="text-[13px] font-bold text-slate-900">
                  수집·크론 상태
                </h2>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                플레이스·리뷰·스마트스토어·카카오맵 수집 상태 연동 준비 중입니다.
                크론은 Vercel에서 스케줄만 호출되는 구조이며 별도 로그 테이블이 생기면
                이 영역에 반영합니다.
              </p>
              <span className="mt-3 inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                준비 중
              </span>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
