"use client";

import { useEffect } from "react";

export default function ScrollTracker() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      document.body.classList.add("is-scrolling");

      if (timer) window.clearTimeout(timer);

      timer = window.setTimeout(() => {
        document.body.classList.remove("is-scrolling");
      }, 1000);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}

