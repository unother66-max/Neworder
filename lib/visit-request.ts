import type { NextRequest } from "next/server";

export function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

/** 정적·API·프리페치·RSC 패치 등 과도 집계 제외 */
export function shouldAttemptVisitLog(req: NextRequest): boolean {
  if (req.method !== "GET") return false;
  const url = req.nextUrl;
  if (url.searchParams.has("_rsc")) return false;

  const secPurpose = req.headers.get("Sec-Purpose")?.toLowerCase() ?? "";
  if (secPurpose.includes("prefetch")) return false;
  const purpose = req.headers.get("Purpose")?.toLowerCase() ?? "";
  if (purpose.includes("prefetch")) return false;

  const p = url.pathname;
  if (p.startsWith("/api")) return false;
  if (p.startsWith("/_next")) return false;
  if (
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml"
  ) {
    return false;
  }
  if (
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|woff|ttf|eot|map|txt|xml|json|csv|pdf|wasm|js|css)$/i.test(
      p
    )
  ) {
    return false;
  }
  return true;
}
