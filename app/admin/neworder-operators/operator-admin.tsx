"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck, UserPlus } from "lucide-react";

type Role = "STORE_MANAGER" | "ADMIN" | "SUPERADMIN";

type Operator = {
  id: string;
  role: Role;
  isActive: boolean;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    lastVisitAt: string | null;
  };
};

const ROLE_LABEL: Record<Role, string> = {
  STORE_MANAGER: "점장",
  ADMIN: "관리자",
  SUPERADMIN: "최고관리자",
};

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500";
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-50";

export function NewOrderOperatorAdmin() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/neworder-operators", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "조회에 실패했습니다.");
      setOperators(payload.operators);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/neworder-operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장에 실패했습니다.");
      setMessage(success);
      await load();
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "저장에 실패했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await mutate(
      {
        action: "register",
        email: form.get("email"),
        role: form.get("role"),
      },
      "운영자를 등록했습니다."
    );
    if (ok) event.currentTarget.reset();
  }

  return (
    <main className="min-h-dvh bg-slate-50 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"
        >
          <ArrowLeft className="size-4" /> 관리자 화면
        </Link>
        <div className="mt-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-black">뉴오더클럽 운영자 관리</h1>
            <p className="mt-1 text-sm text-slate-500">
              역할은 표시용이며 활성 운영자는 모두 동일한 기능 권한을 가집니다.
            </p>
          </div>
        </div>

        {message && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            {message}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">운영자 등록</h2>
          <p className="mt-1 text-xs text-slate-500">
            해당 이메일로 PostLabs에 한 번 이상 로그인해 User 계정이 생성되어야 합니다.
          </p>
          <form
            onSubmit={register}
            className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]"
          >
            <input
              className={inputClass}
              name="email"
              type="email"
              placeholder="운영자 이메일"
              required
            />
            <select className={inputClass} name="role" defaultValue="STORE_MANAGER">
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button className={buttonClass} disabled={saving}>
              <UserPlus className="size-4" /> 등록
            </button>
          </form>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-slate-100 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">계정</th>
                  <th className="px-4 py-3">표시 역할</th>
                  <th className="px-4 py-3">접근 상태</th>
                  <th className="px-4 py-3">최근 방문</th>
                  <th className="px-4 py-3">수정</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((operator) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    saving={saving}
                    mutate={mutate}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {loading && (
            <div className="grid place-items-center p-8 text-slate-500">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {!loading && operators.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">
              등록된 운영자가 없습니다.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function OperatorRow({
  operator,
  saving,
  mutate,
}: {
  operator: Operator;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    success: string
  ) => Promise<boolean>;
}) {
  const [role, setRole] = useState<Role>(operator.role);
  const [isActive, setIsActive] = useState(operator.isActive);

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        <strong className="block">{operator.user.name || "이름 없음"}</strong>
        <span className="text-xs text-slate-500">{operator.user.email}</span>
      </td>
      <td className="px-4 py-3">
        <select
          className={inputClass}
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          {isActive ? "접근 허용" : "접근 중지"}
        </label>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {operator.user.lastVisitAt
          ? new Date(operator.user.lastVisitAt).toLocaleString("ko-KR")
          : "-"}
      </td>
      <td className="px-4 py-3">
        <button
          className={buttonClass}
          disabled={saving}
          onClick={() =>
            void mutate(
              {
                action: "update",
                id: operator.id,
                role,
                isActive,
              },
              `${operator.user.email || "운영자"} 정보를 수정했습니다.`
            )
          }
        >
          저장
        </button>
      </td>
    </tr>
  );
}
