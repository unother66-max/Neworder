"use client";

import React, { useEffect, useState, useRef } from "react";
import TopNav from "@/components/top-nav";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";

export default function CommunityEditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  // 🚨 로딩 상태 관리를 위한 변수 추가
  const [isLoading, setIsLoading] = useState(true);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ADMIN_EMAIL = "natalie0@nate.com";
  const currentUserEmail = session?.user?.email?.trim().toLowerCase() || "";
  const isAdmin = status === "authenticated" && currentUserEmail === ADMIN_EMAIL.toLowerCase();

  // 기존 글 데이터 불러오기
  useEffect(() => {
    if (!id) return;
    const fetchPost = async () => {
      try {
        const res = await fetch(`/api/community/${id}`);
        const data = await res.json();
        if (data.ok) {
          setTitle(data.post.title);
          setCategory(data.post.category);
          setContent(data.post.content);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false); // 🚨 데이터를 다 불러오면 로딩 끝!
      }
    };
    fetchPost();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return alert("카테고리를 선택해주세요.");
    if (!title.trim() || !content.trim()) return alert("제목과 내용을 입력해주세요.");
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/community/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, content })
      });
      
      if (res.ok) {
        alert("글이 성공적으로 수정되었습니다! ✨");
        router.push(`/community/${id}`); 
      } else {
        const data = await res.json();
        alert(data.error || "수정에 실패했습니다.");
      }
    } catch(e) {
      alert("오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = category !== "" && title.trim() !== "" && content.trim() !== "";

  // ==========================================
  // 🚨 대망의 지구본 로딩 화면!
  // ==========================================
  if (isLoading) {
    return (
      <>
        <TopNav />
        <div className="min-h-screen bg-white flex flex-col items-center justify-center pb-40">
          {/* 지구본 이미지 (부드럽게 3초에 한 바퀴씩 돌아가도록 설정) */}
          <img 
            src="/globe.svg" 
            alt="Loading" 
            className="w-14 h-14 animate-spin opacity-80 mb-5" 
            style={{ animationDuration: '3s' }} 
          />
          <p className="text-[15px] font-bold text-slate-400">
            글을 불러오는 중입니다...
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-white pt-24 pb-20">
        <div className="mx-auto max-w-[900px] px-6">
          <h1 className="text-[22px] font-black tracking-tight text-[#111827] mb-8 italic">커뮤니티 글 수정</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
               <label className="block text-[14px] font-bold text-slate-800 mb-2">카테고리</label>
               <select 
                 value={category} 
                 onChange={e => setCategory(e.target.value)} 
                 className="w-full border border-slate-200 rounded-[12px] h-[48px] px-4 text-[14px] outline-none focus:border-[#0051FF] bg-white cursor-pointer"
               >
                 <option value="">선택</option>
                 {isAdmin && <option value="공지">공지</option>}
                 <option value="질문">질문</option>
                 <option value="요청">요청</option>
                 <option value="자유">자유</option>
               </select>
            </div>
            <div>
               <label className="block text-[14px] font-bold text-slate-800 mb-2">제목</label>
               <input value={title} onChange={e => setTitle(e.target.value)} type="text" placeholder="제목 입력" className="w-full border border-slate-200 rounded-[12px] h-[48px] px-4 text-[14px] outline-none focus:border-[#0051FF]" />
            </div>
            <div>
               <label className="block text-[14px] font-bold text-slate-800 mb-2">내용</label>
               <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} placeholder="내용을 입력해주세요." className="w-full min-h-[400px] p-5 text-[14px] leading-relaxed border border-slate-200 rounded-[12px] outline-none resize-none focus:border-[#0051FF]" />
            </div>
            
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => router.push(`/community/${id}`)}
                className="w-1/3 h-[56px] rounded-[14px] text-[15px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                취소
              </button>
              <button 
                type="submit" 
                disabled={!isFormValid || isSubmitting}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`relative overflow-hidden w-2/3 h-[56px] rounded-[14px] text-[15px] font-bold transition-all duration-300 ${
                  isFormValid ? "bg-[#333333] text-white" : "bg-[#bfdbfe] text-white cursor-not-allowed"
                }`}
              >
                <span className="relative z-30">{isSubmitting ? "저장 중..." : "수정 완료"}</span>
                {isFormValid && (
                  <div className="pointer-events-none absolute inset-0 z-10 h-full w-full bg-[#0051FF]" style={{ transformOrigin: "left", transform: isHovered ? "scaleX(1)" : "scaleX(0)", transition: "transform 350ms cubic-bezier(0.19, 1, 0.22, 1)" }} />
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}