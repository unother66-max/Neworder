"use client";

import React, { useState, useRef } from "react";
import TopNav from "@/components/top-nav";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function CommunityWritePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 🚨 관리자 이메일 설정
  const ADMIN_EMAIL = "natalie0@nate.com";
  
  // 🚨 마법의 코드 적용: 양쪽 다 소문자로 바꾸고 공백을 없애서 비교합니다.
  const currentUserEmail = session?.user?.email?.trim().toLowerCase() || "";
  const isAdmin = status === "authenticated" && currentUserEmail === ADMIN_EMAIL.toLowerCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return alert("카테고리를 선택해주세요.");
    if (!title.trim() || !content.trim()) return alert("제목과 내용을 입력해주세요.");
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, content })
      });
      
      const data = await res.json();
      if (res.ok) {
        alert("등록되었습니다! 🎉");
        window.location.href = "/community";
      } else {
        alert(data.error || "등록에 실패했습니다.");
      }
    } catch(e) {
      alert("오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = category !== "" && title.trim() !== "" && content.trim() !== "";

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-white pt-24 pb-20">
        <div className="mx-auto max-w-[900px] px-6">
          <h1 className="text-[22px] font-black tracking-tight text-[#111827] mb-8 italic">커뮤니티 글 작성</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
               <label className="block text-[14px] font-bold text-slate-800 mb-2">카테고리</label>
               <select 
                 value={category} 
                 onChange={e => setCategory(e.target.value)} 
                 className="w-full border border-slate-200 rounded-[12px] h-[48px] px-4 text-[14px] outline-none focus:border-blue-500 bg-white cursor-pointer"
               >
                 <option value="">선택</option>
                 {/* 관리자일 때만 '공지' 옵션을 보여줍니다. */}
                 {isAdmin && <option value="공지">공지</option>}
                 <option value="질문">질문</option>
                 <option value="요청">요청</option>
                 <option value="자유">자유</option>
               </select>
            </div>
            <div>
               <label className="block text-[14px] font-bold text-slate-800 mb-2">제목</label>
               <input value={title} onChange={e => setTitle(e.target.value)} type="text" placeholder="제목 입력" className="w-full border border-slate-200 rounded-[12px] h-[48px] px-4 text-[14px] outline-none focus:border-blue-500" />
            </div>
            <div>
               <label className="block text-[14px] font-bold text-slate-800 mb-2">내용</label>
               <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} placeholder="내용을 입력해주세요." className="w-full min-h-[400px] p-5 text-[14px] leading-relaxed border border-slate-200 rounded-[12px] outline-none resize-none focus:border-blue-500" />
            </div>
            
            <button 
              type="submit" 
              disabled={!isFormValid || isSubmitting}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className={`relative overflow-hidden w-full h-[56px] rounded-[14px] text-[15px] font-bold transition-all duration-300 ${
                isFormValid ? "bg-[#333333] text-white" : "bg-[#bfdbfe] text-white cursor-not-allowed"
              }`}
            >
              <span className="relative z-30">{isSubmitting ? "작성 중..." : "작성하기"}</span>
              {isFormValid && (
                <div className="pointer-events-none absolute inset-0 z-10 h-full w-full bg-[#2563eb]" style={{ transformOrigin: "left", transform: isHovered ? "scaleX(1)" : "scaleX(0)", transition: "transform 350ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
              )}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}