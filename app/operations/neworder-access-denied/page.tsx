import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { authOptions } from "@/auth";
import { getNewOrderAccess } from "@/lib/neworder/auth";

export const metadata: Metadata = {
  title: "운영관리 접근 권한 필요 | PostLabs",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function NewOrderAccessDeniedPage() {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { id?: string | null; email?: string | null };
  } | null;
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Foperations%2Fneworder");
  }

  const access = await getNewOrderAccess();
  if (access) redirect("/operations/neworder");

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f5f7f4] p-5">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldAlert className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-black">운영관리 접근 권한이 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          로그인 계정이 활성 NewOrderOperator로 등록되어 있지 않습니다.
          PostLabs 최고관리자에게 운영자 등록을 요청해 주세요.
        </p>
        <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          로그인 계정:{" "}
          <strong>{session.user.email?.trim() || "이메일 정보 없음"}</strong>
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-[#173f35] px-5 text-sm font-bold text-white"
        >
          PostLabs 홈으로
        </Link>
      </section>
    </main>
  );
}
