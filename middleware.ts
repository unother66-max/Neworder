import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminEmail } from "@/lib/admin-emails";

const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

function isBlogAnalysisPath(path: string): boolean {
  return path === "/blog-analysis" || path.startsWith("/blog-analysis/");
}

function isSmartstoreAdminOnlyPath(path: string): boolean {
  return (
    path === "/smartstore/store-analyze" ||
    path.startsWith("/smartstore/store-analyze/") ||
    path === "/smartstore/review-track" ||
    path.startsWith("/smartstore/review-track/")
  );
}

function isSmartstoreAdminOnlyApiPath(path: string): boolean {
  return (
    path.startsWith("/api/smartstore/store-analyze") ||
    path.startsWith("/api/smartstore-review-targets") ||
    path.startsWith("/api/smartstore-review-sync")
  );
}

function isSmartstoreAuthRequiredPath(path: string): boolean {
  return (
    path === "/smartstore/product-ranking-analyze" ||
    path.startsWith("/smartstore/product-ranking-analyze/") ||
    path === "/smartstore/keyword-analyze" ||
    path.startsWith("/smartstore/keyword-analyze/")
  );
}

function isSmartstoreAuthRequiredApiPath(path: string): boolean {
  return (
    path.startsWith("/api/smartstore/product-ranking-analyze") ||
    path.startsWith("/api/smartstore/keyword-analyze")
  );
}

const SMARTSTORE_ADMIN_ONLY_API_ERROR = "관리자만 사용할 수 있는 기능입니다.";
const LOGIN_REQUIRED_API_ERROR = "로그인이 필요한 기능입니다.";

function isLegacyAuthPath(path: string): boolean {
  if (path.startsWith("/top-blog")) return true;
  if (path.startsWith("/place-analysis")) return true;
  if (path.startsWith("/place-review")) return true;
  if (path === "/place" || path.startsWith("/place/")) return true;
  if (path === "/community" || path.startsWith("/community/")) return true;
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

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (isSmartstoreAuthRequiredApiPath(path)) {
    if (!secret) {
      return NextResponse.json({ ok: false, error: LOGIN_REQUIRED_API_ERROR }, { status: 401 });
    }
    const token = await getToken({ req, secret });
    if (!token) {
      return NextResponse.json({ ok: false, error: LOGIN_REQUIRED_API_ERROR }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (path.startsWith("/api/blog-analysis") || isSmartstoreAdminOnlyApiPath(path)) {
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: isSmartstoreAdminOnlyApiPath(path) ? SMARTSTORE_ADMIN_ONLY_API_ERROR : "FORBIDDEN" },
        { status: 403 }
      );
    }
    const token = await getToken({ req, secret });
    const email = typeof token?.email === "string" ? token.email : "";
    if (!token || !isAdminEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          error: isSmartstoreAdminOnlyApiPath(path) ? SMARTSTORE_ADMIN_ONLY_API_ERROR : "FORBIDDEN",
        },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  if (isSmartstoreAuthRequiredPath(path)) {
    if (!secret) return redirectLogin(req);
    const token = await getToken({ req, secret });
    if (!token) return redirectLogin(req);
    return NextResponse.next();
  }

  if (isSmartstoreAdminOnlyPath(path)) {
    if (!secret) return NextResponse.redirect(new URL("/smartstore", req.url));
    const token = await getToken({ req, secret });
    const email = typeof token?.email === "string" ? token.email : "";
    if (!token || !isAdminEmail(email)) {
      return NextResponse.redirect(new URL("/smartstore", req.url));
    }
    return NextResponse.next();
  }

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

  if (isBlogAnalysisPath(path)) {
    if (!secret) return redirectLogin(req);
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
    "/api/blog-analysis/:path*",
    "/api/smartstore/store-analyze",
    "/api/smartstore/product-ranking-analyze",
    "/api/smartstore/keyword-analyze",
    "/api/smartstore/keyword-analyze/detail",
    "/api/smartstore-review-targets",
    "/api/smartstore-review-sync",
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|woff|ttf|eot|map|txt|xml|json|csv|pdf|wasm|js|css)$).*)",
  ],
};
