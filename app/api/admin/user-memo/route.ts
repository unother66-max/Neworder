import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { isAdminEmail } from "@/lib/admin-emails";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MEMO = 8000;

export async function PATCH(req: Request) {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null };
  } | null;
  const email = session?.user?.email?.trim();
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: { userId?: unknown; adminMemo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const userId =
    typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let memo =
    typeof body.adminMemo === "string"
      ? body.adminMemo.trim().slice(0, MAX_MEMO)
      : null;
  if (memo === "") memo = null;

  await prisma.user.update({
    where: { id: userId },
    data: { adminMemo: memo },
  });

  return NextResponse.json({ ok: true });
}
