"use client";

import { useState } from "react";

export function AdminUserMemoBlock({
  userId,
  initialMemo,
}: {
  userId: string;
  initialMemo: string | null;
}) {
  const [text, setText] = useState(initialMemo ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/user-memo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, adminMemo: text }),
      });
      if (!res.ok) throw new Error("fail");
      setMsg("저장됨");
    } catch {
      setMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500">
        운영 메모
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800 outline-none ring-slate-300/40 placeholder:text-slate-400 focus:border-slate-300 focus:ring-2"
        placeholder="내부 메모 (사용자에게 비공개)"
        maxLength={8000}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        {msg && (
          <span className="text-[11px] font-medium text-slate-500">{msg}</span>
        )}
      </div>
    </div>
  );
}
