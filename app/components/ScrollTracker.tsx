"use client";

import { useEffect } from "react";

export default function ScrollTracker() {
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

  return null;
}

