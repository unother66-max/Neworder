"use client";

import React, { useEffect, useState } from "react";

const MODAL_MS = 320;
const MODAL_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const inputClassPrimary =
  "mt-2 h-[46px] w-full rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-3 text-[14px] shadow-sm outline-none transition-all duration-200 placeholder:text-[#9ca3af] " +
  "focus:border-[#2563eb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.14),0_0_24px_rgba(37,99,235,0.12)] md:h-[50px] md:rounded-[16px] md:px-4 md:text-[15px]";

const inputClassManual =
  "mt-2 h-[46px] w-full rounded-[14px] border border-[#e5e7eb] bg-white px-3 text-[14px] shadow-sm outline-none transition-all duration-200 placeholder:text-[#9ca3af] " +
  "focus:border-[#2563eb] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.14),0_0_22px_rgba(37,99,235,0.1)] md:h-[50px] md:rounded-[16px] md:px-4 md:text-[15px]";

/** 안내 블록 내 URL 변수 강조 — 보라/빨강 대신 톤 다운 블루‑그레이 */
const urlTokenClass = "font-semibold text-[#547095]";

export type SmartstoreProductRegisterModalProps = {
  open: boolean;
  onClose: () => void;
  productUrl: string;
  onProductUrlChange: (value: string) => void;
  onProductUrlKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  errorMessage: string;
  showManualInput: boolean;
  manualName: string;
  onManualNameChange: (value: string) => void;
  manualImageUrl: string;
  onManualImageUrlChange: (value: string) => void;
  saving: boolean;
  onPrimaryAction: () => void;
  primaryButtonLabel: string;
  eyebrow?: string;
  modalTitle?: string;
  /** 예: 상품 URL * — 기본값 "상품 URL" */
  productUrlLabel?: string;
};

