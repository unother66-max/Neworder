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
      <main className="min-h-screen bg-white pt-24 pb-20">
        <div className="mx-auto max-w-[850px] px-6">
          
          <button onClick={() => router.push('/community')} className="flex items-center gap-2 text-slate-400 hover:text-slate-800 transition-colors mb-8 font-bold">
            <ArrowLeft size={20} /> 목록으로 돌아가기
          </button>

          <div className="border-b border-slate-100 pb-8 mb-8">
            <span className="inline-block bg-blue-50 text-blue-600 text-[12px] font-black px-3 py-1 rounded-md mb-4">{post.category}</span>
            <h1 className="text-[32px] font-black text-slate-900 leading-tight mb-6">{post.title}</h1>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><User size={20} /></div>
                <div>
                  {/* 🚨 [수정] 본문 작성자 표시 (관리자 이메일일 경우 "포스트랩스" 표시) */}
                  <div className="text-[14px] font-bold text-slate-800">
                    {post.author?.email === ADMIN_EMAIL ? "포스트랩스" : (post.author?.name || "익명")}
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(post.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Eye size={14} /> {post.views}</span>
                  </div>
                </div>
              </div>

              {canEditOrDelete && (
                <div className="flex gap-2">
                  <SwipeButton defaultBg="bg-slate-400" hoverBg="bg-[#2563eb]" onClick={() => router.push(`/community/${params.id}/edit`)} className="px-4 py-1.5 rounded-full text-[13px]">
                    수정
                  </SwipeButton>
                  <SwipeButton defaultBg="bg-slate-400" hoverBg="bg-red-500" onClick={handleDelete} className="px-4 py-1.5 rounded-full text-[13px]">
                    삭제
                  </SwipeButton>
                </div>
              )}
            </div>
          </div>

          <div className="text-[16px] text-slate-700 leading-[1.8] min-h-[200px] whitespace-pre-wrap mb-20">{post.content}</div>

          {/* 댓글 영역 */}
          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-[18px] font-bold text-slate-900 mb-6">댓글 <span className="text-[#0051FF]">{post.comments?.length || 0}</span></h3>

            <div className="mb-10 bg-slate-50 p-4 rounded-[20px] border border-slate-100 focus-within:border-[#0051FF] focus-within:bg-white focus-within:shadow-[0_10px_30px_rgba(0,81,255,0.06)] transition-all">
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={session ? "댓글을 남겨주세요." : "로그인 후 댓글을 남길 수 있습니다."}
                disabled={!session || isSubmitting}
                className="w-full h-[80px] bg-transparent text-[14px] outline-none resize-none text-slate-800"
              />
              <div className="flex justify-end mt-2">
                <SwipeButton 
                  disabled={!session || isSubmitting || !commentInput.trim()}
                  onClick={handleCommentSubmit}
                  className="px-8 py-2.5 rounded-[12px] text-[13px]"
                >
                  {isSubmitting ? "등록 중..." : "등록하기"}
                </SwipeButton>
              </div>
            </div>

            <div className="flex flex-col gap-8 pb-20">
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
                            <button onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.content); }} className="text-[12px] font-bold text-slate-300 hover:text-blue-500 transition-colors">수정</button>
                            <button onClick={() => handleCommentDelete(comment.id)} className="text-[12px] font-bold text-slate-300 hover:text-red-500 transition-colors">삭제</button>
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
                            <button onClick={() => setEditingCommentId(null)} className="px-4 py-2 bg-slate-100 text-slate-500 text-[12px] font-bold rounded-[8px] hover:bg-slate-200 transition-colors">취소</button>
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