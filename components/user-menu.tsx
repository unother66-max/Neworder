"use client";

import { useSession } from "next-auth/react";
import LogoutButton from "./logout-button";

export default function UserMenu() {
  const { data: session } = useSession();

  return (
    <div className="flex items-center gap-3">
      <div className="text-[14px] font-semibold text-[#4b5563]">
        {session?.user?.name || "사용자"}
      </div>
      <LogoutButton />
    </div>
  );
}