export function SmartstoreProductRegisterModal({
  open,
  onClose,
  productUrl,
  onProductUrlChange,
  onProductUrlKeyDown,
  errorMessage,
  showManualInput,
  manualName,
  onManualNameChange,
  manualImageUrl,
  onManualImageUrlChange,
  saving,
  onPrimaryAction,
  primaryButtonLabel,
  eyebrow = "REGISTER PRODUCT",
  modalTitle = "상품 등록",
  productUrlLabel = "상품 URL",
}: SmartstoreProductRegisterModalProps) {
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(false);
  const [primaryHovered, setPrimaryHovered] = useState(false);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [primaryMousePos, setPrimaryMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let rafMain = 0;
    let rafInner = 0;
    let closeTimer = 0;

    if (open) {
      setRendered(true);
      setEntered(false);
      rafMain = requestAnimationFrame(() => {
        rafInner = requestAnimationFrame(() => setEntered(true));
      });
    } else {
      setEntered(false);
      closeTimer = window.setTimeout(() => setRendered(false), MODAL_MS);
    }

    return () => {
      cancelAnimationFrame(rafMain);
      cancelAnimationFrame(rafInner);
      if (closeTimer) window.clearTimeout(closeTimer);
    };
  }, [open]);

  if (!rendered) return null;

  const overlayStyle: React.CSSProperties = {
    opacity: entered ? 1 : 0,
    transition: `opacity ${MODAL_MS}ms ${MODAL_EASE}`,
  };

  const panelStyle: React.CSSProperties = {
    opacity: entered ? 1 : 0,
    transform: entered ? "translateY(0) scale(1)" : "translateY(14px) scale(0.98)",
    transition: `opacity ${MODAL_MS}ms ${MODAL_EASE}, transform ${MODAL_MS}ms ${MODAL_EASE}`,
    willChange: "opacity, transform",
  };

  const handlePrimaryMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPrimaryMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const urlFormatBlock = (
    <div className="mt-4 rounded-[14px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3 md:rounded-[18px]">
      <p className="text-[12px] font-extrabold text-[#4b5563] md:text-[13px]">
        상품 URL 형식{" "}
        <span className="font-bold text-[#6b7280]">
          (상점ID와 상품ID를 꼭 포함하여 추가해주세요.)
        </span>
      </p>
      <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-[#6b7280] md:text-[13px] md:leading-relaxed">
        <li className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
          <span>
            일반 상품:{" "}
            <span className="font-semibold text-[#374151]">
              http://smartstore.naver.com/
              <span className={urlTokenClass}>상점ID</span>/products/
              <span className={urlTokenClass}>상품ID</span>?..
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
          <span>
            브랜드 상품:{" "}
            <span className="font-semibold text-[#374151]">
              http://brand.naver.com/
              <span className={urlTokenClass}>상점ID</span>/products/
              <span className={urlTokenClass}>상품ID</span>?..
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
          <span>
            윈도우 상품:{" "}
            <span className="font-semibold text-[#374151]">
              http://shopping.naver.com/window-products/
              <span className={urlTokenClass}>카테고리</span>/
              <span className={urlTokenClass}>상품ID</span>?..
            </span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
          <span>
            카탈로그 상품:{" "}
            <span className="font-semibold text-[#374151]">
              https://search.shopping.naver.com/catalog/
              <span className={urlTokenClass}>catalogID</span>?..
            </span>
          </span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] font-semibold text-[#6b7280]">
        * 성인상품 중 ‘윈도우 상품’은 등록할 수 없으며, 일반·브랜드 성인상품만 등록 가능합니다.
      </p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-[3px] md:px-4"
      style={overlayStyle}
      aria-hidden={!open}
    >
      <div
        className="max-h-[92vh] w-full max-w-[520px] overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] md:max-h-none md:rounded-[24px]"
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smartstore-register-modal-title"
      >
        <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-4 py-4 md:px-6 md:py-5">
          <div className="flex items-start justify-between gap-3 md:gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280] md:text-[11px] md:tracking-[0.16em]">
                {eyebrow}
              </p>
              <h2
                id="smartstore-register-modal-title"
                className="mt-1.5 text-[18px] font-black tracking-[-0.03em] text-[#111827] md:mt-2 md:text-[22px]"
              >
                {modalTitle}
              </h2>
           
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-[#d1d5db] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb] md:px-3 md:py-2 md:text-[13px]"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="max-h-[calc(92vh-88px)] overflow-y-auto overscroll-contain px-4 py-4 md:max-h-none md:overflow-visible md:px-6 md:py-6">
          {urlFormatBlock}

          <label className="mt-4 block text-[12px] font-bold text-[#4b5563] md:text-[13px]" htmlFor="smartstore-register-product-url">
            {productUrlLabel}
          </label>
          <input
            id="smartstore-register-product-url"
            type="url"
            value={productUrl}
            onChange={(e) => onProductUrlChange(e.target.value)}
            onKeyDown={onProductUrlKeyDown}
            placeholder="https://smartstore.naver.com/…/products/1234567890"
            className={inputClassPrimary}
            autoComplete="off"
          />

          {errorMessage ? (
            <p className="mt-3 rounded-[12px] border border-[#fecaca] bg-white px-3 py-2.5 text-[12px] leading-relaxed text-[#dc2626] md:mt-4 md:rounded-[14px] md:px-4 md:py-3 md:text-[14px]">
              {errorMessage}
            </p>
          ) : null}

          {showManualInput ? (
            <div className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff7f7] px-4 py-4 md:rounded-[16px]">
              <p className="text-[12px] font-extrabold text-[#9f3939]">
                자동 등록에 실패했어요. 수동으로 상품 정보를 입력해 등록할 수 있습니다.
              </p>
              <label className="mt-3 block text-[12px] font-bold text-[#57534e]">상품명</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => onManualNameChange(e.target.value)}
                placeholder="예: 아이폰 케이스"
                className={inputClassManual}
              />
              <label className="mt-3 block text-[12px] font-bold text-[#57534e]">이미지 URL</label>
              <input
                type="url"
                value={manualImageUrl}
                onChange={(e) => onManualImageUrlChange(e.target.value)}
                placeholder="https://...jpg"
                className={inputClassManual}
              />
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              onMouseEnter={() => setCancelHovered(true)}
              onMouseLeave={() => setCancelHovered(false)}
              className={`relative h-[46px] shrink-0 overflow-hidden rounded-[14px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition-all duration-200 md:rounded-[16px] md:h-[50px] ${
                cancelHovered ? "shadow-[0_0_28px_rgba(37,99,235,0.16)] ring-2 ring-[#2563eb]/15" : "hover:bg-[#f9fafb]"
              }`}
            >
              취소
            </button>

            <button
              type="button"
              onMouseEnter={() => setPrimaryHovered(true)}
              onMouseLeave={() => setPrimaryHovered(false)}
              onMouseMove={handlePrimaryMove}
              onClick={onPrimaryAction}
              disabled={Boolean(saving)}
              className={`relative inline-flex h-[46px] min-w-[120px] items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-5 text-[14px] font-bold text-white transition-all duration-300 md:h-[50px] md:min-w-[132px] md:rounded-[16px] md:text-[15px] disabled:opacity-60 ${
                primaryHovered ? "shadow-[0_0_36px_rgba(37,99,235,0.35)]" : ""
              }`}
            >
              <span className="relative z-30 pointer-events-none">{primaryButtonLabel}</span>
              <div
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                style={{
                  transformOrigin: "left",
                  transform: primaryHovered ? "scaleX(1)" : "scaleX(0)",
                  transition: `transform ${MODAL_MS}ms cubic-bezier(0.19, 1, 0.22, 1)`,
                  backgroundColor: "#2563EB",
                }}
              />
              <div
                className={[
                  "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-28 w-28 rounded-full blur-2xl transition-opacity duration-200 ease-out md:h-32 md:w-32",
                  primaryHovered ? "opacity-95" : "opacity-0",
                ].join(" ")}
                style={{
                  left: `${primaryMousePos.x}px`,
                  top: `${primaryMousePos.y}px`,
                  zIndex: 25,
                  backgroundImage:
                    "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.38) 32%, rgba(0,100,255,0.12) 58%, rgba(255,255,255,0) 82%)",
                  mixBlendMode: "soft-light",
                  filter: "saturate(1.1) brightness(1.02) drop-shadow(0 0 10px rgba(255,255,255,0.16))",
                }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
