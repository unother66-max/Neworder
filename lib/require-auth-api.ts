import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";

export const LOGIN_REQUIRED_FEATURE_ERROR = "로그인이 필요한 기능입니다.";

export type AuthApiSession = {
  user: {
    email?: string | null;
    id?: string | null;
  };
};

export async function requireAuthApi(): Promise<
  { ok: true; session: AuthApiSession } | { ok: false; response: NextResponse }
> {
  const session = (await getServerSession(authOptions as never)) as {
    user?: { email?: string | null; id?: string | null };
  } | null;
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: LOGIN_REQUIRED_FEATURE_ERROR },
        { status: 401 }
      ),
    };
  }
  return { ok: true, session: { user: session.user } };
}
