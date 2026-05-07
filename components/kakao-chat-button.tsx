"use client";

import React from "react";

export default function KakaoChatButton() {
  const KAKAO_CHANNEL_URL = "http://pf.kakao.com/_GWxlxbX/chat";

  return (
    <a
      href={KAKAO_CHANNEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      // 🚨 배경색을 bg-black에서 bg-[#333333]으로 변경했습니다.
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[9999] flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-[#333333] px-3.5 py-2.5 text-xs font-black !text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-95 sm:bottom-8 sm:right-8 sm:gap-2 sm:px-5 sm:py-3.5 sm:text-[15px]"
    >
      <svg
        className="h-4 w-4 sm:h-5 sm:w-5"
        viewBox="0 0 24 24"
        fill="white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 3C6.477 3 2 6.537 2 10.9C2 13.568 3.58 15.932 5.996 17.305L4.857 21.467C4.773 21.776 5.112 22.022 5.378 21.844L9.896 18.82C10.575 18.938 11.277 19 12 19C17.523 19 22 15.463 22 11.1C22 6.737 17.523 3 12 3Z" />
      </svg>
      톡상담
    </a>
  );
}
