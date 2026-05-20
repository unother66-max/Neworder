import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { isAdminEmail } from "@/lib/admin-emails";

export type AdminApiSession = {
  user: {
    email: string;
    id?: string | null;
  };
};

export async function requireAdminApi():
  Promise<{ ok: true; session: AdminApiSession; email: string } | { ok: false; response: NextResponse }> {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null; id?: string | null };
  } | null;
  const email = session?.user?.email?.trim();
  if (!email || !isAdminEmail(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    email,
    session: {
      user: {
        email,
        id: session?.user?.id ?? null,
      },
    },
  };
}
