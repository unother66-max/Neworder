import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

export type NewOrderAccess = {
  userId: string;
  email: string | null;
  name: string | null;
  role: "STORE_MANAGER" | "ADMIN" | "SUPERADMIN";
};

export async function getNewOrderAccess(): Promise<NewOrderAccess | null> {
  const session = (await getServerSession(authOptions as never)) as {
    user?: {
      id?: string | null;
      email?: string | null;
      name?: string | null;
    };
  } | null;
  const userId = session?.user?.id?.trim();
  if (!userId) return null;

  const operator = await prisma.newOrderOperator.findUnique({
    where: { userId },
    select: { role: true, isActive: true },
  });
  const email = session?.user?.email?.trim() || null;

  if (operator?.isActive) {
    return {
      userId,
      email,
      name: session?.user?.name?.trim() || null,
      role: operator.role,
    };
  }

  return null;
}

export async function requireNewOrderPageAccess(): Promise<NewOrderAccess> {
  const access = await getNewOrderAccess();
  if (!access) {
    const session = (await getServerSession(authOptions as never)) as {
      user?: { id?: string | null };
    } | null;
    if (!session?.user?.id) {
      redirect("/login?callbackUrl=%2Foperations%2Fneworder");
    }
    redirect("/operations/neworder-access-denied");
  }
  return access;
}
