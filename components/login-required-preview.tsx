"use client";

import { signIn } from "next-auth/react";
import React, { useCallback, useState } from "react";

export function LoginRequiredModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[24px] border border-white/70 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
        <p className="text-[20px] font-black tracking-[-0.03em] text-[#111827]">
          로그인이 필요한 기능입니다
        </p>
        <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
          지금 화면은 서비스 미리보기입니다. 등록, 분석 실행, 업데이트, 삭제, 자동추적 같은 기능은 로그인 후 사용할 수 있어요.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-[14px] border border-[#e5e7eb] bg-white px-4 text-[13px] font-bold text-[#4b5563] transition hover:bg-[#f8fafc]"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void signIn("kakao", { callbackUrl: window.location.pathname + window.location.search })}
            className="h-11 rounded-[14px] bg-[#111827] px-5 text-[13px] font-black text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-[#2563EB]"
          >
            로그인하고 시작하기
          </button>
        </div>
      </div>
    </div>
  );
}

export function PublicPreviewBanner() {
  return (
    <div className="mx-auto mb-4 max-w-[1240px] rounded-[18px] border border-[#bfdbfe] bg-gradient-to-r from-[#eff6ff] to-white px-4 py-3 text-[12px] font-semibold leading-5 text-[#1e40af] shadow-[0_8px_24px_rgba(37,99,235,0.08)] md:px-5">
      비로그인 미리보기 화면입니다. 샘플 데이터로 기능 구조를 확인할 수 있으며, 실제 등록/분석/추적 기능은 로그인 후 사용할 수 있습니다.
    </div>
  );
}

export function useLoginRequiredPreview(isPreview: boolean) {
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);

  const guardAction = useCallback(
    (e?: React.SyntheticEvent | Event) => {
      if (!isPreview) return false;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setLoginRequiredOpen(true);
      return true;
    },
    [isPreview]
  );

  const previewCapture = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!isPreview) return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest("button")) return;
      guardAction(e);
    },
    [guardAction, isPreview]
  );

  return {
    guardAction,
    loginRequiredOpen,
    previewCapture,
    closeLoginRequired: () => setLoginRequiredOpen(false),
  };
}
