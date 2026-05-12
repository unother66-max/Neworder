"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { shouldPersistVisitorEvent } from "@/lib/visit-path-eligibility";

/**
 * 클라 전역 트래킹: 페이지 경로 변경·최초 마운트(새로고침 포함)마다 POST.
 * 세션별 / 일별 세션 저장소로 차단하면 새로고침 시 재요청이 나가지 않아 lastVisit 등이 멈춤.
 */

export default function ScrollTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams?.toString() ?? "";

  useEffect(() => {
    let timer: number | null = null;

    const handleScroll = () => {
      document.body.classList.add("is-scrolling");
      document.documentElement.classList.add("is-scrolling");

      if (timer != null) window.clearTimeout(timer);

      timer = window.setTimeout(() => {
        document.body.classList.remove("is-scrolling");
        document.documentElement.classList.remove("is-scrolling");
      }, 800);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof pathname !== "string" || pathname.length === 0) return;
    if (!shouldPersistVisitorEvent(pathname)) return;
    if (typeof window === "undefined") return;

    const qs = queryString;
    const path = qs ? `${pathname}?${qs}` : pathname;

    const ref = typeof document !== "undefined" ? document.referrer?.trim() : "";
    fetch("/api/internal/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        path,
        referrer: ref && ref.length > 0 ? ref : null,
      }),
    }).catch(() => {});
  }, [pathname, queryString]);

  return null;
}
