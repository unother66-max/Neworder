"use client";

import { useState, useRef } from "react";

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  };
  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 80);
  };
  const toggle = () => setVisible((v) => !v);

  return (
    <span className="relative inline-flex items-center">
      {children}
      <button
        type="button"
        className="ml-0.5 inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[9px] font-bold leading-none text-[#9ca3af] transition hover:border-[#6b7280] hover:text-[#6b7280] focus:outline-none"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={toggle}
        aria-label="도움말"
        tabIndex={0}
      >
        ?
      </button>
      {/* Tooltip bubble */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 -translate-x-1/2 whitespace-normal rounded-[10px] bg-[#1f2937] px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-white shadow-lg transition-all duration-150 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
        }`}
        style={{ minWidth: "180px", maxWidth: "220px" }}
      >
        {content}
        {/* Arrow (top side) */}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#1f2937]" />
      </span>
    </span>
  );
}
