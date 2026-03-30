"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function UserMenu() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">

      {/* 마이페이지 */}
      <button onClick={() => router.push("/mypage")}>
        <Image
          src="/icons/user.png"
          alt="user"
          width={24}
          height={24}
          className="hover:opacity-70"
        />
      </button>

      {/* 로그아웃 */}
      <button onClick={() => signOut({ callbackUrl: "/" })}>
        <Image
          src="/icons/logout.png"
          alt="logout"
          width={24}
          height={24}
          className="hover:opacity-70"
        />
      </button>

    </div>
  );
}