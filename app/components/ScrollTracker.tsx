"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function seoulCalendarDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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
    if (typeof window === "undefined" || typeof sessionStorage === "undefined")
      return;

    const qs = queryString;
    const path = qs ? `${pathname}?${qs}` : pathname;
    /** 달력일+path 기준 1회 생략; `?forceVisitLog=1` 또는 localStorage `postlabs_visit_log_force=1`이면 재전송 가능 */
    const storageKey = `visit_logged_${seoulCalendarDateKey()}_${path}`;

    const forceFromQuery =
      new URLSearchParams(queryString).get("forceVisitLog") === "1";
    const forceFromStorage =
      typeof localStorage !== "undefined" &&
      localStorage.getItem("postlabs_visit_log_force") === "1";
    const force = forceFromQuery || forceFromStorage;

    if (!force && sessionStorage.getItem(storageKey)) return;
    if (!force) sessionStorage.setItem(storageKey, "1");

    const ref = document.referrer?.trim();
    fetch("/api/internal/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        referrer: ref && ref.length > 0 ? ref : null,
      }),
    }).catch(() => {});
  }, [pathname, queryString]);

  return null;
}
