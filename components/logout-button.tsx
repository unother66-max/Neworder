"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-[10px] bg-[#f1f3f6] px-4 py-2 text-[14px] font-semibold text-[#374151]"
    >
      로그아웃
    </button>
  );
}