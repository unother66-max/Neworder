"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [showEmailLogin, setShowEmailLogin] = useState(false);

  return (
    <main className="min-h-screen bg-[#f3f3f4] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] text-center">
        <div className="flex justify-center">
          <img
            src="/logo.png"
            alt="SellerLabs"
            className="h-14 w-auto object-contain"
          />
        </div>

        <h1 className="mt-8 text-[28px] font-black text-black">로그인</h1>

        <button
          onClick={() => signIn("kakao", { callbackUrl: "/place" })}
          className="mt-10 flex h-[62px] w-full items-center justify-center gap-3 rounded-[12px] bg-[#FEE500] text-[18px] font-bold text-black"
        >
          <span className="text-[20px]">💬</span>
          카카오로 시작하기
        </button>

        <button
          onClick={() => setShowEmailLogin((prev) => !prev)}
          className="mt-8 text-[16px] font-semibold text-[#3b82f6]"
        >
          이메일 / 기업회원 로그인 {showEmailLogin ? "▴" : "▾"}
        </button>

        {showEmailLogin && (
          <div className="mt-8">
            <input
              type="email"
              placeholder="이메일 주소"
              className="h-[58px] w-full rounded-[12px] border border-[#dde2ea] bg-white px-5 text-[16px] outline-none placeholder:text-[#b7bfca]"
            />

            <input
              type="password"
              placeholder="비밀번호"
              className="mt-4 h-[58px] w-full rounded-[12px] border border-[#dde2ea] bg-white px-5 text-[16px] outline-none placeholder:text-[#b7bfca]"
            />

            <div className="mt-4 flex items-center justify-between text-[14px] text-[#4b5563]">
              <label className="flex items-center gap-2">
                <input type="checkbox" />
                로그인 상태 유지
              </label>

              <button className="font-semibold text-[#3b82f6]">
                비밀번호를 잊으셨나요?
              </button>
            </div>

            <button
              className="mt-6 h-[58px] w-full rounded-[12px] bg-gradient-to-b from-[#7c3aed] to-[#6d28d9] text-[20px] font-black text-white"
              onClick={() => {
                alert("이메일 로그인은 다음 단계에서 연결할 예정이에요.");
              }}
            >
              로그인
            </button>

            <button
              className="mt-4 h-[58px] w-full rounded-[12px] bg-[#efeff2] text-[18px] font-black text-[#333]"
              onClick={() => {
                alert("기업회원 가입은 다음 단계에서 연결할 예정이에요.");
              }}
            >
              기업회원 가입
            </button>
          </div>
        )}
      </div>
    </main>
  );
}