import type { Metadata } from "next";

import { requireNewOrderPageAccess } from "@/lib/neworder/auth";

import { NewOrderShell } from "./neworder-shell";

export const metadata: Metadata = {
  title: "뉴오더클럽 운영관리 | PostLabs",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const dynamic = "force-dynamic";

export default async function NewOrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireNewOrderPageAccess();

  return (
    <NewOrderShell
      operatorName={access.name || access.email || "운영자"}
      role={access.role}
    >
      {children}
    </NewOrderShell>
  );
}

