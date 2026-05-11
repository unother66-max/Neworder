import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminEmail } from "@/lib/admin-emails";
import { extractClientIp, shouldAttemptVisitLog } from "@/lib/visit-request";
import { getVisitInternalSecret } from "@/lib/visit-internal-secret";

const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

function isLegacyAuthPath(path: string): boolean {
  if (path.startsWith("/top-blog")) return true;
  if (path.startsWith("/place-analysis")) return true;
  if (path.startsWith("/place-review")) return true;
  if (path === "/place" || path.startsWith("/place/")) return true;
  return false;
}

function redirectLogin(req: NextRequest) {
  const u = new URL("/login", req.url);
  u.searchParams.set(
    "callbackUrl",
    req.nextUrl.pathname + req.nextUrl.search
  );
  return NextResponse.redirect(u);
}

async function recordVisitIfEligible(req: NextRequest) {
  const visitSecret = getVisitInternalSecret();
  if (!visitSecret || !shouldAttemptVisitLog(req)) return;

  const url = `${req.nextUrl.origin}/api/internal/visit`;
  const ip = extractClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const path = req.nextUrl.pathname + (req.nextUrl.search ?? "");
  const navReferrer = req.headers.get("referer")?.trim() || null;
  const body = JSON.stringify({
    path,
    referrer: navReferrer,
  });
  const ac = new AbortController();
  const t = globalThis.setTimeout(() => ac.abort(), 2500);
  try {
    await fetch(url, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        "x-internal-visit-secret": visitSecret,
        "x-visit-client-ip": ip,
        "user-agent": ua,
      },
      body,
    });
  } catch {
    /* non-blocking for UX */
  } finally {
    globalThis.clearTimeout(t);
  }
}

export async function middleware(req: NextRequest) {
  await recordVisitIfEligible(req);

  const path = req.nextUrl.pathname;

  if (path.startsWith("/admin")) {
    if (!secret)
      return NextResponse.redirect(new URL("/", req.url));
    const token = await getToken({ req, secret });
    if (!token) return redirectLogin(req);
    const email = typeof token.email === "string" ? token.email : "";
    if (!isAdminEmail(email)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (isLegacyAuthPath(path)) {
    if (!secret) return redirectLogin(req);
    const token = await getToken({ req, secret });
    if (!token) return redirectLogin(req);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|woff|ttf|eot|map|txt|xml|json|csv|pdf|wasm|js|css)$).*)",
  ],
};
