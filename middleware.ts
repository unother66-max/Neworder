import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminEmail } from "@/lib/admin-emails";

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
  u.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(u);
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith("/admin")) {
    if (!secret) return NextResponse.redirect(new URL("/", req.url));
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
    "/admin/:path*",
    "/top-blog/:path*",
    "/place/:path*",
    "/place-review/:path*",
    "/place-analysis/:path*",
  ],
};
