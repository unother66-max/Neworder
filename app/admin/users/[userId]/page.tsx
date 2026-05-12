import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronDown, ExternalLink, MapPin, User } from "lucide-react";
import { getServerSession } from "next-auth/next";

import TopNav from "@/components/top-nav";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin-emails";
import { formatSeoulDateTime } from "@/lib/seoul-calendar";

import { AdminUserMemoBlock } from "../admin-user-memo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ userId: string }> };

function placeModeLabel(type: string): string {
  return type === "review" ? "리뷰" : "순위";
}

function formatVol(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return n.toLocaleString("ko-KR");
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { userId } = await params;

  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null };
  } | null;
  const email = session?.user?.email?.trim();

  if (!email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/admin/users/${userId}`)}`);
  }

  if (!isAdminEmail(email)) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      createdAtReliable: true,
      adminMemo: true,
      places: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          category: true,
          address: true,
          placeUrl: true,
          type: true,
          reviewAutoTracking: true,
          createdAt: true,
          keywords: {
            orderBy: { sortOrder: "asc" },
            select: {
              keyword: true,
              mobileVolume: true,
              pcVolume: true,
              totalVolume: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const placeIds = user.places.map((p) => p.id);
  const urls = [
    ...new Set(
      user.places
        .map((p) => p.placeUrl?.trim())
        .filter((u): u is string => Boolean(u && u.length > 0))
    ),
  ];

  const [rankHistories, tracks] = await Promise.all([
    placeIds.length
      ? prisma.rankHistory.findMany({
          where: { placeId: { in: placeIds } },
          orderBy: { createdAt: "desc" },
          select: {
            placeId: true,
            keyword: true,
            rank: true,
            createdAt: true,
          },
        })
      : [],
    urls.length
      ? prisma.track.findMany({
          where: { placeUrl: { in: urls } },
          select: {
            placeUrl: true,
            keyword: true,
            records: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { rank: true, createdAt: true },
            },
          },
        })
      : [],
  ]);

  const latestRankByPlaceKeyword = new Map<
    string,
    { rank: number; createdAt: Date }
  >();
  for (const row of rankHistories) {
    const k = `${row.placeId}\0${row.keyword}`;
    if (!latestRankByPlaceKeyword.has(k)) {
      latestRankByPlaceKeyword.set(k, {
        rank: row.rank,
        createdAt: row.createdAt,
      });
    }
  }

  const trackRankByUrlKeyword = new Map<
    string,
    { rank: number; createdAt: Date }
  >();
  for (const t of tracks) {
    const rec = t.records[0];
    if (!rec) continue;
    const key = `${t.placeUrl}\0${t.keyword}`;
    const prev = trackRankByUrlKeyword.get(key);
    if (!prev || rec.createdAt > prev.createdAt) {
      trackRankByUrlKeyword.set(key, {
        rank: rec.rank,
        createdAt: rec.createdAt,
      });
    }
  }

  const hasImage =
    typeof user.image === "string" && user.image.trim().length > 0;
  const displayEmail = user.email?.trim() || "—";
  const displayName = user.name?.trim() || "이름 미등록";

  return (
    <div className="min-h-screen bg-[#f5f8fc]">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-14 md:pt-8">
        <div className="mb-5">
          <Link
            href="/admin/users"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft size={14} aria-hidden />
            회원 목록
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
            회원 상세
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600 md:text-[13px]">
            등록된 플레이스와 키워드·순위 요약입니다.
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <User className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-bold text-slate-900">
                  {displayName}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-600 sm:text-xs">
                  {displayEmail}
                </p>
                <dl className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:text-xs">
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <dt className="text-slate-500">가입일</dt>
                    <dd className="font-medium text-slate-800">
                      {!user.createdAtReliable ? (
                        <span className="text-amber-800">
                          가입일 확인 불가{" "}
                          <span className="text-[10px] text-amber-700">
                            (기존 회원)
                          </span>
                        </span>
                      ) : (
                        <span className="tabular-nums">
                          {formatSeoulDateTime(user.createdAt)}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <dt className="text-slate-500">프로필 이미지</dt>
                    <dd>
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
            </div>
          </div>
          <AdminUserMemoBlock userId={user.id} initialMemo={user.adminMemo} />
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
            <MapPin className="h-4 w-4 text-slate-600" aria-hidden />
            등록 플레이스 ({user.places.length})
          </h2>

          {user.places.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-xs text-slate-500">
              등록된 플레이스가 없습니다.
            </p>
          ) : (
            <ul className="space-y-3">
              {user.places.map((place, index) => {
                const pkKeywords = place.keywords.map((k) => k.keyword);
                const placeUrl = place.placeUrl?.trim() ?? "";
                const trackKwExtra = new Set<string>();
                if (placeUrl) {
                  for (const t of tracks) {
                    if (t.placeUrl !== placeUrl) continue;
                    if (!pkKeywords.includes(t.keyword)) {
                      trackKwExtra.add(t.keyword);
                    }
                  }
                }
                const trackExtras = [...trackKwExtra].map((keyword) => ({
                  keyword,
                }));
                const mergedKeywords = [
                  ...place.keywords.map((k) => ({
                    keyword: k.keyword,
                    mobileVolume: k.mobileVolume,
                    pcVolume: k.pcVolume,
                    totalVolume: k.totalVolume,
                    fromTrack: false,
                  })),
                  ...trackExtras.map((t) => ({
                    keyword: t.keyword,
                    mobileVolume: null as number | null,
                    pcVolume: null as number | null,
                    totalVolume: null as number | null,
                    fromTrack: true,
                  })),
                ];

                return (
                  <li key={place.id}>
                    <details
                      className="group rounded-2xl border border-slate-200/90 bg-white shadow-sm open:shadow-md"
                      open={index === 0}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:content-none sm:px-5 sm:py-4 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {place.name}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {place.category?.trim() || "카테고리 없음"}
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                              {placeModeLabel(place.type)}
                            </span>
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
                      </summary>

                      <div className="border-t border-slate-100 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
                        <dl className="mb-4 grid gap-2 text-[11px] text-slate-600 sm:grid-cols-2 sm:text-xs">
                          <div className="sm:col-span-2">
                            <dt className="text-slate-500">주소</dt>
                            <dd className="mt-0.5 break-words font-medium text-slate-800">
                              {place.address?.trim() || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">플레이스 URL</dt>
                            <dd className="mt-0.5">
                              {place.placeUrl?.trim() ? (
                                <a
                                  href={place.placeUrl.trim()}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex max-w-full items-center gap-1 break-all text-blue-700 underline-offset-2 hover:underline"
                                >
                                  <span className="min-w-0 truncate sm:whitespace-normal sm:break-all">
                                    {place.placeUrl.trim()}
                                  </span>
                                  <ExternalLink
                                    className="h-3.5 w-3.5 shrink-0"
                                    aria-hidden
                                  />
                                </a>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">리뷰 자동추적</dt>
                            <dd className="mt-0.5 font-medium text-slate-800">
                              {place.reviewAutoTracking ? "ON" : "OFF"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">등록일</dt>
                            <dd className="mt-0.5 font-medium tabular-nums text-slate-800">
                              {formatSeoulDateTime(place.createdAt)}
                            </dd>
                          </div>
                        </dl>

                        <div>
                          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            키워드
                          </h3>
                          {mergedKeywords.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4 text-center text-[11px] text-slate-500">
                              등록된 키워드 없음
                            </p>
                          ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                              <table className="w-full min-w-[520px] border-collapse text-left text-[11px] sm:min-w-0 sm:text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500">
                                    <th className="px-3 py-2 font-semibold sm:px-4">
                                      키워드
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold sm:px-4">
                                      최신 순위
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold sm:px-4">
                                      월검색량
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold sm:px-4">
                                      모바일
                                    </th>
                                    <th className="whitespace-nowrap px-3 py-2 font-semibold sm:px-4">
                                      PC
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mergedKeywords.map((row) => {
                                    const rk = latestRankByPlaceKeyword.get(
                                      `${place.id}\0${row.keyword}`
                                    );
                                    const trk = placeUrl
                                      ? trackRankByUrlKeyword.get(
                                          `${placeUrl}\0${row.keyword}`
                                        )
                                      : undefined;
                                    const rankSource = rk ?? trk;
                                    const tv = formatVol(row.totalVolume);
                                    const mv = formatVol(row.mobileVolume);
                                    const pv = formatVol(row.pcVolume);
                                    return (
                                      <tr
                                        key={`${place.id}-${row.keyword}-${row.fromTrack ? "t" : "p"}`}
                                        className="border-b border-slate-50 last:border-b-0"
                                      >
                                        <td className="px-3 py-2.5 font-medium text-slate-900 sm:px-4">
                                          <span className="break-words">
                                            {row.keyword}
                                          </span>
                                          {row.fromTrack ? (
                                            <span className="ml-1.5 align-middle text-[10px] font-normal text-slate-400">
                                              (Track)
                                            </span>
                                          ) : null}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800 sm:px-4">
                                          {rankSource != null
                                            ? rankSource.rank
                                            : "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700 sm:px-4">
                                          {tv ?? "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700 sm:px-4">
                                          {mv ?? "—"}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700 sm:px-4">
                                          {pv ?? "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
