"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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

    const path = window.location.pathname;
    const storageKey = `visit_logged_${seoulCalendarDateKey()}_${path}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");

    fetch("/api/internal/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: window.location.pathname,
        referrer: document.referrer || null,
      }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
