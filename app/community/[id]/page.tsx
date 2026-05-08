"use client";

import React, { useEffect, useState } from "react";
import TopNav from "@/components/top-nav";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, User, Calendar, Eye } from "lucide-react";
import { useSession } from "next-auth/react"; 

// 🚨 스와이프 버튼 부품 (원본 그대로 유지)
const SwipeButton = ({ children, onClick, defaultBg = "bg-[#333333]", hoverBg = "bg-[#2563eb]", disabled = false, className = "" }: any) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden transition-all duration-300 text-white font-bold ${defaultBg} ${className} ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
    >
      <span className="relative z-30">{children}</span>
      {!disabled && (
        <div
          className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${hoverBg}`}
          style={{
            transformOrigin: "left",
            transform: isHovered ? "scaleX(1)" : "scaleX(0)",
            transition: "transform 350ms cubic-bezier(0.19, 1, 0.22, 1)",
          }}
        />
      )}
    </button>
  );
};

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();

  const [post, setPost] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [commentInput, setCommentInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  const ADMIN_EMAIL = "natalie0@nate.com";

  const fetchPost = async () => {
    if (!params?.id) return;
    try {
      const res = await fetch(`/api/community/${params.id}`);
      const data = await res.json();
      if (data.ok) {
        setPost(data.post);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPost();
  }, [params?.id]);

  const handleDelete = async () => {
    if (!window.confirm("정말 이 글을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/community/${params.id}`, { method: "DELETE" });
      if (res.ok) {
        alert("글이 삭제되었습니다.");
        router.push("/community");
      }
    } catch (e) {
      alert("오류 발생");
    }
  };

  const handleCommentSubmit = async () => {
    if (!session) return alert("로그인 후 이용해주세요.");
    if (!commentInput.trim()) return alert("내용을 입력해주세요.");
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/community/${params.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput }),
      });
      if (res.ok) {
        setCommentInput(""); 
        fetchPost(); 
      }
    } catch (e) {
      alert("오류 발생");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (!window.confirm("댓글을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/comment/${commentId}`, { method: "DELETE" });
      if (res.ok) fetchPost();
    } catch (e) {
      alert("오류 발생");
    }
  };

  const handleCommentEditSubmit = async (commentId: string) => {
    if (!editCommentText.trim()) return alert("내용을 입력해주세요.");
    try {
      const res = await fetch(`/api/comment/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editCommentText }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        fetchPost();
      }
    } catch (e) {
      alert("오류 발생");
    }
  };

  if (isLoading) return (
    <>
      <TopNav />
      <div className="pt-40 text-center text-slate-400 font-bold">불러오는 중...</div>
    </>
  );
  
  if (!post) return (
    <>
      <TopNav />
      <div className="pt-40 text-center">
        <p className="text-slate-400 font-bold mb-4">글을 찾을 수 없습니다.</p>
        <button onClick={() => router.push('/community')} className="text-blue-500 font-bold">목록으로</button>
      </div>
    </>
  );

  const canEditOrDelete = session?.user?.email === post.author?.email || session?.user?.email === ADMIN_EMAIL;

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-white pb-[72px] pt-16 md:pb-20 md:pt-24">
        <div className="mx-auto max-w-[850px] px-5 sm:px-6">
          
          <button onClick={() => router.push('/community')} className="mb-8 hidden items-center gap-2 text-slate-400 transition-colors hover:text-slate-800 md:flex font-bold">
            <ArrowLeft size={20} /> 목록으로 돌아가기
          </button>

          <div className="mb-6 border-b border-slate-100 pb-6 md:mb-8 md:pb-8">
            <span className="mb-3 inline-block rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-600 md:mb-4 md:px-3 md:text-[12px]">{post.category}</span>
            <h1 className="mb-5 text-[28px] font-black leading-tight text-slate-900 md:mb-6 md:text-[32px]">{post.title}</h1>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400 md:h-10 md:w-10"><User size={18} /></div>
                <div>
                  {/* 🚨 [수정] 본문 작성자 표시 (관리자 이메일일 경우 "포스트랩스" 표시) */}
                  <div className="text-[13px] font-bold text-slate-800 md:text-[14px]">
                    {post.author?.email === ADMIN_EMAIL ? "포스트랩스" : (post.author?.name || "익명")}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-slate-400 md:gap-3 md:text-[12px]">
                    <span className="flex items-center gap-1"><Calendar size={13} /> {new Date(post.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Eye size={13} /> {post.views}</span>
                  </div>
                </div>
              </div>

              {canEditOrDelete && (
                <div className="flex gap-2">
                  <button onClick={() => router.push(`/community/${params.id}/edit`)} className="rounded-full border border-slate-300 bg-white/70 px-3 py-1 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 md:px-4 md:py-1.5 md:text-[13px]">
                    수정
                  </button>
                  <button onClick={handleDelete} className="rounded-full border border-slate-300 bg-white/70 px-3 py-1 text-[12px] font-bold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 md:px-4 md:py-1.5 md:text-[13px]">
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mb-12 min-h-[150px] max-w-[700px] whitespace-pre-wrap text-[15px] leading-[1.75] text-slate-700 md:mb-20 md:min-h-[200px] md:text-[16px] md:leading-[1.8]">{post.content}</div>

          {/* 댓글 영역 */}
          <div className="border-t border-slate-100 pt-6 md:pt-8">
            <h3 className="mb-4 text-[17px] font-bold text-slate-900 md:mb-6 md:text-[18px]">댓글 <span className="text-[#0051FF]">{post.comments?.length || 0}</span></h3>

            <div className="mb-7 rounded-[20px] border border-slate-100 bg-slate-50 p-3 transition-all focus-within:border-[#0051FF] focus-within:bg-white focus-within:shadow-[0_10px_30px_rgba(0,81,255,0.06)] md:mb-10 md:p-4">
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={session ? "댓글을 남겨주세요." : "로그인 후 댓글을 남길 수 있습니다."}
                disabled={!session || isSubmitting}
                className="h-14 w-full resize-none bg-transparent text-[13px] text-slate-800 outline-none md:h-[80px] md:text-[14px]"
              />
              <div className="mt-2 flex justify-end pr-16 md:pr-0">
                <SwipeButton 
                  disabled={!session || isSubmitting || !commentInput.trim()}
                  onClick={handleCommentSubmit}
                  className="rounded-[10px] px-5 py-1.5 text-[12px] md:rounded-[12px] md:px-8 md:py-2.5 md:text-[13px]"
                >
                  {isSubmitting ? "등록 중..." : "등록하기"}
                </SwipeButton>
              </div>
            </div>

            <div className="flex flex-col gap-6 pb-28 md:gap-8 md:pb-20">
              {post.comments?.map((comment: any) => {
                const isCommAuthor = session?.user?.email === comment.author?.email;
                const canManageComm = isCommAuthor || (session?.user?.email === ADMIN_EMAIL);

                return (
                  <div key={comment.id} className="flex gap-4">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden shadow-sm">
                      {comment.author?.image ? <img src={comment.author.image} className="w-full h-full object-cover" /> : <User size={20} />}
                    </div>
                    <div className="flex flex-col w-full pt-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {/* 🚨 [수정] 댓글 작성자 표시 (관리자 이메일일 경우 "포스트랩스" 표시) */}
                          <span className="text-[13px] font-black text-slate-800">
                            {comment.author?.email === ADMIN_EMAIL ? "포스트랩스" : (comment.author?.name || "익명")}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                        </div>
                        {canManageComm && editingCommentId !== comment.id && (
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.content); }} className="rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 md:px-2.5 md:py-1 md:text-[12px]">수정</button>
                            <button onClick={() => handleCommentDelete(comment.id)} className="rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 md:px-2.5 md:py-1 md:text-[12px]">삭제</button>
                          </div>
                        )}
                      </div>

                      {editingCommentId === comment.id ? (
                        <div className="mt-1">
                          <textarea
                            value={editCommentText}
                            onChange={(e) => setEditCommentText(e.target.value)}
                            className="w-full min-h-[70px] bg-slate-50 border border-slate-200 rounded-[12px] p-3 text-[14px] outline-none"
                          />
                          <div className="flex justify-end gap-2 mt-3">
                            <button onClick={() => setEditingCommentId(null)} className="rounded-[8px] border border-slate-300 bg-white/70 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 md:px-4 md:py-2 md:text-[12px]">취소</button>
                            <SwipeButton onClick={() => handleCommentEditSubmit(comment.id)} className="px-5 py-2 rounded-[8px] text-[12px]">
                              저장
                            </SwipeButton>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
