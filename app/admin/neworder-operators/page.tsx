import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { isAdminEmail } from "@/lib/admin-emails";

import { NewOrderOperatorAdmin } from "./operator-admin";

export const metadata: Metadata = {
  title: "뉴오더클럽 운영자 관리 | PostLabs",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function NewOrderOperatorAdminPage() {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null };
  } | null;
  const email = session?.user?.email?.trim();
  if (!email) {
    redirect("/login?callbackUrl=%2Fadmin%2Fneworder-operators");
  }
  if (!isAdminEmail(email)) redirect("/");

  return <NewOrderOperatorAdmin />;
}
