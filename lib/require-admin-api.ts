import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { isAdminEmail } from "@/lib/admin-emails";

export const ADMIN_ONLY_FEATURE_ERROR = "관리자만 사용할 수 있는 기능입니다.";

export type AdminApiSession = {
  user: {
    email: string;
    id?: string | null;
  };
};

export async function requireAdminApi(options?: {
  errorMessage?: string;
  includeOkField?: boolean;
}): Promise<
  { ok: true; session: AdminApiSession; email: string } | { ok: false; response: NextResponse }
> {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null; id?: string | null };
  } | null;
  const email = session?.user?.email?.trim();
  if (!email || !isAdminEmail(email)) {
    const error = options?.errorMessage ?? "FORBIDDEN";
    const body = options?.includeOkField === false ? { error } : { ok: false as const, error };
    return {
      ok: false,
      response: NextResponse.json(body, { status: 403 }),
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
