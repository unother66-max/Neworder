import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, CalendarPlus, ArrowLeft } from "lucide-react";
import { getServerSession } from "next-auth/next";

import TopNav from "@/components/top-nav";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin-emails";
import { utcRangeSeoulCalendarDay } from "@/lib/seoul-calendar";

const RECENT_TAKE = 40;

export const dynamic = "force-dynamic";

function formatKo(dt: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(dt);
}

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim();

  if (!email) redirect("/login?callbackUrl=%2Fadmin%2Fusers");

  if (!isAdminEmail(email)) {
    redirect("/");
  }

  const { start: startSeoulToday, endExclusive: endExclusiveSeoulToday } =
    utcRangeSeoulCalendarDay();

  const [totalUsers, joinedTodayCount, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        createdAt: {
          gte: startSeoulToday,
          lt: endExclusiveSeoulToday,
        },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_TAKE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNav />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-16 md:pt-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft size={16} aria-hidden />
              홈으로
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
              회원 현황
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              총·일별 가입은 Asia/Seoul 기준입니다.
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Users className="text-blue-600" size={18} aria-hidden />
              전체 회원
            </div>
            <p className="text-3xl font-bold tabular-nums text-slate-900">{totalUsers}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CalendarPlus size={18} aria-hidden />
              오늘 가입 (서울)
            </div>
            <p className="text-3xl font-bold tabular-nums text-emerald-950">
              {joinedTodayCount}
            </p>
          </div>
        </div>

        <section>
          <h2 className="mb-4 text-lg font-bold text-slate-900">최근 가입 순</h2>
          <ul className="grid gap-3 sm:gap-4">
            {recentUsers.map((u) => {
              const hasImage = typeof u.image === "string" && u.image.trim().length > 0;
              const displayEmail = u.email?.trim() || "—";
              const displayName = u.name?.trim() || "이름 미등록";

              return (
                <li
                  key={u.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-[15px] font-bold text-slate-900 sm:text-base">
                        {displayName}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-600 sm:text-sm">
                        {displayEmail}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 sm:flex sm:flex-shrink-0 sm:flex-col sm:gap-1 sm:text-right sm:text-sm">
                      <div className="col-span-2 sm:text-right">
                        <dt className="inline text-slate-500 sm:block sm:text-xs">가입일</dt>{" "}
                        <dd className="mt-0.5 inline font-medium text-slate-800 sm:mt-0 sm:block sm:tabular-nums">
                          {formatKo(u.createdAt)}
                        </dd>
                      </div>
                      <div className="col-span-2 sm:text-right">
                        <dt className="inline text-slate-500 sm:block sm:text-xs">프로필 이미지</dt>{" "}
                        <dd className="mt-0.5 inline sm:mt-0 sm:block">
                          <span
                            className={
                              hasImage
                                ? "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800"
                                : "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600"
                            }
                          >
                            {hasImage ? "있음" : "없음"}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </li>
              );
            })}
          </ul>

          {recentUsers.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 py-10 text-center text-sm text-slate-500">
              등록된 회원이 없습니다.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
