"use client";

import { useEffect } from "react";

import PlaceRankTop300View from "@/components/place-rank-top300-view";

export default function PlaceRankTop300Modal({
  keyword,
  open,
  onClose,
}: {
  keyword: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      data-place-rank-top300-overlay
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111827]/55 p-2 backdrop-blur-[2px] md:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        data-place-rank-top300-modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-rank-top300-modal-title"
        className="flex h-[calc(100dvh-16px)] w-[calc(100vw-16px)] max-w-[1400px] flex-col overflow-hidden rounded-[18px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] md:h-[88vh] md:w-[90vw] md:rounded-[24px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e5e7eb] bg-white px-4 py-3 md:px-6 md:py-4">
          <div className="min-w-0">
            <h2
              id="place-rank-top300-modal-title"
              className="truncate text-[16px] font-black tracking-[-0.02em] text-[#111827] md:text-[21px]"
            >
              「{keyword}」 TOP300 순위
            </h2>
            <p className="mt-0.5 text-[10px] font-semibold text-[#6b7280] md:text-[12px]">
              네이버 PC 플레이스 검색 결과
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="TOP300 순위 모달 닫기"
            autoFocus
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[24px] leading-none text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8fafc]">
          <PlaceRankTop300View mode="modal" keyword={keyword} />
        </div>
      </section>
    </div>
  );
}
