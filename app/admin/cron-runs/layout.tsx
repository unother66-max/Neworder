import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { Activity, Shield, Users } from "lucide-react";

import TopNav from "@/components/top-nav";
import { authOptions } from "@/auth";
import { isAdminEmail } from "@/lib/admin-emails";

export const metadata: Metadata = {
  title: "크론 실행 기록 | PostLabs",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const ADMIN_LINKS = [
  { href: "/admin/users", label: "운영 대시보드", icon: Shield },
  { href: "/admin/cron-runs", label: "크론 실행 기록", icon: Activity },
  {
    href: "/admin/neworder-operators",
    label: "뉴오더 운영자",
    icon: Users,
  },
] as const;

export default async function AdminCronRunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null };
  } | null;
  const email = session?.user?.email?.trim();

  if (!email) {
    redirect("/login?callbackUrl=%2Fadmin%2Fcron-runs");
  }
  if (!isAdminEmail(email)) redirect("/");

  return (
    <div className="min-h-screen bg-[#f5f8fc]">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-14 md:pt-8">
        <nav
          aria-label="관리자 메뉴"
          className="mb-5 flex flex-wrap gap-2"
        >
          {ADMIN_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                href === "/admin/cron-runs"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
}
