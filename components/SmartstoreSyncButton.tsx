"use client";

import React, { useCallback } from "react";
import { RefreshCw } from "lucide-react";

export default function SmartstoreSyncButton({
  targetId,
  disabled,
  onDone,
  onError,
}: {
  targetId: string;
  disabled: boolean;
  onDone: (data: any) => void;
  onError: (msg: string) => void;
}) {
  const doSync = useCallback(async () => {
    onError("");
    try {
      const res = await fetch("/api/smartstore-review-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetId }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "동기화 실패");
      }
      onDone(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onDone, onError, targetId]);

  return (
    <button
      type="button"
      onClick={doSync}
      disabled={disabled}
      className="rounded-[12px] bg-[#111827] px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
    >
      <span className="inline-flex items-center gap-2">
        <RefreshCw size={14} className={disabled ? "animate-spin" : ""} />
        {disabled ? "동기화..." : "동기화"}
      </span>
    </button>
  );
}

